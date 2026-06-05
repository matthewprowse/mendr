import { notFound, redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';
import { formatSaPhoneLocal } from '@/lib/phone';
import EnquiryDetailClient, { type EnquiryDetail } from './client';
import type { LeadStatus } from '../client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Enquiry' },
    robots: { index: false, follow: false },
};

function extractSuburb(address: string | null): string {
    if (!address) return '';
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return parts[1] ?? parts[0] ?? '';
}

function toStrings(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((v) => {
            if (typeof v === 'string') return v;
            if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string') {
                return (v as { url: string }).url;
            }
            return '';
        })
        .filter(Boolean);
}

function str(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

type DiagRow = {
    title: string | null;
    diagnosis: Record<string, unknown> | null;
    image_urls: unknown;
    urgency_key: string | null;
    primary_trade: string | null;
    customer_address: string | null;
};
type StateRow = { status: LeadStatus | null; notes: string | null };

export default async function EnquiryDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/pro/auth/login?next=/pro/leads/${id}`);

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) notFound();

    const admin = await createSupabaseAdminClient();
    const { data: event } = await admin
        .from('provider_contact_events')
        .select(
            'id, created_at, channel, homeowner_whatsapp, conversation_id, diagnosis_trade, provider_id, diagnoses(title, diagnosis, image_urls, urgency_key, primary_trade, customer_address), lead_states(status, notes)'
        )
        .eq('id', id)
        .maybeSingle();

    if (!event || (event as { provider_id: string }).provider_id !== providerId) {
        notFound();
    }

    const e = event as {
        id: string;
        created_at: string;
        channel: string | null;
        homeowner_whatsapp: string | null;
        conversation_id: string | null;
        diagnosis_trade: string | null;
        diagnoses: DiagRow | DiagRow[] | null;
        lead_states: StateRow | StateRow[] | null;
    };
    const diag = (Array.isArray(e.diagnoses) ? e.diagnoses[0] : e.diagnoses) ?? null;
    const state = (Array.isArray(e.lead_states) ? e.lead_states[0] : e.lead_states) ?? null;
    const blob = (diag?.diagnosis ?? {}) as Record<string, unknown>;

    // Identity is shown unless the homeowner has revoked consent for this lead.
    let showIdentity = true;
    if (e.conversation_id) {
        const { data: consents } = await admin
            .from('lead_contact_consents')
            .select('revoked_at')
            .eq('provider_id', providerId)
            .eq('diagnosis_id', e.conversation_id);
        const rows = (consents ?? []) as { revoked_at: string | null }[];
        if (rows.length > 0) {
            showIdentity = rows.some((r) => !r.revoked_at);
        }
    }

    const whatsappNumber = showIdentity ? e.homeowner_whatsapp : null;

    const detail: EnquiryDetail = {
        id: e.id,
        createdAt: e.created_at,
        channel: e.channel,
        status: state?.status ?? 'new',
        notes: state?.notes ?? '',
        contactNumber: whatsappNumber ? formatSaPhoneLocal(whatsappNumber) : null,
        whatsappNumber: whatsappNumber ?? null,
        title: diag?.title || str(blob.trade_detail) || 'Home fault enquiry',
        trade: e.diagnosis_trade ?? diag?.primary_trade ?? str(blob.trade),
        suburb: extractSuburb(diag?.customer_address ?? null),
        urgency: diag?.urgency_key ?? str(blob.urgency_key),
        diagnosisText: str(blob.message) ?? str(blob.diagnosis),
        actionRequired: str(blob.action_required),
        estimatedCost: str(blob.estimated_cost),
        images: toStrings(diag?.image_urls),
    };

    return <EnquiryDetailClient detail={detail} />;
}
