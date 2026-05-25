'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWizard } from './wizard-context';
import { StepHeader } from './shared-ui';
import type { PlaceDetailsPayload, PlaceSearchHit } from './types';

export function StepCompanySearch() {
    const { data, patch, applyPlacePrefill } = useWizard();
    const selectedPlaceId = data.applicantGooglePlaceId;
    const [q, setQ] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<PlaceSearchHit[]>([]);
    const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

    async function runSearch() {
        const t = q.trim();
        if (t.length < 2) {
            toast.error('Type at least 2 characters.');
            return;
        }
        setSearching(true);
        try {
            const res = await fetch('/api/providers/onboarding/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: t }),
            });
            const json = (await res.json().catch(() => null)) as {
                results?: PlaceSearchHit[];
                error?: string;
            } | null;
            if (!res.ok) {
                toast.error(json?.error ?? 'Search failed.');
                setResults([]);
                return;
            }
            setResults(json?.results ?? []);
        } finally {
            setSearching(false);
        }
    }

    async function pickPlace(placeId: string) {
        setLoadingDetails(placeId);
        try {
            const res = await fetch('/api/providers/onboarding/place-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ placeId }),
            });
            const json = (await res.json().catch(() => null)) as {
                details?: PlaceDetailsPayload;
                error?: string;
            } | null;
            if (!res.ok || !json?.details) {
                toast.error(json?.error ?? 'Could not load that business.');
                return;
            }
            applyPlacePrefill(json.details);
            toast.success('Details loaded — you can edit them on the next screens.');
        } finally {
            setLoadingDetails(null);
        }
    }

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Find your business"
                description="Search public listings to pre-fill your profile. Everything can be edited — or skip if you are not on Maps."
            />
            <div className="flex flex-col gap-3">
                <Label htmlFor="bizSearch">Business or trading name</Label>
                <div className="flex gap-2">
                    <Input
                        id="bizSearch"
                        className="h-10 flex-1 text-sm"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void runSearch();
                            }
                        }}
                        placeholder="e.g. Smith Painters Bellville"
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-10 shrink-0 px-4"
                        disabled={searching}
                        onClick={() => void runSearch()}
                    >
                        {searching ? '…' : 'Search'}
                    </Button>
                </div>
            </div>
            {results.length > 0 ? (
                <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-2">
                    {results.map((r) => (
                        <li key={r.placeId}>
                            <button
                                type="button"
                                className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
                                disabled={loadingDetails !== null}
                                onClick={() => void pickPlace(r.placeId)}
                            >
                                <span className="font-medium text-foreground">{r.name}</span>
                                <span className="text-xs text-muted-foreground">{r.address}</span>
                                {r.rating != null ? (
                                    <span className="text-xs text-muted-foreground">
                                        {r.rating.toFixed(1)} ★
                                        {r.userRatingCount != null ? ` (${r.userRatingCount})` : ''}
                                    </span>
                                ) : null}
                                {loadingDetails === r.placeId ? (
                                    <span className="text-xs text-primary">Loading…</span>
                                ) : null}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
            <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                onClick={() => patch({ applicantGooglePlaceId: '' })}
            >
                My business is not listed — enter manually
            </Button>
            {selectedPlaceId ? (
                <p className="text-xs text-muted-foreground">
                    Selected Maps listing saved. You can change it by searching again.
                </p>
            ) : null}
        </div>
    );
}
