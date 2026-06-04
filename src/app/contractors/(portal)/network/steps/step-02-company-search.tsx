'use client';

import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useWizard } from './wizard-context';
import { StepHeader } from './shared-ui';
import { toTitleCaseWords } from './utils';
import type { PlaceSearchHit } from './types';

export function StepCompanySearch() {
    const { data, patch, applyPlacePrefill, goNext } = useWizard();
    const [q, setQ] = useState(data.businessName ?? '');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<PlaceSearchHit[]>([]);

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
            const hits = json?.results ?? [];
            setResults(hits);
            if (hits.length === 0) {
                toast.message('No matches found. You can enter your details manually.');
            }
        } finally {
            setSearching(false);
        }
    }

    // Results from our DB are self-contained, so picking pre-fills directly.
    function pickResult(hit: PlaceSearchHit) {
        applyPlacePrefill({
            placeId: hit.placeId,
            businessName: hit.name,
            address: hit.address,
            phone: hit.phone,
            website: hit.website,
            lat: hit.lat,
            lng: hit.lng,
        });
        toast.success('Details loaded. You can edit them on the next screens.');
    }

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Find Your Business"
                description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore."
            />
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                    <Label htmlFor="bizSearch">Business Name</Label>
                    <Input
                        id="bizSearch"
                        className="h-10 text-sm"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void runSearch();
                            }
                        }}
                    />
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    className="h-10 w-full"
                    disabled={searching}
                    onClick={() => void runSearch()}
                >
                    {searching ? 'Searching…' : 'Search'}
                </Button>
            </div>
            {results.length > 0 ? (
                <div className="flex flex-col">
                    {results.map((r, i) => (
                        <Fragment key={r.placeId}>
                            {i > 0 ? <Separator /> : null}
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => pickResult(r)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        pickResult(r);
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
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <p className="text-sm font-medium text-foreground">{r.name}</p>
                                    {r.address ? (
                                        <p className="line-clamp-1 text-xs text-muted-foreground">{r.address}</p>
                                    ) : null}
                                </div>
                            </div>
                        </Fragment>
                    ))}
                </div>
            ) : null}
            <Button
                type="button"
                variant="ghost"
                className="h-10 w-full"
                onClick={() => {
                    const name = q.trim();
                    patch({
                        applicantGooglePlaceId: '',
                        ...(name ? { businessName: toTitleCaseWords(name) } : {}),
                    });
                    void goNext();
                }}
            >
                Enter My Details Manually
            </Button>
        </div>
    );
}
