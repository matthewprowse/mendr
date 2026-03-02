'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, HeartFill } from '@/lib/icons';
import { Spinner } from '@/components/ui/spinner';
import { FavouriteButton } from '@/components/favourite-button';

type FavouriteRow = {
    id: string;
    provider_name: string | null;
    place_id: string | null;
    provider_profile_slug: string | null;
    provider_profile_id?: string | null;
};

export default function FavouritesPage() {
    const { user } = useAuth();
    const [favourites, setFavourites] = useState<FavouriteRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            const { data, error } = await supabase
                .from('provider_favourites')
                .select('id, provider_name, place_id, provider_profile_slug')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) {
                console.error('Favourites fetch error:', error);
                setFavourites([]);
                setLoading(false);
                return;
            }
            const list = (data ?? []) as FavouriteRow[];
            const slugs = list.map((f) => f.provider_profile_slug).filter(Boolean) as string[];
            if (slugs.length > 0) {
                const { data: profiles } = await supabase
                    .from('provider_profiles')
                    .select('id, slug')
                    .in('slug', slugs);
                const idBySlug = new Map<string, string>((profiles ?? []).map((p: { id: string; slug: string }) => [p.slug, p.id]));
                list.forEach((f) => {
                    (f as FavouriteRow).provider_profile_id = (f.provider_profile_slug
                        ? idBySlug.get(f.provider_profile_slug) ?? null
                        : null) as string | null;
                });
            }
            setFavourites(list);
            setLoading(false);
        })();
    }, [user?.id]);

    if (loading) {
        return (
            <div className="mx-auto flex min-h-[40vh] max-w-2xl items-center justify-center px-4 py-12">
                <Spinner className="size-8 text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Favourites</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Your saved Pros — quick access to their profiles.
            </p>

            {favourites.length === 0 ? (
                <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
                    <HeartFill className="size-12 text-muted-foreground/60" />
                    <p className="mt-4 text-muted-foreground">No favourites yet.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Save Pros from report or provider pages to see them here.
                    </p>
                </div>
            ) : (
                <ul className="mt-8 space-y-2">
                    {favourites.map((f) => {
                        const name = f.provider_name || f.provider_profile_slug?.replace(/-/g, ' ') || 'Pro';
                        const href = f.provider_profile_id
                            ? `/pro/${f.provider_profile_id}`
                            : f.place_id
                              ? `/pro/${f.place_id}`
                              : '#';
                        return (
                            <li key={f.id}>
                                <Card className="transition-colors hover:bg-muted/30">
                                    <CardContent className="flex items-center gap-4 p-4">
                                        <Link href={href} className="min-w-0 flex-1">
                                            <p className="font-medium text-foreground">{name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                View profile
                                            </p>
                                        </Link>
                                        <div className="flex items-center gap-2">
                                            <FavouriteButton
                                                providerProfileSlug={f.provider_profile_slug}
                                                placeId={f.place_id}
                                                providerName={name}
                                                variant="icon"
                                            />
                                            <Link href={href}>
                                                <ChevronRight className="size-5 text-muted-foreground" />
                                            </Link>
                                        </div>
                                    </CardContent>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
