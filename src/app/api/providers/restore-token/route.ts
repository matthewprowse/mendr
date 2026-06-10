// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getISOWeekKey } from '@/lib/providers/ranking';
import { logAiEvent } from '@/lib/ai/ai-logging';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { resolveDiagnosisIdentity, ownsDiagnosis } from '@/lib/diagnosis/ownership';

type RestoreTokenBody = {
    providerId?: string;
    conversationId?: string;
    channel?: 'phone' | 'email' | 'whatsapp';
};

const CHANNELS = new Set(['phone', 'email', 'whatsapp']);
const WEEKLY_CAP = 5;
const DEDUPE_WINDOW_MS = 45_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'restoreToken');
    if (limited) return limited;

    try {
        const body = (await req.json().catch(() => null)) as RestoreTokenBody | null;
        const providerId = typeof body?.providerId === 'string' ? body.providerId.trim() : '';
        const conversationId =
            typeof body?.conversationId === 'string' ? body.conversationId.trim() : '';
        const channel = typeof body?.channel === 'string' ? body.channel.trim() : '';

        if (!providerId || !conversationId || !CHANNELS.has(channel)) {
            return NextResponse.json(
                { error: 'providerId, conversationId and valid channel are required' },
                { status: 400 }
            );
        }

        const admin = await createSupabaseAdminClient();

        // Finding H5: this records a contact event and credits a rotation token
        // for a provider. Bind it to a conversation the caller actually owns so
        // an unrelated caller cannot inflate any provider's contact events.
        const identity = await resolveDiagnosisIdentity(req);
        const { data: convo } = await admin
            .from('diagnoses')
            .select('user_id, anon_key')
            .eq('id', conversationId)
            .maybeSingle();
        if (!convo || !ownsDiagnosis(convo, identity)) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const weekKey = getISOWeekKey();
        const now = new Date();
        const nowIso = now.toISOString();
        const cutoffIso = new Date(now.getTime() - DEDUPE_WINDOW_MS).toISOString();

        const dedupeKey = `${providerId}:${conversationId}:${channel}:${weekKey}`;
        const { data: recentEvent } = await admin
            .from('provider_contact_events')
            .select('id, created_at')
            .eq('dedupe_key', dedupeKey)
            .gte('created_at', cutoffIso)
            .limit(1)
            .maybeSingle();

        if (recentEvent?.id) {
            logAiEvent({
                endpoint: 'contact-intent',
                status: 'ok',
                durationMs: 0,
                meta: { providerId, conversationId, channel, deduped: true },
            });
            return NextResponse.json({ ok: true, deduped: true });
        }

        await admin.from('provider_contact_events').insert({
            provider_id: providerId,
            conversation_id: conversationId,
            channel,
            dedupe_key: dedupeKey,
            created_at: nowIso,
        });

        const { data: tokenRow } = await admin
            .from('provider_rotation_tokens')
            .select('tokens_remaining')
            .eq('provider_id', providerId)
            .eq('week_key', weekKey)
            .maybeSingle();

        const current = Number(tokenRow?.tokens_remaining ?? WEEKLY_CAP);
        const next = Math.min(WEEKLY_CAP, Math.max(0, current + 1));

        await admin.from('provider_rotation_tokens').upsert(
            {
                provider_id: providerId,
                week_key: weekKey,
                tokens_remaining: next,
            },
            { onConflict: 'provider_id,week_key' }
        );

        logAiEvent({
            endpoint: 'contact-intent',
            status: 'ok',
            durationMs: 0,
            meta: { providerId, conversationId, channel, deduped: false, tokensRemaining: next },
        });
        return NextResponse.json({ ok: true, deduped: false, tokensRemaining: next });
    } catch (error) {
        logAiEvent({
            endpoint: 'contact-intent',
            status: 'error',
            durationMs: 0,
            meta: { error: (error as Error)?.message || 'Failed to restore token' },
        });
        return NextResponse.json(
            { error: (error as Error)?.message || 'Failed to restore token' },
            { status: 500 }
        );
    }
}
