'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FavouriteButton } from '@/components/favourite-button';

type FavouriteRow = {
    id: string;
    provider_name: string | null;
    place_id: string | null;
    provider_profile_slug: string | null;
    provider_profile_id?: string | null;
    created_at: string;
    address?: string | null;
};

function formatDate(value: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-ZA', {
        dateStyle: 'medium',
    }).format(d);
}

export default function FavouritesPage() {
    const { user } = useAuth();
    const [favourites, setFavourites] = useState<FavouriteRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [visibleCount, setVisibleCount] = useState(15);

    const loadFavourites = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('provider_favourites')
                .select('id, provider_name, place_id, provider_profile_slug, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) {
                console.error('Favourites fetch error:', error);
                setFavourites([]);
                return;
            }
            const list = (data ?? []) as FavouriteRow[];

            // Map profile slugs to internal profile ids (for /pro/[id] URLs)
            const slugs = list.map((f) => f.provider_profile_slug).filter(Boolean) as string[];
            if (slugs.length > 0) {
                const { data: profiles } = await supabase
                    .from('provider_profiles')
                    .select('id, slug')
                    .in('slug', slugs);
                const idBySlug = new Map<string, string>(
                    (profiles ?? []).map((p: { id: string; slug: string }) => [p.slug, p.id]),
                );
                list.forEach((f) => {
                    (f as FavouriteRow).provider_profile_id = (f.provider_profile_slug
                        ? idBySlug.get(f.provider_profile_slug) ?? null
                        : null) as string | null;
                });
            }

            // Attach address from cached_providers for place_id-based favourites
            const placeIds = list.map((f) => f.place_id).filter(Boolean) as string[];
            if (placeIds.length > 0) {
                const { data: places } = await supabase
                    .from('cached_providers')
                    .select('place_id, address')
                    .in('place_id', placeIds);
                const addrByPlace = new Map<string, string | null>(
                    (places ?? []).map((p: { place_id: string; address: string | null }) => [
                        p.place_id,
                        p.address,
                    ]),
                );
                list.forEach((f) => {
                    if (f.place_id && addrByPlace.has(f.place_id)) {
                        (f as FavouriteRow).address = addrByPlace.get(f.place_id) ?? null;
                    }
                });
            }

            // Attach address from provider_locations for slug/profile-based favourites
            const providerIds = list
                .map((f) => f.provider_profile_id)
                .filter((v): v is string => !!v);
            if (providerIds.length > 0) {
                const { data: locations } = await supabase
                    .from('provider_locations')
                    .select('provider_id, address')
                    .in('provider_id', providerIds)
                    .eq('is_active', true);
                const addrByProvider = new Map<string, string>();
                (locations ?? []).forEach(
                    (loc: { provider_id: string; address: string | null }) => {
                        if (loc.address && !addrByProvider.has(loc.provider_id)) {
                            addrByProvider.set(loc.provider_id, loc.address);
                        }
                    },
                );
                list.forEach((f) => {
                    if (f.provider_profile_id && addrByProvider.has(f.provider_profile_id)) {
                        (f as FavouriteRow).address =
                            addrByProvider.get(f.provider_profile_id) ?? null;
                    }
                });
            }

            setFavourites(list);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        loadFavourites();
    }, [user?.id, loadFavourites]);

    const filteredFavourites = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return favourites;
        return favourites.filter((f) => {
            const name =
                f.provider_name ||
                f.provider_profile_slug?.replace(/-/g, ' ') ||
                'Pro';
            return name.toLowerCase().includes(q);
        });
    }, [favourites, search]);

    useEffect(() => {
        setVisibleCount(15);
    }, [search, favourites.length]);

    const canLoadMore = visibleCount < filteredFavourites.length;
    const visibleFavourites = filteredFavourites.slice(0, visibleCount);

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col gap-6">
            <section className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="max-w-3xl space-y-2">
                        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                            Favourites
                        </h1>
                        <p className="text-sm text-muted-foreground sm:text-base">
                            See every provider you&apos;ve saved in Scandio. Open a profile to review
                            details, contact info, and line them up for future jobs.
                        </p>
                    </div>
                </div>

                <div className="w-full">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search Favourites"
                        className="h-9 text-sm"
                    />
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-6 py-10 text-center">
                        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
                        <p className="text-sm text-muted-foreground">Loading Favourites…</p>
                    </div>
                ) : filteredFavourites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 px-6 py-10 text-center">
                        <p className="text-sm font-medium text-foreground">No Favourites Yet</p>
                        <p className="max-w-sm text-sm text-muted-foreground">
                            Tap the heart icon on a provider to save them here for next time.
                    </p>
                </div>
            ) : (
                    <section className="space-y-4">
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {visibleFavourites.map((f) => {
                            const name =
                                f.provider_name ||
                                f.provider_profile_slug?.replace(/-/g, ' ') ||
                                'Pro';
                        const href = f.provider_profile_id
                            ? `/pro/${f.provider_profile_id}`
                            : f.place_id
                              ? `/pro/${f.place_id}`
                              : '#';
                            const favouritedOn = formatDate(f.created_at || null);

                        return (
                                <Card
                                    key={f.id}
                                    className="overflow-hidden border-input/50 hover:border-input/75 bg-card transition-colors duration-250 hover:bg-secondary/25 shadow-none rounded-lg py-0"
                                >
                                    <div className="flex gap-6 p-3 sm:gap-6 p-3">
                                        <div className="flex min-w-0 flex-1 flex-col">
                                            <CardHeader className="p-0">
                                                <p className="line-clamp-2 text-sm font-medium text-foreground">
                                                    {name}
                                                </p>
                                                {f.address && (
                                                    <p className="-mt-1 mb-1 truncate text-xs text-muted-foreground">
                                                        {f.address}
                                                    </p>
                                                )}
                                            </CardHeader>
                                            <CardContent className="mt-2 flex items-center justify-between gap-2 p-0">
                                                <Button
                                                    asChild
                                                    size="sm"
                                                    variant="secondary"
                                                >
                                                    <Link href={href}>View Account</Link>
                                                </Button>
                                                <div className="flex items-center gap-2">
                                                    {favouritedOn && (
                                            <p className="text-xs text-muted-foreground">
                                                            {favouritedOn}
                                            </p>
                                                    )}
                                            <FavouriteButton
                                                providerProfileSlug={f.provider_profile_slug}
                                                placeId={f.place_id}
                                                providerName={name}
                                                variant="icon"
                                            />
                                                </div>
                                            </CardContent>
                                        </div>
                                    </div>
                                </Card>
                        );
                    })}
                        </div>
                        {canLoadMore && (
                            <div className="flex w-full items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    1 to {visibleCount} of {filteredFavourites.length}
                                </p>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                        setVisibleCount((current) =>
                                            Math.min(current + 15, filteredFavourites.length),
                                        )
                                    }
                                >
                                    Load More
                                </Button>
                            </div>
                        )}
                    </section>
            )}
            </section>
        </div>
    );
}
