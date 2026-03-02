import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { FinanceClient } from './_components/finance-client';

export const metadata: Metadata = {
    title: 'Finance',
    description: 'Completed jobs and payments.',
};

export default async function ProFinancePage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect('/auth/login?next=/pro/finance');
    }

    const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('id', user.id)
        .single();
    if (!providerProfile) {
        redirect('/pro/claim');
    }

    const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status, category, service_address, current_quote, is_paid, payment_proof_url, updated_at, client_id')
        .eq('provider_id', user.id)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false });

    const clientIds = [...new Set((jobs ?? []).map((j) => j.client_id).filter(Boolean))] as string[];
    const { data: profiles } =
        clientIds.length > 0
            ? await supabase.from('profiles').select('id, first_name, surname').in('id', clientIds)
            : { data: [] as { id: string; first_name: string | null; surname: string | null }[] };
    const profilesMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const rows = (jobs ?? []).map((j) => {
        const quote = (j.current_quote as { total?: number }) ?? {};
        const total = Number(quote.total) ?? 0;
        const client = j.client_id ? profilesMap.get(j.client_id) : null;
        const customerName = client
            ? [client.first_name, client.surname].filter(Boolean).join(' ') || 'Customer'
            : 'Customer';
        return {
            id: j.id,
            customerName,
            date: j.updated_at,
            total,
            is_paid: j.is_paid ?? false,
            payment_proof_url: j.payment_proof_url ?? null,
        };
    });

    return <FinanceClient rows={rows} />;
}
