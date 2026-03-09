'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';
import { SERVICE_ITEMS, type ServiceLabel } from '@/lib/service-icons';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ProvidersMap } from '@/app/chat/_components/providers-map';
import type { Provider } from '@/app/chat/_components/types';

type ScanSummary = {
    id: string;
    title: string | null;
    diagnosis: { diagnosis?: string } | null;
    image_url?: string | null;
    customer_address?: string | null;
    created_at: string;
    updated_at: string | null;
    pinned?: boolean | null;
};

type CoverageProvider = {
    place_id: string;
    name: string;
    address: string;
    latitude?: number;
    longitude?: number;
    rating?: number;
    ratingCount?: number;
    services?: { short: string; full: string }[];
};

type ChartPoint = {
    label: string;
    dateKey: string;
    count: number;
};

const scanChartConfig: ChartConfig = {
    scans: {
        label: 'Scans',
        color: 'var(--chart-1)',
    },
};

function formatScanTitle(scan: ScanSummary): string {
    const summary =
        (scan.diagnosis &&
        typeof scan.diagnosis === 'object' &&
        'diagnosis' in scan.diagnosis
            ? (scan.diagnosis as { diagnosis?: string }).diagnosis
            : null) || scan.title;
    return summary || 'Scandio diagnosis';
}

function formatScanDate(value: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';

    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
        return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
        return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function buildScanChart(
    scans: ScanSummary[],
    days: number
): { points: ChartPoint[]; max: number; total: number } {
    const total = scans.length;
    const today = new Date();
    const byDay = new Map<string, number>();

    scans.forEach((scan) => {
        const d = new Date(scan.created_at);
        if (Number.isNaN(d.getTime())) return;
        const key = d.toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
    });

    const points: ChartPoint[] = [];
    let max = 0;
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateKey = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString(undefined, { weekday: 'short' });
        const count = byDay.get(dateKey) ?? 0;
        points.push({ label, dateKey, count });
        if (count > max) max = count;
    }
    return { points, max, total };
}

export function AppHomeClient() {
    const router = useRouter();
    const { user } = useAuth();

    const [scans, setScans] = useState<ScanSummary[]>([]);
    const [loadingScans, setLoadingScans] = useState(true);
    const [serviceLimit, setServiceLimit] = useState(6);
    const [activityRange, setActivityRange] = useState<'7d' | '30d' | '90d'>('7d');

    const [mapProviders, setMapProviders] = useState<Provider[]>([]);
    const [userLocation, setUserLocation] = useState<{
        lat: number;
        lng: number;
        address?: string;
    } | null>(null);
    const [loadingMap, setLoadingMap] = useState(false);
    const [mapError, setMapError] = useState<string | null>(null);

    const mapKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

    const handleNewScan = useCallback(() => {
        const id = crypto.randomUUID();
        router.push(`/chat/${id}`);
    }, [router]);

    const handleStartServiceDiagnosis = useCallback(
        (label: ServiceLabel) => {
            const id = crypto.randomUUID();
            const params = new URLSearchParams({ trade: label });
            router.push(`/chat/${id}?${params.toString()}`);
        },
        [router]
    );

    useEffect(() => {
        if (!user?.id) return;
        let isCancelled = false;

        (async () => {
            setLoadingScans(true);
            try {
                const { data, error } = await supabase
                    .from('conversations')
                    .select(
                        'id, title, diagnosis, image_url, customer_address, created_at, updated_at, pinned'
                    )
                    .eq('user_id', user.id)
                    .order('updated_at', { ascending: false })
                    .limit(50);

                if (error) {
                    console.warn('Home scans fetch error:', error.message || error);
                    if (!isCancelled) setScans([]);
                } else if (!isCancelled) {
                    setScans((data as ScanSummary[]) ?? []);
                }
            } catch (err: any) {
                console.warn('Home scans fetch exception:', err?.message || err);
                if (!isCancelled) setScans([]);
            } finally {
                if (!isCancelled) setLoadingScans(false);
            }
        })();

        return () => {
            isCancelled = true;
        };
    }, [user?.id]);

    const scansThisWeek = useMemo(() => {
        if (!scans.length) return 0;
        const now = new Date();
        const currentWeekday = now.getDay(); // 0 (Sun) - 6 (Sat)
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - currentWeekday);
        startOfWeek.setHours(0, 0, 0, 0);
        return scans.filter((scan) => {
            const d = new Date(scan.created_at);
            return !Number.isNaN(d.getTime()) && d >= startOfWeek && d <= now;
        }).length;
    }, [scans]);

    const recentScans = scans.slice(0, 4);
    const visibleServiceItems = useMemo(
        () => SERVICE_ITEMS.slice(0, serviceLimit),
        [serviceLimit]
    );
    const canShowMoreServices = serviceLimit < SERVICE_ITEMS.length;

    const activityRangeDays = activityRange === '7d' ? 7 : activityRange === '30d' ? 30 : 90;

    const activityScans = useMemo(() => {
        if (!scans.length) return [];
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - (activityRangeDays - 1));
        start.setHours(0, 0, 0, 0);
        return scans.filter((scan) => {
            const d = new Date(scan.created_at);
            return !Number.isNaN(d.getTime()) && d >= start && d <= now;
        });
    }, [scans, activityRangeDays]);

    const { points: chartPoints, max: chartMax } = useMemo(
        () => buildScanChart(activityScans, activityRangeDays),
        [activityScans, activityRangeDays]
    );

    const scanChartData = useMemo(
        () =>
            chartPoints.map((point) => ({
                label: point.label,
                scans: point.count,
            })),
        [chartPoints]
    );

    const hasScanActivity = chartMax > 0;

    const totalScansAllTime = scans.length;
    const scansInRange = activityScans.length;
    const averagePerDay =
        activityRangeDays > 0 ? Math.round((scansInRange / activityRangeDays) * 10) / 10 : 0;
    const activeDays = chartPoints.filter((p) => p.count > 0).length;

    const activityRangeLabel =
        activityRange === '7d'
            ? 'Last 7 days'
            : activityRange === '30d'
              ? 'Last 30 days'
              : 'Last 90 days';

    const fetchCoverageProviders = useCallback(async (lat: number, lng: number) => {
        setLoadingMap(true);
        setMapError(null);
        try {
            const res = await fetch('/api/providers/coverage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng }),
            });
            const data = await res.json();
            if (!res.ok) {
                setMapError(data.error || 'Could not load nearby providers.');
                setMapProviders([]);
                return;
            }
            const providers = (data.providers ?? []) as CoverageProvider[];
            const converted: Provider[] = providers.map((p) => ({
                name: p.name,
                address: p.address,
                latitude: p.latitude,
                longitude: p.longitude,
                rating: p.rating,
                ratingCount: p.ratingCount,
                place_id: p.place_id,
                summary: '',
                services: p.services ?? [],
            }));
            setMapProviders(converted);
        } catch {
            setMapError('Could not load nearby providers. Check your connection.');
            setMapProviders([]);
        } finally {
            setLoadingMap(false);
        }
    }, []);

    const handleUseLocation = useCallback(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setMapError('Location is not available in this browser.');
            return;
        }
        setLoadingMap(true);
        setMapError(null);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const loc = { lat, lng };
                setUserLocation(loc);
                await fetchCoverageProviders(lat, lng);
                setLoadingMap(false);
            },
            () => {
                setMapError('Could not get your location. Please try again.');
                setLoadingMap(false);
            },
            { timeout: 15000 }
        );
    }, [fetchCoverageProviders]);

    useEffect(() => {
        if (!mapKey || userLocation) return;
        if (typeof window === 'undefined') return;
        handleUseLocation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapKey]);

    const hasMap = !!mapKey;
    const showMapSkeleton = hasMap && (loadingMap || !userLocation);

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col gap-6">
            <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                            Home Maintenance Hub
                        </h1>
                        <p className="text-sm text-muted-foreground sm:text-base">
                            See your recent scans, activity, and browse service types at a glance.
                        </p>
                    </div>
                </div>
            </section>

            <Separator className="my-3" />

            <section className="grid gap-6">
                <div className="flex flex-col gap-6">
                    <div className="flex flex-row flex-wrap items-center justify-between gap-3">
                        <h2 className="text-xl font-bold leading-tight tracking-tight">
                            Scandio activity
                        </h2>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Range</span>
                            <Select
                                value={activityRange}
                                onValueChange={(value) =>
                                    setActivityRange(value as '7d' | '30d' | '90d')
                                }
                            >
                                <SelectTrigger size="sm" className="w-[140px]">
                                    <SelectValue placeholder="Select range" />
                                </SelectTrigger>
                                <SelectContent align="end">
                                    <SelectItem value="7d">Last 7 days</SelectItem>
                                    <SelectItem value="30d">Last 30 days</SelectItem>
                                    <SelectItem value="90d">Last 90 days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="flex flex-1 border border-input/50 rounded-lg p-4 flex-col gap-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.12em]">
                                Total scans
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-foreground leading-tight tracking-tight">
                                {loadingScans ? '–' : totalScansAllTime}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                All-time scans in your account.
                            </p>
                        </div>
                        <div className="flex flex-1 border border-input/50 rounded-lg p-4 flex-col gap-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.12em]">
                                In range
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-foreground leading-tight tracking-tight">
                                {loadingScans ? '–' : scansInRange}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{activityRangeLabel}</p>
                        </div>
                        <div className="flex flex-1 border border-input/50 rounded-lg p-4 flex-col gap-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.12em]">
                                Avg. scans per day
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-foreground leading-tight tracking-tight">
                                {loadingScans ? '–' : averagePerDay.toFixed(1)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Average in the selected range.
                            </p>
                        </div>
                        <div className="flex flex-1 border border-input/50 rounded-lg p-4 flex-col gap-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.12em]">
                                Active days
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-foreground leading-tight tracking-tight">
                                {loadingScans ? '–' : activeDays}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Days you ran at least one scan.
                            </p>
                        </div>
                    </div>
                    <div className="rounded-lg border border-input/50 bg-card/40 p-4">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-2">
                            <span>{activityRangeLabel}</span>
                            <span>
                                {loadingScans
                                    ? 'Loading…'
                                    : `${scanChartData.reduce(
                                          (sum, p) => sum + p.scans,
                                          0
                                      )} scans`}
                            </span>
                        </div>
                        {hasScanActivity ? (
                            <ChartContainer
                                config={scanChartConfig}
                                className="h-40 w-full"
                            >
                                <BarChart
                                    accessibilityLayer
                                    data={scanChartData}
                                    margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
                                >
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        className="text-[10px] text-muted-foreground"
                                    />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="scans" fill="var(--color-scans)" radius={4} />
                                </BarChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 text-center text-xs text-muted-foreground">
                                No scan activity in this range yet. Your chart will appear here once
                                you run scans.
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <Separator className="my-3" />

            <section className="grid gap-6">
                <Card className="shadow-none border-input/50 rounded-lg mx-0 p-3 w-full">
                    <CardHeader>
                        <CardTitle className="text-lg">Recent Scans</CardTitle>
                        <CardDescription>
                            Jump back into the last issues you&apos;ve diagnosed with Scandio.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loadingScans ? (
                            <div className="space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="h-[64px] rounded-lg border border-border/70 bg-muted/40"
                                    />
                                ))}
                            </div>
                        ) : recentScans.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                                No scans yet. Run your first scan to see it here.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {recentScans.map((scan) => {
                                        const lastUpdated = formatScanDate(
                                            scan.updated_at || scan.created_at
                                        );
                                        const address = scan.customer_address;

                                        return (
                                            <button
                                                key={scan.id}
                                                type="button"
                                                onClick={() => router.push(`/chat/${scan.id}`)}
                                                className="flex h-full flex-col rounded-lg border border-input/60 bg-card/60 px-3 py-2.5 text-left transition-colors hover:border-input hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            >
                                                <div className="space-y-1">
                                                    <p className="line-clamp-2 text-sm font-medium text-foreground">
                                                        {formatScanTitle(scan)}
                                                    </p>
                                                    {address && (
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {address}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="mt-3 flex items-center justify-between gap-2">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {lastUpdated}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="secondary"
                                                        className="h-7 px-3 text-xs"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            router.push(`/chat/${scan.id}`);
                                                        }}
                                                    >
                                                        Open
                                                    </Button>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="justify-between pt-0 text-xs text-muted-foreground">
                        <span>Every scan keeps the full chat history and diagnosis attached.</span>
                        <Link
                            href="/app/scans"
                            className="text-xs font-medium text-primary underline underline-offset-4"
                        >
                            Show more scans
                        </Link>
                    </CardFooter>
                </Card>

                <Card className="h-full shadow-none border-input/50 rounded-lg mx-0 p-3 w-full">
                    <CardHeader>
                        <CardTitle className="text-base sm:text-lg">
                            Browse by service type
                        </CardTitle>
                        <CardDescription>
                            Jump straight into a new diagnosis from a category that matches your
                            issue.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                            {visibleServiceItems.map(({ label }) => {
                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => handleStartServiceDiagnosis(label)}
                                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-input/60 bg-card/60 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-input hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                        <span className="line-clamp-1">{label}</span>
                                        <span className="text-[11px] font-medium text-muted-foreground">
                                            Start diagnosis
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {canShowMoreServices && (
                            <div className="flex justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setServiceLimit(SERVICE_ITEMS.length)}
                                >
                                    Show more services
                                </Button>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="justify-between pt-0 text-xs text-muted-foreground">
                        <span>Each service opens a new Scandio chat tailored to that trade.</span>
                    </CardFooter>
                </Card>
            </section>

            <Separator className="my-3" />

            <section className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold leading-tight tracking-tight">
                            Providers near you
                        </h2>
                        <p className="text-xs text-muted-foreground sm:text-sm">
                            Explore trusted providers in your area and filter by service type.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleUseLocation}
                        >
                            Use my location
                        </Button>
                    </div>
                </div>

                {mapError && (
                    <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {mapError}
                    </div>
                )}

                {hasMap ? (
                    <div className="mt-1">
                        {showMapSkeleton ? (
                            <div className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/40">
                                <div className="aspect-[4/3] sm:h-[320px]" />
                                <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                </div>
                            </div>
                        ) : mapProviders.length === 0 ? (
                            <div className="flex min-height-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-4 text-center text-sm text-muted-foreground">
                                No providers found yet. Try setting your location or exploring the
                                providers directory.
                            </div>
                        ) : (
                            <ProvidersMap
                                apiKey={mapKey}
                                providers={mapProviders}
                                userLocation={userLocation}
                                mode="service"
                            />
                        )}
                    </div>
                ) : (
                    <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-4 text-center text-sm text-muted-foreground">
                        Maps are not configured for this environment yet.
                    </div>
                )}
            </section>
        </div>
    );
}

