'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

type Result = { id: string; name: string; address: string; leads: number };

export default function ClaimClient() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Result[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (query.trim().length < 2) {
            setResults(null);
            setSearching(false);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(() => {
            fetch(`/api/pro/providers/search?q=${encodeURIComponent(query.trim())}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((d: { providers?: Result[] } | null) => setResults(d?.providers ?? []))
                .catch(() => setResults([]))
                .finally(() => setSearching(false));
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    const claim = async (id: string) => {
        if (claimingId) return;
        setClaimingId(id);
        try {
            const res = await fetch('/api/pro/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ providerId: id }),
            });
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
                toast.error(json?.error ?? 'Could not claim this business.');
                return;
            }
            toast.success('Claim submitted for review.');
            router.push('/pro/home');
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setClaimingId(null);
        }
    };

    return (
        <>
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">Claim Your Business</h1>
                <p className="text-sm text-muted-foreground">
                    Find your business to see the leads waiting for you and start receiving new ones.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your business name"
                    autoComplete="off"
                    autoFocus
                />

                {searching ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                        <Spinner className="size-4" /> Searching…
                    </div>
                ) : results === null ? null : results.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">
                        No unclaimed businesses match that name.
                    </p>
                ) : (
                    <div className="flex flex-col">
                        {results.map((r, i) => (
                            <Fragment key={r.id}>
                                {i > 0 && <Separator />}
                                <div className="flex items-center gap-3 py-3">
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {r.name}
                                        </p>
                                        {r.address ? (
                                            <p className="truncate text-xs text-muted-foreground">
                                                {r.address}
                                            </p>
                                        ) : null}
                                        {r.leads > 0 ? (
                                            <p className="text-xs font-medium text-foreground">
                                                {r.leads} lead{r.leads === 1 ? '' : 's'} waiting
                                            </p>
                                        ) : null}
                                    </div>
                                    <Button
                                        size="sm"
                                        className="shrink-0"
                                        disabled={claimingId === r.id}
                                        onClick={() => void claim(r.id)}
                                    >
                                        {claimingId === r.id ? 'Claiming…' : 'Claim'}
                                    </Button>
                                </div>
                            </Fragment>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
