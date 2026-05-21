import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { AccountAuthClient, AccountDashboardClient } from './client';
import type { DiagnosisRow, SavedLocation } from './client';

export const metadata = {
    title: 'My Account | Menda',
    robots: { index: false, follow: false },
};

export default async function AccountPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return <AccountAuthClient />;
    }

    const admin = await createSupabaseAdminClient();

    const [{ data: diagnoses }, { data: profile }] = await Promise.all([
        admin
            .from('diagnoses')
            .select('id, title, created_at, diagnosis')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
        admin
            .from('profiles')
            .select('locations')
            .eq('id', user.id)
            .maybeSingle(),
    ]);

    const locations: SavedLocation[] = Array.isArray(profile?.locations) ? profile.locations : [];
    const diagnosisRows: DiagnosisRow[] = (diagnoses ?? []).map((d) => ({
        id: d.id as string,
        title: (d.title as string | null) ?? null,
        created_at: d.created_at as string,
        diagnosis: d.diagnosis as { trade?: string; diagnosis?: string } | null,
    }));

    return (
        <AccountDashboardClient
            diagnoses={diagnosisRows}
            locations={locations}
            userId={user.id}
        />
    );
}
