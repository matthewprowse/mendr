import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { LeadsClient } from './_components/leads-client';

export const metadata: Metadata = {
    title: 'Leads',
    description: 'Incoming leads for your business.',
};

export default async function ProLeadsPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect('/auth/login?next=/pro/leads');
    }

    const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('id', user.id)
        .single();
    if (!providerProfile) {
        redirect('/pro/claim');
    }

    const { data: leads } = await supabase
        .from('jobs')
        .select('id, status, category, service_address, created_at, client_id')
        .eq('provider_id', user.id)
        .eq('status', 'lead')
        .order('created_at', { ascending: false });

    const clientIds = (leads ?? []).map((j) => j.client_id).filter(Boolean) as string[];
    const { data: profiles } =
        clientIds.length > 0
            ? await supabase.from('profiles').select('id, first_name, surname').in('id', clientIds)
            : { data: [] as { id: string; first_name: string | null; surname: string | null }[] };
    const profilesMap = new Map((profiles ?? []).map((p: { id: string; first_name: string | null; surname: string | null }) => [p.id, p]));

    return (
        <LeadsClient
            leads={leads ?? []}
            profilesMap={Object.fromEntries(profilesMap)}
        />
    );
}
