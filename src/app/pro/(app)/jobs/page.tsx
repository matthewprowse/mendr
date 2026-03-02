import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { JobsListClient } from './_components/jobs-list-client';

export const metadata: Metadata = {
    title: 'Jobs',
    description: 'Your jobs and quotes.',
};

export default async function ProJobsPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect('/auth/login?next=/pro/jobs');
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
        .select('id, status, category, service_address, created_at, updated_at, client_id')
        .eq('provider_id', user.id)
        .in('status', ['quoted', 'active', 'completed'])
        .order('updated_at', { ascending: false });

    const clientIds = [...new Set((jobs ?? []).map((j) => j.client_id).filter(Boolean))] as string[];
    const { data: profiles } =
        clientIds.length > 0
            ? await supabase.from('profiles').select('id, first_name, surname').in('id', clientIds)
            : { data: [] as { id: string; first_name: string | null; surname: string | null }[] };
    const profilesMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return (
        <JobsListClient
            jobs={jobs ?? []}
            profilesMap={Object.fromEntries(profilesMap)}
        />
    );
}
