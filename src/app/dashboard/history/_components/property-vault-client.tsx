'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import NextImage from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export type ScanEntry = {
    id: string;
    title: string;
    imageUrl: string | null;
    address: string | null;
    diagnosis: Record<string, unknown> | null;
    createdAt: string;
    hasReport: boolean;
};

type LocationOption = {
    id: string;
    nickname: string;
    address: string;
};

export function PropertyVaultClient({
    scans,
    locationOptions,
}: {
    scans: ScanEntry[];
    locationOptions: LocationOption[];
}) {
    const [locationFilter, setLocationFilter] = useState<string>('all');

    const filteredScans = useMemo(() => {
        if (locationFilter === 'all' || !locationFilter) return scans;
        const loc = locationOptions.find((l) => l.id === locationFilter);
        if (!loc?.address) return scans;
        return scans.filter(
            (s) => s.address && s.address.toLowerCase().includes(loc.address.toLowerCase().slice(0, 20))
        );
    }, [scans, locationFilter, locationOptions]);

    const recurringByAddress = useMemo(() => {
        const byAddress = new Map<string, Map<string, number>>();
        for (const s of filteredScans) {
            const addr = s.address ?? 'Unknown';
            const trade =
                (s.diagnosis as { trade?: string })?.trade ??
                (s.diagnosis as { category?: string })?.category ??
                'General';
            if (!byAddress.has(addr)) byAddress.set(addr, new Map());
            const cat = byAddress.get(addr)!;
            cat.set(trade, (cat.get(trade) ?? 0) + 1);
        }
        const recurring: Array<{ address: string; trade: string; count: number }> = [];
        byAddress.forEach((catMap, address) => {
            catMap.forEach((count, trade) => {
                if (count > 1) recurring.push({ address, trade, count });
            });
        });
        return recurring;
    }, [filteredScans]);

    if (scans.length === 0) {
        return (
            <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-muted-foreground">
                        No scans in your vault yet. Start a diagnosis to build your history.
                    </p>
                    <Link
                        href="/"
                        className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                        Start a scan
                    </Link>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {locationOptions.length > 0 && (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Property:</span>
                    <Select value={locationFilter} onValueChange={setLocationFilter}>
                        <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="All locations" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All locations</SelectItem>
                            {locationOptions.map((loc) => (
                                <SelectItem key={loc.id} value={loc.id}>
                                    {loc.nickname || loc.address}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {recurringByAddress.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Recurring at same address
                    </p>
                    <ul className="mt-1 list-inside list-disc text-sm text-amber-700 dark:text-amber-300">
                        {recurringByAddress.slice(0, 5).map((r, i) => (
                            <li key={i}>
                                {r.trade} at this address ({r.count} scans)
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex flex-col gap-6">
                {filteredScans.map((scan) => (
                    <Card key={scan.id} className="overflow-hidden">
                        <CardHeader className="pb-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-lg font-semibold leading-tight">
                                    {scan.title}
                                </h2>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(scan.createdAt).toLocaleDateString(undefined, {
                                        dateStyle: 'medium',
                                    })}
                                </span>
                            </div>
                            {scan.address && (
                                <p className="text-sm text-muted-foreground">{scan.address}</p>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                {scan.imageUrl && (
                                    <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
                                        <NextImage
                                            src={scan.imageUrl}
                                            alt="Scan"
                                            fill
                                            className="object-cover"
                                            sizes="(max-width: 640px) 100vw, 50vw"
                                        />
                                        <Badge className="absolute left-2 top-2" variant="secondary">
                                            Raw
                                        </Badge>
                                    </div>
                                )}
                                <div className="flex flex-col gap-2">
                                    <p className="text-sm font-medium">AI Diagnosis</p>
                                    {scan.diagnosis && typeof scan.diagnosis === 'object' ? (
                                        <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground">
                                            {(scan.diagnosis as { diagnosis?: string }).diagnosis ??
                                                (scan.diagnosis as { summary?: string }).summary ??
                                                'No summary'}
                                        </blockquote>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">—</p>
                                    )}
                                    {scan.hasReport && (
                                        <Link
                                            href={`/report/${scan.id}`}
                                            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                                        >
                                            View full report & invoice
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
