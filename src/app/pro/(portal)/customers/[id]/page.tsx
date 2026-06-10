import { notFound, redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';
import CustomerDetailClient, { type CustomerDetail, type CustomerLead } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Customer' },
    robots: { index: false, follow: false },
};

function extractSuburb(address: string | null): string {
    if (!address) return '';
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return parts[1] ?? parts[0] ?? '';
}

type CustomerRow = {
    id: string;
    provider_id: string;
    homeowner_user_id: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
};
type DiagRef = { title: string | null; customer_address: string | null };
type EventRow = {
    id: string;
    created_at: string;
    diagnosis_trade: string | null;
    diagnoses: DiagRef | DiagRef[] | null;
};

export default async function CustomerDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/pro/auth/login?next=/pro/customers/${id}`);

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) notFound();

    const admin = await createSupabaseAdminClient();
    const { data: customer } = await admin
        .from('provider_customers')
        .select('id, provider_id, homeowner_user_id, name, phone, email, address')
        .eq('id', id)
        .maybeSingle();
    const c = customer as CustomerRow | null;
    if (!c || c.provider_id !== providerId) notFound();

    // This customer's leads with this Pro (Mendr-account customers only).
    let leads: CustomerLead[] = [];
    if (c.homeowner_user_id) {
        const { data: diags } = await admin
            .from('diagnoses')
            .select('id')
            .eq('user_id', c.homeowner_user_id);
        const ids = (diags ?? []).map((d) => (d as { id: string }).id);
        if (ids.length > 0) {
            const { data: events } = await admin
                .from('provider_contact_events')
                .select('id, created_at, diagnosis_trade, diagnoses(title, customer_address)')
                .eq('provider_id', providerId)
                .in('conversation_id', ids)
                .order('created_at', { ascending: false });
            leads = ((events ?? []) as EventRow[]).map((e) => {
                const diag = Array.isArray(e.diagnoses) ? e.diagnoses[0] : e.diagnoses;
                return {
                    id: e.id,
                    createdAt: e.created_at,
                    title: diag?.title || e.diagnosis_trade || 'Enquiry',
                    suburb: extractSuburb(diag?.customer_address ?? null),
                };
            });
        }
    }

    const detail: CustomerDetail = {
        id: c.id,
        name: c.name ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        address: c.address ?? '',
    };

    return <CustomerDetailClient detail={detail} leads={leads} />;
}
