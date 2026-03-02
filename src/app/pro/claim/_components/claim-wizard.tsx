'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type CachedProvider = {
    place_id: string;
    id: string;
    name: string;
    address: string | null;
    rating: number | null;
    rating_count: number | null;
    services: unknown;
};

type Step = 'search' | 'verify' | 'pricing' | 'catalog';

export function ClaimWizard({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState<Step>('search');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CachedProvider[]>([]);
    const [selected, setSelected] = useState<CachedProvider | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [baseCalloutFee, setBaseCalloutFee] = useState('');
    const [ratePerKm, setRatePerKm] = useState('');
    const [products, setProducts] = useState<{ name: string; description: string; price: string; unit: string }[]>([
        { name: '', description: '', price: '', unit: 'item' },
        { name: '', description: '', price: '', unit: 'item' },
        { name: '', description: '', price: '', unit: 'item' },
    ]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }
        const t = setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/pro/claim?q=${encodeURIComponent(query)}`
                );
                if (!res.ok) throw new Error('Search failed');
                const data = await res.json();
                setResults(data);
            } catch {
                setError('Search failed');
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [query]);

    const handleClaim = async () => {
        if (!selected) return;
        setSubmitting(true);
        setError(null);
        try {
            const productPayload = products
                .filter((p) => p.name.trim() && p.price.trim())
                .map((p) => ({
                    name: p.name.trim(),
                    description: p.description.trim() || undefined,
                    price: Number(p.price) || 0,
                    unit: p.unit.trim() || 'item',
                }));
            const res = await fetch('/api/pro/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    place_id: selected.place_id,
                    base_callout_fee: baseCalloutFee.trim() ? Number(baseCalloutFee) : null,
                    rate_per_km: ratePerKm.trim() ? Number(ratePerKm) : null,
                    products: productPayload,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Claim failed');
            onComplete();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Claim failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (step === 'search') {
        return (
            <div className="mx-auto max-w-2xl space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">Claim your business</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Search for your business to link your Pro profile.
                    </p>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Step 1: Find your business</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="search">Business name or area</Label>
                            <Input
                                id="search"
                                placeholder="e.g. ABC Plumbing, Cape Town"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                        {loading && <p className="text-muted-foreground text-sm">Searching…</p>}
                        {error && <p className="text-destructive text-sm">{error}</p>}
                        {results.length > 0 && (
                            <ul className="space-y-2 border border-border rounded-md divide-y divide-border">
                                {results.map((r) => (
                                    <li key={r.place_id}>
                                        <button
                                            type="button"
                                            className="w-full px-4 py-3 text-left text-sm hover:bg-muted/50 rounded-md"
                                            onClick={() => setSelected(r)}
                                        >
                                            <span className="font-medium">{r.name}</span>
                                            {r.address && (
                                                <span className="text-muted-foreground block text-xs truncate">
                                                    {r.address}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {selected && (
                            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                                <div>
                                    <p className="font-medium">{selected.name}</p>
                                    {selected.address && (
                                        <p className="text-muted-foreground text-xs">{selected.address}</p>
                                    )}
                                </div>
                                <Button onClick={() => setStep('verify')}>
                                    Continue
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (step === 'verify') {
        return (
            <div className="mx-auto max-w-2xl space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">Verify your business</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        You can upload documents later from Settings.
                    </p>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Step 2: Documents (optional)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-muted-foreground text-sm">
                            Required: Insurance, COIDC, Business Registration. Upload these in Pro Settings after claiming.
                        </p>
                        <Button onClick={() => setStep('pricing')}>Continue to pricing</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (step === 'pricing') {
        return (
            <div className="mx-auto max-w-2xl space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">Set your pricing</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        You can change these later in Settings.
                    </p>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Step 3: Pricing</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="callout">Base call-out fee (ZAR)</Label>
                                <Input
                                    id="callout"
                                    type="number"
                                    min={0}
                                    step={1}
                                    placeholder="0"
                                    value={baseCalloutFee}
                                    onChange={(e) => setBaseCalloutFee(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rate">Rate per km (ZAR)</Label>
                                <Input
                                    id="rate"
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    placeholder="0"
                                    value={ratePerKm}
                                    onChange={(e) => setRatePerKm(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setStep('verify')}>
                                Back
                            </Button>
                            <Button onClick={() => setStep('catalog')}>Continue to catalog</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div className="text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Add your first products</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    Add at least one product or service. You can add more later.
                </p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Step 4: Catalog</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {products.map((p, i) => (
                        <div key={i} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label>Name</Label>
                                <Input
                                    placeholder="e.g. Geyser element swap"
                                    value={p.name}
                                    onChange={(e) => {
                                        const next = [...products];
                                        next[i] = { ...next[i], name: e.target.value };
                                        setProducts(next);
                                    }}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Price (ZAR)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="0"
                                    value={p.price}
                                    onChange={(e) => {
                                        const next = [...products];
                                        next[i] = { ...next[i], price: e.target.value };
                                        setProducts(next);
                                    }}
                                />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <Label>Unit (e.g. item, hour, sqm)</Label>
                                <Input
                                    placeholder="item"
                                    value={p.unit}
                                    onChange={(e) => {
                                        const next = [...products];
                                        next[i] = { ...next[i], unit: e.target.value };
                                        setProducts(next);
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                    {error && <p className="text-destructive text-sm">{error}</p>}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setStep('pricing')}>
                            Back
                        </Button>
                        <Button onClick={handleClaim} disabled={submitting}>
                            {submitting ? 'Claiming…' : 'Claim profile'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
