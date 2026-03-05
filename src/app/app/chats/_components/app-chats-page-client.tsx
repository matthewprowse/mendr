'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StarFill } from '@/lib/icons';

type ConversationSummary = {
    id: string;
    title: string | null;
    diagnosis: { diagnosis?: string } | null;
    image_url: string | null;
    customer_address: string | null;
    created_at: string;
    updated_at: string | null;
    pinned?: boolean | null;
};

type AppChatsPageClientProps = {
    initialConversationId?: string;
};

function formatDate(value: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-ZA', {
        dateStyle: 'medium',
    }).format(d);
}

export function AppChatsPageClient({}: AppChatsPageClientProps) {
    const { user } = useAuth();
    const router = useRouter();

    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [search, setSearch] = useState('');
    const [visibleCount, setVisibleCount] = useState(15);

    const handleNewScan = () => {
        const id = crypto.randomUUID();
        router.push(`/chat/${id}`);
    };

    const fetchConversations = useCallback(async () => {
        if (!user?.id) {
            setConversations([]);
            setLoadingConversations(false);
            return;
        }
        setLoadingConversations(true);
        try {
            const { data, error } = await supabase
                .from('conversations')
                .select(
                    'id, title, diagnosis, image_url, customer_address, created_at, updated_at, pinned',
                )
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(50);
            if (error) {
                console.warn('App chats fetch error:', error.message || error);
                setConversations([]);
            } else {
                setConversations((data as ConversationSummary[]) ?? []);
            }
        } catch (err: any) {
            console.warn('App chats fetch exception:', err?.message || err);
            setConversations([]);
        } finally {
            setLoadingConversations(false);
        }
    }, [user?.id]);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    const filteredConversations = useMemo(() => {
        const q = search.trim().toLowerCase();

        const base = q
            ? conversations.filter((c) => {
                  const summary =
                      (c.diagnosis &&
                      typeof c.diagnosis === 'object' &&
                      'diagnosis' in c.diagnosis
                          ? (c.diagnosis as { diagnosis?: string }).diagnosis
                          : null) ||
                      c.title ||
                      'Diagnosis';
                  return summary.toLowerCase().includes(q);
              })
            : conversations;

        // Sort pinned scans to the top, then by most recently updated/created
        return [...base].sort((a, b) => {
            const aPinned = !!a.pinned;
            const bPinned = !!b.pinned;
            if (aPinned !== bPinned) {
                return aPinned ? -1 : 1;
            }
            const aDate = a.updated_at || a.created_at;
            const bDate = b.updated_at || b.created_at;
            if (!aDate || !bDate) return 0;
            return new Date(bDate).getTime() - new Date(aDate).getTime();
        });
    }, [conversations, search]);

    useEffect(() => {
        // Reset visible items when the search query or underlying data changes
        setVisibleCount(15);
    }, [search, conversations.length]);

    const canLoadMore = visibleCount < filteredConversations.length;
    const visibleItems = filteredConversations.slice(0, visibleCount);

    const handleTogglePinned = async (id: string, currentPinned: boolean | null | undefined) => {
        if (!user?.id) return;
        const nextPinned = !currentPinned;

        // Optimistic update
        setConversations((prev) =>
            prev.map((c) => (c.id === id ? { ...c, pinned: nextPinned } : c)),
        );

        const { error } = await supabase
            .from('conversations')
            .update({ pinned: nextPinned })
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            console.warn('Toggle pinned error:', error.message || error);
            // Revert on failure
            setConversations((prev) =>
                prev.map((c) => (c.id === id ? { ...c, pinned: currentPinned } : c)),
            );
        }
    };

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col gap-6">
            <section className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="max-w-3xl space-y-2">
                        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                            Scans
                        </h1>
                        <p className="text-sm text-muted-foreground sm:text-base">
                            Browse every Scandio scan you&apos;ve run so far. Open a scan to review the
                            diagnosis, share the report with a provider, or continue the chat.
                        </p>
                    </div>
                    <div className="flex w-full justify-end sm:w-auto">
                        <Button
                            onClick={handleNewScan}
                            className="w-full sm:w-auto"
                        >
                            New Scan
                        </Button>
                    </div>
                </div>

                <div className="w-full">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search Scans"
                        className="h-9 text-sm"
                    />
                </div>

                {loadingConversations ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-6 py-10 text-center">
                        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
                        <p className="text-sm text-muted-foreground">Loading Scans…</p>
                    </div>
                ) : filteredConversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 px-6 py-10 text-center">
                        <p className="text-sm font-medium text-foreground">No Scans Yet</p>
                        <p className="max-w-sm text-sm text-muted-foreground">
                            Once you upload an image and start a diagnosis, your scans will appear
                            here.
                        </p>
                    </div>
                ) : (
                    <section className="space-y-4">
                        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {visibleItems.map((c) => {
                                const summary =
                                    (c.diagnosis &&
                                    typeof c.diagnosis === 'object' &&
                                    'diagnosis' in c.diagnosis
                                        ? (c.diagnosis as { diagnosis?: string }).diagnosis
                                        : null) ||
                                    c.title ||
                                    'Diagnosis';
                                const lastUpdated = formatDate(c.updated_at || c.created_at);
                                const isPinned = !!c.pinned;

                                return (
                                    <Card
                                        key={c.id}
                                        className="overflow-hidden border-input/50 hover:border-input/75 bg-card transition-colors duration-250 hover:bg-secondary/25 shadow-none rounded-lg py-0 cursor-pointer"
                                        role="link"
                                        tabIndex={0}
                                        onClick={() => router.push(`/chat/${c.id}`)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                router.push(`/chat/${c.id}`);
                                            }
                                        }}
                                    >
                                        <div className="flex gap-6 p-3 sm:gap-6 p-3">
                                            <div className="flex min-w-0 flex-1 flex-col">
                                                <CardHeader className="p-0">
                                                    <p className="line-clamp-2 text-sm font-medium text-foreground">
                                                        {summary}
                                                    </p>
                                                    {c.customer_address && (
                                                        <p className="-mt-1 mb-1 truncate text-xs text-muted-foreground">
                                                            {c.customer_address}
                                                        </p>
                                                    )}
                                                </CardHeader>
                                                <CardContent className="mt-2 flex items-center justify-between gap-2 p-0">
                                                    <Button
                                                        asChild
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Link href={`/report/${c.id}`} onClick={(e) => e.stopPropagation()}>
                                                            Scandio Report
                                                        </Link>
                                                    </Button>
                                                    <div className="flex items-center gap-2">
                                                        {lastUpdated && (
                                                            <p className="text-xs text-muted-foreground">
                                                                {lastUpdated}
                                                            </p>
                                                        )}
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className={
                                                                isPinned
                                                                    ? 'shrink-0 text-amber-500 hover:text-amber-600'
                                                                    : 'shrink-0 text-muted-foreground hover:text-foreground'
                                                            }
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleTogglePinned(c.id, c.pinned);
                                                            }}
                                                            aria-label={
                                                                isPinned ? 'Unpin scan' : 'Pin scan'
                                                            }
                                                            aria-pressed={isPinned}
                                                        >
                                                            <StarFill className="size-4" />
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </section>
                        {canLoadMore && (
                            <div className="flex w-full items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    1 to {visibleCount} of {filteredConversations.length}
                                </p>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                        setVisibleCount((current) =>
                                            Math.min(current + 15, filteredConversations.length),
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

