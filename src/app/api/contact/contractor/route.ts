import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { notifyContractorOfLead } from '@/lib/providers/notify-contractor-of-lead';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
    return UUID_RE.test(value);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'contactContractor');
    if (limited) return limited;

    type BodyShape = {
        providerId?: unknown;
        diagnosisId?: unknown;
        homeownerWhatsapp?: unknown;
        channel?: unknown;
    };

    let body: BodyShape | null = null;

    try {
        body = (await req.json().catch(() => null)) as BodyShape | null;
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const providerId = typeof body?.providerId === 'string' ? body.providerId.trim() : '';
    const diagnosisId = typeof body?.diagnosisId === 'string' ? body.diagnosisId.trim() : '';
    const homeownerWhatsapp =
        typeof body?.homeownerWhatsapp === 'string' ? body.homeownerWhatsapp.trim() || null : null;
    const channelRaw = body?.channel;
    const channel =
        channelRaw === 'phone' || channelRaw === 'email' || channelRaw === 'whatsapp'
            ? channelRaw
            : 'whatsapp';

    if (!providerId || !isUuid(providerId)) {
        return NextResponse.json({ error: 'providerId must be a valid UUID.' }, { status: 400 });
    }
    if (!diagnosisId || !isUuid(diagnosisId)) {
        return NextResponse.json({ error: 'diagnosisId must be a valid UUID.' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();

    // Verify provider exists and is active
    const { data: provider, error: providerError } = await admin
        .from('providers')
        .select('id')
        .eq('id', providerId)
        .eq('is_active', true)
        .maybeSingle();

    if (providerError) {
        console.error('[contact/contractor] provider fetch error:', providerError);
        return NextResponse.json({ error: 'Failed to verify provider.' }, { status: 500 });
    }
    if (!provider) {
        return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
    }

    // Fetch diagnosis to extract trade
    const { data: diagnosis, error: diagnosisError } = await admin
        .from('diagnoses')
        .select('diagnosis')
        .eq('id', diagnosisId)
        .maybeSingle();

    if (diagnosisError) {
        console.error('[contact/contractor] diagnosis fetch error:', diagnosisError);
        return NextResponse.json({ error: 'Failed to fetch diagnosis.' }, { status: 500 });
    }

    const diagData = diagnosis?.diagnosis as { trade?: string } | null | undefined;
    const diagnosisTrade = typeof diagData?.trade === 'string' ? diagData.trade : null;

    // Build dedup key
    const dedupeKey = createHash('sha256')
        .update(`${providerId}:${diagnosisId}:${channel}`)
        .digest('hex');

    const { data: insertedRows, error: upsertError } = await admin
        .from('provider_contact_events')
        .upsert(
            {
                provider_id: providerId,
                conversation_id: diagnosisId,
                channel,
                dedupe_key: dedupeKey,
                homeowner_whatsapp: homeownerWhatsapp,
                diagnosis_trade: diagnosisTrade,
            },
            { onConflict: 'dedupe_key', ignoreDuplicates: true }
        )
        .select('id');

    if (upsertError) {
        console.error('[contact/contractor] upsert error:', upsertError);
        return NextResponse.json({ error: 'Failed to record contact event.' }, { status: 500 });
    }

    // With `ignoreDuplicates` (ON CONFLICT DO NOTHING), PostgREST returns the
    // inserted rows only — a duplicate tap yields an empty array. Fire the
    // realtime lead alert exactly once, for genuinely new contact events.
    const isNewEvent = Array.isArray(insertedRows) && insertedRows.length > 0;
    if (isNewEvent) {
        // Fire-and-forget: the contractor alert must never fail the contact
        // request. The notify helper applies its own `notify_realtime` opt-out,
        // active/suppression checks, and never throws (returns { ok, reason }).
        void notifyContractorOfLead({
            contractorId: providerId,
            diagnosisId,
            homeownerWhatsapp,
        }).catch((err) => {
            console.error('[contact/contractor] lead notification error:', err);
        });
    }

    return NextResponse.json({ ok: true });
}
