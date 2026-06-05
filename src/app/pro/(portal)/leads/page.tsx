import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import { formatSaPhoneLocal } from '@/lib/phone';
import LeadsClient, { type LeadRow, type LeadStatus } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Leads' },
    robots: { index: false, follow: false },
};

function extractSuburb(address: string | null): string {
    if (!address) return '';
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return parts[1] ?? parts[0] ?? '';
}

type DiagRef = { title: string | null; primary_trade: string | null; customer_address: string | null };
type StateRef = { status: LeadStatus | null };
type EventRow = {
    id: string;
    created_at: string;
    channel: string | null;
    homeowner_whatsapp: string | null;
    diagnosis_trade: string | null;
    conversation_id: string | null;
    diagnoses: DiagRef | DiagRef[] | null;
    lead_states: StateRef | StateRef[] | null;
};

export default async function ProLeadsPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/leads');

    const { providerId, pending } = await getProviderState(user.id);

    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Leads</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. Your leads will appear here once your business is verified.'
                            : 'Your business is not linked to a profile yet.'}
                    </p>
                </div>
                {pending ? null : (
                    <Button asChild className="w-fit">
                        <Link href="/pro/claim">Claim Your Business</Link>
                    </Button>
                )}
            </div>
        );
    }

    const admin = await createSupabaseAdminClient();

    const [eventsRes, consentsRes] = await Promise.all([
        admin
            .from('provider_contact_events')
            .select(
                'id, created_at, channel, homeowner_whatsapp, diagnosis_trade, conversation_id, diagnoses(title, primary_trade, customer_address), lead_states(status)'
            )
            .eq('provider_id', providerId)
            .order('created_at', { ascending: false }),
        admin
            .from('lead_contact_consents')
            .select('diagnosis_id, revoked_at')
            .eq('provider_id', providerId),
    ]);

    const activeByDiag = new Set<string>();
    const anyByDiag = new Set<string>();
    for (const c of (consentsRes.data ?? []) as { diagnosis_id: string | null; revoked_at: string | null }[]) {
        if (!c.diagnosis_id) continue;
        anyByDiag.add(c.diagnosis_id);
        if (!c.revoked_at) activeByDiag.add(c.diagnosis_id);
    }

    const rows: LeadRow[] = ((eventsRes.data ?? []) as EventRow[]).map((e) => {
        const diag = Array.isArray(e.diagnoses) ? e.diagnoses[0] : e.diagnoses;
        const state = Array.isArray(e.lead_states) ? e.lead_states[0] : e.lead_states;
        const diagId = e.conversation_id ?? '';
        const revoked = anyByDiag.has(diagId) && !activeByDiag.has(diagId);
        const number =
            e.homeowner_whatsapp && !revoked ? formatSaPhoneLocal(e.homeowner_whatsapp) : null;
        return {
            id: e.id,
            createdAt: e.created_at,
            channel: e.channel,
            trade: e.diagnosis_trade ?? diag?.primary_trade ?? null,
            title: diag?.title ?? null,
            suburb: extractSuburb(diag?.customer_address ?? null),
            status: state?.status ?? 'new',
            contact: number,
        };
    });

    return <LeadsClient rows={rows} />;
}
