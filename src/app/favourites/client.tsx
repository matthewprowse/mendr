'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Heart, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { useAuth } from '@/context/auth-context';
import { UserAvatar } from '@/components/user-avatar';
import { toast } from 'sonner';

export type SavedProvider = {
    savedId: string;
    savedAt: string;
    providerId: string | null;
    googlePlaceId: string | null;
    name: string | null;
    address: string | null;
    rating: number | null;
    ratingCount: number | null;
    specialisations: string[];
};

function formatRelativeDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return 'Today';
    if (diffDays < 2) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} Days Ago`;
    return d.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export default function FavouritesClient({
    initialProviders,
}: {
    initialProviders?: SavedProvider[];
}) {
    const router = useRouter();
    const { user } = useAuth();
    const isLoggedIn = Boolean(user && user.email);

    const [rows, setRows] = useState<SavedProvider[] | null>(
        initialProviders ?? null,
    );
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [removingId, setRemovingId] = useState<string | null>(null);

    useEffect(() => {
        if (initialProviders !== undefined) return;
        if (!isLoggedIn) {
            setRows([]);
            return;
        }
        let cancelled = false;
        fetch('/api/account/saved-providers/list')
            .then((r) => {
                if (!r.ok) throw new Error(String(r.status));
                return r.json();
            })
            .then((data: { providers?: SavedProvider[] }) => {
                if (!cancelled) {
                    setRows(data.providers ?? []);
                }
            })
            .catch(() => {
                if (!cancelled) setError('We could not load your favourites.');
            });
        return () => {
            cancelled = true;
        };
    }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRemove = useCallback(
        async (row: SavedProvider) => {
            if (removingId) return;
            setRemovingId(row.savedId);
            try {
                const res = await fetch('/api/account/saved-providers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        providerId: row.providerId ?? row.googlePlaceId,
                    }),
                });
                if (!res.ok) throw new Error(String(res.status));
                setRows((prev) =>
                    prev ? prev.filter((r) => r.savedId !== row.savedId) : prev,
                );
                toast.success('Removed from favourites.');
            } catch {
                toast.error('Could not remove favourite.');
            } finally {
                setRemovingId(null);
            }
        },
        [removingId],
    );

    const filtered =
        rows?.filter((r) => {
            if (!query.trim()) return true;
            const q = query.toLowerCase();
            return (
                (r.name ?? '').toLowerCase().includes(q) ||
                (r.address ?? '').toLowerCase().includes(q)
            );
        }) ?? null;

    const header = (
        <FlowTopBar
            className="p-4"
            leftSlot={
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Go back"
                    onClick={() => router.back()}
                >
                    <ArrowLeft strokeWidth={2.5} />
                </Button>
            }
            centerSlot={
                <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                    {BRAND_NAME}
                </p>
            }
            rightSlot={<UserAvatar />}
        />
    );

    if (!isLoggedIn) {
        return (
            <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
                {header}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto">
                        <div className="flex min-h-full flex-col">
                            <div className="flex flex-1 flex-col items-center justify-center p-4 min-h-0">
                                <div className="flex w-full max-w-xl flex-col gap-8">
                                    <div className="flex w-full flex-col items-center gap-3 text-center">
                                        <h1 className="text-2xl font-semibold text-foreground">
                                            Favourites
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Log in to see the contractors you have saved.
                                        </p>
                                    </div>
                                    <Button asChild>
                                        <Link href="/auth/login?next=/favourites">Log In</Link>
                                    </Button>
                                </div>
                            </div>
                            <AccountTabBar />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const isLoading = rows === null;
    const isEmpty = !isLoading && !error && rows.length === 0;

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {header}
            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex flex-1 flex-col p-4">
                            <div className="mx-auto flex w-full max-w-xl flex-col gap-8">

                                {/* Page heading */}
                                <div className="flex w-full flex-col gap-3">
                                    <h1 className="text-2xl font-semibold text-foreground">
                                        Favourites
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        The specialists you have saved, all in one place.
                                    </p>
                                </div>

                                {/* Search */}
                                <div className="relative">
                                    <Search
                                        size={16}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    />
                                    <Input
                                        placeholder="Search Favourites"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>

                                {/* Loading skeleton */}
                                {isLoading ? (
                                    <div className="flex flex-col">
                                        {[0, 1, 2].map((i) => (
                                            <Fragment key={i}>
                                                {i > 0 && <Separator />}
                                                {/*
                                                 * SKELETON — mirrors the saved-contractor row list below.
                                                 * Each row: size-12 icon + name/address text column + date + heart button.
                                                 * Row count (3) is a reasonable default for favourites lists.
                                                 * ⚠️ If you change the row layout (icon size, text lines, action area),
                                                 * update this skeleton to match to prevent layout shift when data arrives.
                                                 */}
                                                <div className="flex items-center gap-3 py-3">
                                                    <Skeleton className="size-12 shrink-0 rounded-md" />
                                                    <div className="flex flex-1 flex-col gap-1 min-w-0">
                                                        <Skeleton className="h-3.5 w-3/5 rounded" />
                                                        <Skeleton className="h-3 w-4/5 rounded" />
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-3">
                                                        <Skeleton className="h-3 w-12 rounded" />
                                                        <Skeleton className="size-8 rounded-md" />
                                                    </div>
                                                </div>
                                            </Fragment>
                                        ))}
                                    </div>
                                ) : null}

                                {/* Error */}
                                {error ? (
                                    <p className="text-center text-sm text-destructive">{error}</p>
                                ) : null}

                                {/* Empty */}
                                {isEmpty ? (
                                    <p className="text-center text-sm text-muted-foreground">
                                        No favourites yet.
                                    </p>
                                ) : null}

                                {/* No search results */}
                                {!isLoading &&
                                !error &&
                                filtered !== null &&
                                filtered.length === 0 &&
                                !isEmpty ? (
                                    <p className="text-center text-sm text-muted-foreground">
                                        No results for &ldquo;{query}&rdquo;.
                                    </p>
                                ) : null}

                                {/* Favourites list */}
                                {filtered && filtered.length > 0 ? (
                                    <div className="flex flex-col">
                                        {filtered.map((row, index) => {
                                            const target = `/pro/${encodeURIComponent(row.providerId ?? row.googlePlaceId ?? '')}`;
                                            return (
                                                <Fragment key={row.savedId}>
                                                    {index > 0 && <Separator />}
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => router.push(target)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                router.push(target);
                                                            }
                                                        }}
                                                        className="flex cursor-pointer items-center gap-3 py-3"
                                                    >
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="icon"
                                                            className="size-12 shrink-0"
                                                            tabIndex={-1}
                                                            aria-hidden="true"
                                                        />
                                                        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                            <p className="line-clamp-1 text-sm font-medium">
                                                                {row.name ?? 'Unknown Contractor'}
                                                            </p>
                                                            {row.address ? (
                                                                <p className="line-clamp-1 text-xs text-muted-foreground">
                                                                    {row.address}
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                        <div
                                                            className="flex shrink-0 items-center gap-3"
                                                            onClick={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                        >
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatRelativeDate(row.savedAt)}
                                                            </span>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="size-8 text-rose-500 hover:text-rose-600"
                                                                aria-label="Remove from favourites"
                                                                disabled={removingId === row.savedId}
                                                                onClick={() => void handleRemove(row)}
                                                            >
                                                                {removingId === row.savedId ? (
                                                                    <Spinner className="size-4 text-muted-foreground" />
                                                                ) : (
                                                                    <Heart size={16} fill="currentColor" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </Fragment>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <AccountTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
