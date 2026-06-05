import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { checkRateLimit } from '@/lib/rate-limit-config';
import {
    createSupabaseAdminClient,
    createSupabaseServerClient,
} from '@/lib/auth/supabase-server';
import { notifyContractorOfLead } from '@/lib/providers/notify-contractor-of-lead';
import { stampFirstContact } from '@/lib/analytics/funnel';

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
        consentTextVersion?: unknown;
    };

    let body: BodyShape | null = null;

    try {
        body = (await req.json().catch(() => null)) as BodyShape | null;
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const providerId = typeof body?.providerId === 'string' ? body.providerId.trim() : '';
    const diagnosisId = typeof body?.diagnosisId === 'string' ? body.diagnosisId.trim() : '';
    const homeownerWhatsappRaw =
        typeof body?.homeownerWhatsapp === 'string' ? body.homeownerWhatsapp.trim() || null : null;
    const consentTextVersion =
        typeof body?.consentTextVersion === 'string' ? body.consentTextVersion.trim() || null : null;
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

    // Identify the homeowner from their session (web path). The WhatsApp bot
    // path has no session and passes homeownerWhatsapp directly. When a logged-in
    // homeowner contacts, fall back to their stored profile number so the lead is
    // identified even if the client did not send one.
    let homeownerUserId: string | null = null;
    let homeownerPhone: string | null = null;
    let homeownerName: string | null = null;
    let homeownerEmail: string | null = null;
    try {
        const ssr = await createSupabaseServerClient();
        const {
            data: { user },
        } = await ssr.auth.getUser();
        if (user?.id) {
            homeownerUserId = user.id;
            homeownerEmail = user.email ?? null;
            const { data: profile } = await admin
                .from('profiles')
                .select('phone, first_name, surname')
                .or(`id.eq.${user.id},user_id.eq.${user.id}`)
                .maybeSingle();
            const prof = profile as
                | { phone?: string | null; first_name?: string | null; surname?: string | null }
                | null;
            const p = prof?.phone;
            if (typeof p === 'string' && p.trim()) homeownerPhone = p.trim();
            const nm = [prof?.first_name, prof?.surname].filter(Boolean).join(' ').trim();
            if (nm) homeownerName = nm;
        }
    } catch {
        // Non-fatal — proceed as an anonymous/bot contact.
    }

    const homeownerWhatsapp = homeownerWhatsappRaw ?? homeownerPhone;

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

        // Record the POPIA consent that authorised sharing this homeowner's
        // identity with this Pro. Best-effort; never fails the contact. Only for
        // logged-in homeowners (the web consent gate); the bot path has no user.
        if (homeownerUserId) {
            const { error: consentError } = await admin.from('lead_contact_consents').insert({
                user_id: homeownerUserId,
                provider_id: providerId,
                diagnosis_id: diagnosisId,
                channel,
                consent_text_version: consentTextVersion,
            });
            if (consentError) {
                console.warn('[contact/contractor] consent record skipped:', consentError.message);
            }

            // Seed the Pro's CRM with this homeowner. Insert-only (ignoreDuplicates)
            // so a Pro's later manual edits to the customer are never overwritten.
            const { error: customerError } = await admin.from('provider_customers').upsert(
                {
                    provider_id: providerId,
                    homeowner_user_id: homeownerUserId,
                    name: homeownerName,
                    phone: homeownerWhatsapp,
                    email: homeownerEmail,
                },
                { onConflict: 'provider_id,homeowner_user_id', ignoreDuplicates: true }
            );
            if (customerError) {
                console.warn('[contact/contractor] customer seed skipped:', customerError.message);
            }
        }
    }

    // Durable funnel stamp for the "Contacted" stage (first write wins), plus the
    // explicit confirmation signal: contacting a contractor implies the homeowner
    // accepted the diagnosis. Both are best-effort and must never fail the contact.
    await stampFirstContact(diagnosisId);
    const { error: confirmError } = await admin
        .from('diagnoses')
        .update({ diagnosis_confirmed: true })
        .eq('id', diagnosisId);
    if (confirmError) {
        console.warn('[contact/contractor] diagnosis_confirmed update skipped:', confirmError.message);
    }

    return NextResponse.json({ ok: true });
}
