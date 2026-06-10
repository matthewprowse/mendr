/* eslint-disable no-console */
/**
 * Daily diagnosis quota check for /api/diagnose.
 *
 * Extracted in Phase 2 from `route.ts`. Encapsulates the atomic Supabase RPC
 * call (`increment_diagnosis_quota`) and the anonymous-user cookie issuance.
 *
 * Behaviour is preserved verbatim from the original inline block:
 *   - Only counts FIRST messages in a conversation (history empty / missing).
 *   - Skips the `analysisPhase === 'image_thought_only'` warm-up call.
 *   - Skips entirely when `DISABLE_DIAGNOSIS_DAILY_QUOTA=true` or rate-limit
 *     bypass is in effect.
 *   - Sets `mendr_anon=<uuid>` cookie for anonymous callers when absent.
 *   - Returns a 429 Response when quota exceeded; otherwise null.
 *   - All Supabase failures are non-fatal — request is allowed through.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { isRateLimitBypassed, killSwitchActive } from '@/lib/rate-limit-config';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { readAnonKey, mintAnonCookie } from '@/lib/diagnosis/ownership';

/**
 * Anonymous quota key (finding H3). Keying the weekly cap on the anonymous
 * cookie let a scripted caller reset it by simply dropping the cookie. Key it on
 * the client IP instead (hashed, so we never store a raw IP in diagnosis_usage)
 * so rotation no longer resets the cap. The cookie is still issued below — it is
 * the diagnosis ownership key (see lib/diagnosis/ownership.ts) — but it no
 * longer governs the quota. Falls back to the cookie only when no IP is
 * available (e.g. local dev).
 */
function clientIp(req: NextRequest): string | null {
    const forwarded = req.headers.get('x-forwarded-for') || '';
    return forwarded.split(',')[0]?.trim() || null;
}

function anonQuotaKey(req: NextRequest, cookieKey: string): string {
    const ip = clientIp(req);
    if (!ip) return cookieKey;
    return 'ip:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 40);
}

/**
 * Free-diagnosis slot caps (Phase 2 of the onboarding plan). Logged-in
 * homeowners get a daily allowance; anonymous visitors get a weekly one, which
 * nudges signup while keeping the wow moment intact. Both are dialled here.
 */
const LOGGED_IN_DAILY_LIMIT = 3;
const ANON_WEEKLY_LIMIT = 3;

/**
 * UTC start-of-ISO-week (Monday) as a YYYY-MM-DD string. Anonymous quota is
 * bucketed by this date so a whole week shares one counter (3 per week). The
 * quota RPC keys on the date string, so no RPC change is needed.
 */
function isoWeekStartUtc(now: Date): string {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = date.getUTCDay(); // 0=Sun .. 6=Sat
    const shiftToMonday = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + shiftToMonday);
    return date.toISOString().split('T')[0];
}

export interface QuotaCheckResult {
    /** When non-null, the caller should return this Response immediately. */
    blockingResponse: Response | null;
    /** Extra response headers to merge into the eventual success response (e.g. Set-Cookie). */
    extraHeaders: Record<string, string>;
}

export interface QuotaCheckParams {
    req: NextRequest;
    /** Parsed request body (peek). Used to detect first message + image_thought_only. */
    body: Record<string, unknown> | null;
}

export async function checkDiagnosisQuota(
    params: QuotaCheckParams,
): Promise<QuotaCheckResult> {
    const { req, body } = params;
    const extraHeaders: Record<string, string> = {};

    // NOTE (finding H3, partial): first-message detection still trusts the
    // client-supplied `history`, so a scripted caller can send a dummy history
    // entry to skip the increment entirely. A robust fix must decide this
    // server-side from a conversation identity, but the initial /api/diagnose
    // call has no conversationId yet and the chat flow is multi-turn, so this
    // needs a server-issued per-conversation token and runtime verification —
    // tracked separately. The IP-keyed quota below already closes the simpler
    // cookie-rotation bypass.
    const isFirstMessage =
        !body?.history ||
        !Array.isArray(body.history) ||
        (body.history as unknown[]).length === 0;

    const disableDiagnosisQuota =
        killSwitchActive('DISABLE_DIAGNOSIS_DAILY_QUOTA') || isRateLimitBypassed(req);

    const skipQuotaIncrement = body?.analysisPhase === 'image_thought_only';

    if (!isFirstMessage || disableDiagnosisQuota || skipQuotaIncrement) {
        return { blockingResponse: null, extraHeaders };
    }

    let quotaUserId: string | null = null;
    let quotaAnonKey: string | null = null;

    try {
        const serverClient = await createSupabaseServerClient();
        const {
            data: { user },
        } = await serverClient.auth.getUser();
        if (user?.id) quotaUserId = user.id;
    } catch {
        // If SSR client fails, fall through to anonymous path.
    }

    if (!quotaUserId) {
        // Preserve/issue the anonymous ownership cookie (mendr_anon, falling back
        // to the legacy scandio_anon for existing callers) — but derive the quota
        // key from the IP so dropping the cookie does not reset the weekly cap
        // (finding H3). Cookie read/mint is shared with diagnosis ownership.
        let cookieKey = readAnonKey(req);
        if (!cookieKey) {
            cookieKey = crypto.randomUUID();
            extraHeaders['Set-Cookie'] = mintAnonCookie(cookieKey);
        }
        quotaAnonKey = anonQuotaKey(req, cookieKey);
    }

    // Logged-in: daily allowance, bucketed by calendar day. Anonymous: weekly
    // allowance, bucketed by ISO-week-start so the week shares one counter.
    const now = new Date();
    const limit = quotaUserId ? LOGGED_IN_DAILY_LIMIT : ANON_WEEKLY_LIMIT;
    const bucketDate = quotaUserId
        ? now.toISOString().split('T')[0]
        : isoWeekStartUtc(now);

    try {
        const admin = await createSupabaseAdminClient();
        const { data: rpcData, error: rpcError } = await admin.rpc(
            'increment_diagnosis_quota',
            {
                p_user_id: quotaUserId ?? null,
                p_anon_key: quotaAnonKey ?? null,
                p_date: bucketDate,
            },
        );

        if (rpcError) {
            console.warn('Quota RPC failed, allowing through:', rpcError.message);
        } else {
            const newCount = rpcData as number;
            if (newCount > limit) {
                return {
                    blockingResponse: new Response(
                        JSON.stringify({
                            error: 'quota_exceeded',
                            limit,
                            used: newCount,
                            message: quotaUserId
                                ? `You have used all ${limit} diagnoses for today. Your quota resets at midnight.`
                                : `You have used all ${limit} free diagnoses for this week. Sign in for more.`,
                        }),
                        {
                            status: 429,
                            headers: {
                                'Content-Type': 'application/json',
                                ...extraHeaders,
                            },
                        },
                    ),
                    extraHeaders,
                };
            }
        }
    } catch (quotaErr) {
        console.warn('Quota check skipped (error):', quotaErr);
    }

    return { blockingResponse: null, extraHeaders };
}
