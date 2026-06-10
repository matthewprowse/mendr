import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import DiagnosesClient from './client';
import type { DiagnosisRow } from './client';

export const metadata: Metadata = {
    title: 'History',
    description: 'Your past diagnoses on Mendr.',
    robots: { index: false, follow: false },
};

export default async function DiagnosesPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/auth/login?next=/diagnoses');

    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('diagnoses')
        .select('id, title, diagnosis, customer_address, created_at, pinned')
        .eq('user_id', user.id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

    const rows: DiagnosisRow[] = (data ?? []) as DiagnosisRow[];
    return <DiagnosesClient initialRows={rows} />;
}
