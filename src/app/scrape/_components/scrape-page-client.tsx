'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Service = { id: string; label: string; search_query: string; sort_order: number };
type Area = { name: string; lat: number; lng: number; radiusKm: number };

export function ScrapePageClient() {
    const [services, setServices] = useState<Service[]>([]);
    const [areas, setAreas] = useState<Area[]>([]);
    const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
    const [name, setName] = useState('');
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [radiusKm, setRadiusKm] = useState('25');
    const [addressQuery, setAddressQuery] = useState('');
    const [geocoding, setGeocoding] = useState(false);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{ results: { area: string; trade: string; ok: boolean; count: number; error?: string }[]; totalCached: number } | null>(null);

    // Trades come from Supabase only (GET /api/services)
    useEffect(() => {
        fetch('/api/services')
            .then((res) => res.json())
            .then((data) => {
                const list = data?.services ?? [];
                setServices(list);
                if (list.length > 0) {
                    setSelectedTrades(new Set(list.map((s: Service) => s.search_query)));
                }
            })
            .catch(() => toast.error('Could not load trades from Supabase'));
    }, []);

    const handleGeocode = async () => {
        const q = addressQuery.trim();
        if (!q) return;
        setGeocoding(true);
        try {
            const res = await fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: q }),
            });
            const data = await res.json();
            if (res.ok && data.lat != null && data.lng != null) {
                setLat(String(data.lat));
                setLng(String(data.lng));
                if (!name.trim()) setName(data.address?.split(',')[0]?.trim() || q.slice(0, 40));
            } else {
                toast.error(data.error || 'Address not found');
            }
        } catch {
            toast.error('Geocode failed');
        } finally {
            setGeocoding(false);
        }
    };

    const addArea = () => {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        const radiusNum = parseFloat(radiusKm);
        if (!name.trim() || isNaN(latNum) || isNaN(lngNum) || isNaN(radiusNum) || radiusNum <= 0) {
            toast.error('Name, valid lat, lng and radius (km) required');
            return;
        }
        setAreas((prev) => [...prev, { name: name.trim(), lat: latNum, lng: lngNum, radiusKm: radiusNum }]);
        setName('');
        setLat('');
        setLng('');
        setAddressQuery('');
        setRadiusKm('25');
    };

    const removeArea = (index: number) => {
        setAreas((prev) => prev.filter((_, i) => i !== index));
    };

    const toggleTrade = (trade: string) => {
        setSelectedTrades((prev) => {
            const next = new Set(prev);
            if (next.has(trade)) next.delete(trade);
            else next.add(trade);
            return next;
        });
    };

    const runScrape = async () => {
        if (areas.length === 0 || selectedTrades.size === 0) {
            toast.error('Add at least one area and select at least one trade');
            return;
        }
        setRunning(true);
        setResult(null);
        try {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    areas: areas.map((a) => ({
                        name: a.name,
                        lat: a.lat,
                        lng: a.lng,
                        radiusM: a.radiusKm * 1000,
                    })),
                    trades: Array.from(selectedTrades),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Scrape failed');
                return;
            }
            setResult(data);
            toast.success(`Done. ${data.totalCached} providers cached.`);
        } catch (e) {
            toast.error((e as Error).message || 'Scrape failed');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <header className="sticky top-0 z-50 border-b border-border bg-background">
                <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
                    <Button variant="ghost" size="icon" className="-ml-2" aria-label="Back" asChild>
                        <Link href="/">
                            <ArrowLeft className="size-4" />
                        </Link>
                    </Button>
                    <h1 className="text-lg font-semibold">Scrape providers</h1>
                </div>
            </header>

            <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 space-y-8">
                <p className="text-sm text-muted-foreground">
                    Add areas (location + radius) and select trades. Running the scrape will call the provider API for each area × trade and save results to the cache.
                </p>

                {/* Add area */}
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold">Add area</h2>
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <Input
                                placeholder="Address (Western Cape) to geocode"
                                value={addressQuery}
                                onChange={(e) => setAddressQuery(e.target.value)}
                                className="flex-1"
                            />
                            <Button variant="secondary" onClick={handleGeocode} disabled={geocoding}>
                                {geocoding ? '…' : 'Get coords'}
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                            <Input type="number" step="any" placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} />
                            <Input type="number" step="any" placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} />
                            <Input type="number" min="1" max="100" placeholder="Radius (km)" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} />
                        </div>
                        <Button onClick={addArea}>Add area</Button>
                    </div>
                </section>

                {/* Areas list */}
                <section className="space-y-2">
                    <h2 className="text-sm font-semibold">Areas ({areas.length})</h2>
                    {areas.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No areas added yet.</p>
                    ) : (
                        <ul className="space-y-1">
                            {areas.map((a, i) => (
                                <li key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                                    <span>{a.name}</span>
                                    <span className="text-muted-foreground">
                                        {a.lat.toFixed(4)}, {a.lng.toFixed(4)} · {a.radiusKm} km
                                    </span>
                                    <Button variant="ghost" size="sm" onClick={() => removeArea(i)}>
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Trades (from Supabase services table) */}
                <section className="space-y-2">
                    <h2 className="text-sm font-semibold">Trades ({selectedTrades.size} selected)</h2>
                    {services.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Loading trades from Supabase…</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {services.map((s) => (
                                <label key={s.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50">
                                    <input
                                        type="checkbox"
                                        checked={selectedTrades.has(s.search_query)}
                                        onChange={() => toggleTrade(s.search_query)}
                                        className="rounded border-input"
                                    />
                                    <span>{s.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </section>

                {/* Run */}
                <section>
                    <Button onClick={runScrape} disabled={running || areas.length === 0 || selectedTrades.size === 0}>
                        {running ? 'Running…' : `Run scrape (${areas.length} × ${selectedTrades.size} requests)`}
                    </Button>
                </section>

                {/* Result */}
                {result && (
                    <section className="space-y-2">
                        <h2 className="text-sm font-semibold">Result</h2>
                        <p className="text-sm text-muted-foreground">Total providers cached: {result.totalCached}</p>
                        <div className="max-h-60 overflow-auto rounded-md border border-border p-2 text-xs font-mono">
                            {result.results.map((r, i) => (
                                <div key={i} className={r.ok ? 'text-muted-foreground' : 'text-destructive'}>
                                    {r.area} · {r.trade}: {r.ok ? r.count : r.error}
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
