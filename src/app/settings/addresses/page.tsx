import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import AddressesClient from './client';
import type { SavedLocation } from './client';

export const metadata: Metadata = {
    title: 'Addresses',
    description: 'Saved addresses for your Mendr account.',
    robots: { index: false, follow: false },
};

export default async function AddressesPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/auth/login?next=/settings/addresses');

    const admin = await createSupabaseAdminClient();
    const { data: profile } = await admin
        .from('profiles')
        .select('locations')
        .eq('id', user.id)
        .maybeSingle();

    const locations: SavedLocation[] = Array.isArray(profile?.locations)
        ? (profile.locations as SavedLocation[])
        : [];
    return <AddressesClient initialLocations={locations} />;
}
