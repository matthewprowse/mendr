import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import FavouritesClient from './client';
import type { SavedProvider } from './client';

export const metadata: Metadata = {
    title: 'Favourites',
    description: 'Your saved contractors on Mendr.',
    robots: { index: false, follow: false },
};

export default async function FavouritesPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/auth/login?next=/favourites');

    const admin = await createSupabaseAdminClient();
    const { data: savedRows } = await admin
        .from('saved_providers')
        .select('id, provider_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    let providers: SavedProvider[] = [];

    if (savedRows && savedRows.length > 0) {
        const ids = Array.from(
            new Set(savedRows.map((r) => r.provider_id).filter((v): v is string => Boolean(v)))
        );

        const { data: providerRows } = await admin
            .from('providers')
            .select('id, google_place_id, name, address, rating, rating_count, specialisations, is_active')
            .or(`id.in.(${ids.map((i) => `"${i}"`).join(',')}),google_place_id.in.(${ids.map((i) => `"${i}"`).join(',')})`);

        const byId = new Map<string, NonNullable<typeof providerRows>[number]>();
        for (const p of providerRows ?? []) {
            if (p.id) byId.set(p.id, p);
            if (p.google_place_id) byId.set(p.google_place_id, p);
        }

        providers = savedRows
            .map((saved) => {
                const p = byId.get(saved.provider_id ?? '');
                if (!p || p.is_active === false) return null;
                return {
                    savedId: saved.id as string,
                    savedAt: saved.created_at as string,
                    providerId: (p.id ?? saved.provider_id) as string,
                    googlePlaceId: (p.google_place_id ?? null) as string | null,
                    name: (p.name ?? null) as string | null,
                    address: (p.address ?? null) as string | null,
                    rating: (p.rating ?? null) as number | null,
                    ratingCount: (p.rating_count ?? null) as number | null,
                    specialisations: (p.specialisations ?? []) as string[],
                };
            })
            .filter((p) => p !== null) as SavedProvider[];
    }

    return <FavouritesClient initialProviders={providers} />;
}
