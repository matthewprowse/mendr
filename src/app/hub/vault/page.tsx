'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { External } from '@/lib/icons';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

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

    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            const { data, error } = await supabase
                .from('conversations')
                .select('id, title, image_url, customer_address, diagnosis, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) {
                console.error('Vault fetch error:', error);
                setConversations([]);
            } else {
                setConversations((data as ConversationRow[]) ?? []);
            }
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Vault</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Your past scans and reports in one place.
            </p>

            {conversations.length === 0 ? (
                <div className="mt-12 rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
                    <p className="text-muted-foreground">No scans yet.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Start a diagnosis to see your reports here.
                    </p>
                    <Button asChild className="mt-4">
                        <Link href="/">Start a diagnosis</Link>
                    </Button>
                </div>
            ) : (
                <ul className="mt-8 space-y-4">
                    {conversations.map((c) => {
                        const summary =
                            (c.diagnosis && typeof c.diagnosis === 'object' && 'diagnosis' in c.diagnosis
                                ? (c.diagnosis as { diagnosis?: string }).diagnosis
                                : null) ||
                            c.title ||
                            'Diagnosis';
                        return (
                            <li key={c.id}>
                                <Card className="overflow-hidden transition-colors hover:bg-muted/30">
                                    <Link href={`/report/${c.id}`} className="block">
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
                                                    <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                                                        No image
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <CardHeader className="p-0">
                                                    <p className="text-sm font-medium text-foreground line-clamp-2">
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
                                                <CardContent className="flex items-center gap-1 p-0 pt-2">
                                                    <span className="text-xs font-medium text-primary">
                                                        View full report
                                                    </span>
                                                    <External className="size-3.5 text-primary" />
                                                </CardContent>
                                            </div>
                                        </div>
                                    </Link>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
