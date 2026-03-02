import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { CustomersListClient } from './_components/customers-list-client';

export const metadata: Metadata = {
    title: 'Customers',
    description: 'Your customers.',
};

export default async function ProCustomersPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect('/auth/login?next=/pro/customers');
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
        .select('client_id')
        .eq('provider_id', user.id)
        .not('client_id', 'is', null);

    const clientIds = [...new Set((jobs ?? []).map((j) => j.client_id).filter(Boolean))] as string[];
    const { data: profiles } =
        clientIds.length > 0
            ? await supabase.from('profiles').select('id, first_name, surname').in('id', clientIds)
            : { data: [] as { id: string; first_name: string | null; surname: string | null }[] };

    const customers = (profiles ?? []).map((p) => ({
        id: p.id,
        name: [p.first_name, p.surname].filter(Boolean).join(' ') || 'Customer',
    }));

    return <CustomersListClient customers={customers} />;
}
