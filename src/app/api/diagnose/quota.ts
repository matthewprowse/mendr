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
 *   - Sets `scandio_anon=<uuid>` cookie for anonymous callers when absent.
 *   - Returns a 429 Response when quota exceeded; otherwise null.
 *   - All Supabase failures are non-fatal — request is allowed through.
 */

import type { NextRequest } from 'next/server';
import { isRateLimitBypassed } from '@/lib/rate-limit-config';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';

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

    const isFirstMessage =
        !body?.history ||
        !Array.isArray(body.history) ||
        (body.history as unknown[]).length === 0;

    const disableDiagnosisQuota =
        process.env.DISABLE_DIAGNOSIS_DAILY_QUOTA === 'true' || isRateLimitBypassed(req);

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
        const cookieHeader = req.headers.get('cookie') || '';
        const match = cookieHeader.match(/scandio_anon=([a-f0-9-]{36})/);
        quotaAnonKey = match?.[1] ?? null;
        if (!quotaAnonKey) {
            quotaAnonKey = crypto.randomUUID();
            extraHeaders['Set-Cookie'] =
                `scandio_anon=${quotaAnonKey}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; HttpOnly`;
        }
    }

    const limit = quotaUserId ? 10 : 3;
    const today = new Date().toISOString().split('T')[0];

    try {
        const admin = await createSupabaseAdminClient();
        const { data: rpcData, error: rpcError } = await admin.rpc(
            'increment_diagnosis_quota',
            {
                p_user_id: quotaUserId ?? null,
                p_anon_key: quotaAnonKey ?? null,
                p_date: today,
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
                                : `You have used all ${limit} free diagnoses for today. Sign in for more.`,
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
