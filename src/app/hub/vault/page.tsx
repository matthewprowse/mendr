'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { External, Search } from '@/lib/icons';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ConversationRow = {
    id: string;
    title: string | null;
    image_url: string | null;
    customer_address: string | null;
    diagnosis: { diagnosis?: string } | null;
    created_at: string;
};

function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function VaultPage() {
    const { user } = useAuth();
    const [conversations, setConversations] = useState<ConversationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            try {
                const { data, error } = await supabase
                    .from('conversations')
                    .select('id, title, image_url, customer_address, diagnosis, created_at')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (error) {
                    // Soft-log so we don't surface noisy console errors in dev
                    console.warn('Vault fetch error:', error?.message || error);
                    setConversations([]);
                } else {
                    setConversations((data as ConversationRow[]) ?? []);
                }
            } catch (err: any) {
                console.warn('Vault fetch exception:', err?.message || err);
                setConversations([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [user?.id]);

    useEffect(() => {
        if (!searchOpen) return;
        const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [searchOpen]);

    const visibleConversations = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter((c) => {
            const summary =
                (c.diagnosis &&
                typeof c.diagnosis === 'object' &&
                'diagnosis' in c.diagnosis
                    ? (c.diagnosis as { diagnosis?: string }).diagnosis
                    : null) ||
                c.title ||
                'Diagnosis';

            return (
                summary.toLowerCase().includes(q) ||
                (c.customer_address ?? '').toLowerCase().includes(q)
            );
        });
    }, [conversations, query]);

    return (
        <div className="w-full px-4 py-8">
            {loading ? (
                <div className="mx-auto flex min-h-[40vh] max-w-2xl items-center justify-center px-4 py-12">
                    <Spinner className="size-8 text-muted-foreground" />
                </div>
            ) : (
                <>
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                Chats
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Your past chats and reports in one place.
                            </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Search chats"
                                onClick={() => setSearchOpen((v) => !v)}
                            >
                                <Search className="size-4" aria-hidden />
                            </Button>
                            <Button variant="secondary" onClick={() => setSearchOpen(true)}>
                                Search
                            </Button>
                        </div>
                    </div>

                    {searchOpen && (
                        <div className="mt-4 max-w-2xl">
                            <Input
                                ref={searchInputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search chats…"
                            />
                        </div>
                    )}

                    {conversations.length === 0 ? (
                        <div className="mt-12 rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
                            <p className="text-muted-foreground">No chats yet.</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Start a diagnosis to begin a new chat.
                            </p>
                            <Button asChild className="mt-4">
                                <Link href="/">Start a diagnosis</Link>
                            </Button>
                        </div>
                    ) : visibleConversations.length === 0 ? (
                        <div className="mt-12 rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
                            <p className="text-muted-foreground">No matches.</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Try a different search term.
                            </p>
                        </div>
                    ) : (
                        <ul className="mt-8 space-y-4">
                            {visibleConversations.map((c) => {
                                const summary =
                                    (c.diagnosis &&
                                    typeof c.diagnosis === 'object' &&
                                    'diagnosis' in c.diagnosis
                                        ? (c.diagnosis as { diagnosis?: string }).diagnosis
                                        : null) ||
                                    c.title ||
                                    'Diagnosis';
                                return (
                                    <li key={c.id}>
                                        <Card className="overflow-hidden transition-colors hover:bg-muted/30">
                                            <div className="flex gap-4 p-4">
                                                <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                                                    {c.image_url ? (
                                                        <Image
                                                            src={c.image_url}
                                                            alt=""
                                                            fill
                                                            className="object-cover"
                                                            sizes="96px"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                                            No image
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <CardHeader className="p-0">
                                                        <p className="line-clamp-2 text-sm font-medium text-foreground">
                                                            {summary}
                                                        </p>
                                                        {c.customer_address && (
                                                            <p className="mt-1 truncate text-xs text-muted-foreground">
                                                                {c.customer_address}
                                                            </p>
                                                        )}
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            {formatDate(c.created_at)}
                                                        </p>
                                                    </CardHeader>
                                                    <CardContent className="flex flex-wrap items-center gap-3 p-0 pt-2 text-xs">
                                                        <Link
                                                            href={`/chat/${c.id}`}
                                                            className="text-primary underline underline-offset-2"
                                                        >
                                                            Open scan
                                                        </Link>
                                                        <Link
                                                            href={`/report/${c.id}`}
                                                            className="flex items-center gap-1 text-primary underline underline-offset-2"
                                                        >
                                                            View report
                                                            <External className="size-3.5" />
                                                        </Link>
                                                    </CardContent>
                                                </div>
                                            </div>
                                        </Card>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}
