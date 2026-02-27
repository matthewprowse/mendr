'use client';

import { useState } from 'react';
import NextImage from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Buildings } from 'geist-icons';
import { PerformanceRadar } from './performance-radar';

type Provider = {
    id: string;
    slug: string;
    banner_url: string | null;
    short_description: string | null;
    main_description: string | null;
    service_categories: string[];
    google_place_id: string | null;
    ai_review_summary: string | null;
    positives: string[];
    negatives: string[];
    metrics_punctuality: number;
    metrics_tidiness: number;
    metrics_professionalism: number;
    metrics_cleanup: number;
    total_jobs_completed: number;
    updated_at: string;
    display_name: string;
    locations: Array<{
        id: string;
        nickname: string | null;
        address: string;
        latitude: number | null;
        longitude: number | null;
        service_radius_km: number;
    }>;
};

export function ProviderPageClient({ provider }: { provider: Provider }) {
    const [galleryTab, setGalleryTab] = useState<'our-work' | 'real-results'>('our-work');

    const metrics = [
        { label: 'Punctuality', value: Number(provider.metrics_punctuality) || 0 },
        { label: 'Tidiness', value: Number(provider.metrics_tidiness) || 0 },
        { label: 'Professionalism', value: Number(provider.metrics_professionalism) || 0 },
        { label: 'Cleanup', value: Number(provider.metrics_cleanup) || 0 },
    ];

    return (
        <div className="space-y-8">
            {/* Banner: image or default placeholder */}
            <div className="relative h-48 w-full overflow-hidden rounded-xl bg-gradient-to-br from-muted via-muted/80 to-muted sm:h-56">
                {provider.banner_url ? (
                    <NextImage
                        src={provider.banner_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width: 896px) 100vw, 896px"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Buildings className="h-20 w-20 text-muted-foreground/40 sm:h-24 sm:w-24" />
                    </div>
                )}
                {/* Avatar placeholder overlay when no banner, or subtle when banner */}
                <div className="absolute bottom-3 left-3 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted/90 shadow-sm sm:h-16 sm:w-16">
                    <span className="text-lg font-semibold text-muted-foreground sm:text-xl">
                        {[provider.display_name.split(/\s+/)[0], provider.display_name.split(/\s+/)[1]]
                            .map((w) => w?.[0])
                            .filter(Boolean)
                            .join('')
                            .slice(0, 2)
                            .toUpperCase() || 'Pro'}
                    </span>
                </div>
            </div>

            <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {provider.display_name}
                </h1>
                {provider.short_description && (
                    <p className="mt-2 text-muted-foreground">{provider.short_description}</p>
                )}
                {provider.service_categories.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {provider.service_categories.map((c, i) => (
                            <Badge key={i} variant="secondary">
                                {c}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">AI Vetting</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Summary and themes from verified reviews
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    {provider.ai_review_summary ? (
                        <p className="leading-relaxed">{provider.ai_review_summary}</p>
                    ) : (
                        <p className="text-muted-foreground">No AI summary available yet.</p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <p className="mb-2 text-sm font-medium text-green-700 dark:text-green-400">
                                Pros
                            </p>
                            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                                {(provider.positives ?? []).length > 0 ? (
                                    (provider.positives ?? []).map((p, i) => (
                                        <li key={i}>{p}</li>
                                    ))
                                ) : (
                                    <li>—</li>
                                )}
                            </ul>
                        </div>
                        <div>
                            <p className="mb-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                                Cons
                            </p>
                            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                                {(provider.negatives ?? []).length > 0 ? (
                                    (provider.negatives ?? []).map((n, i) => (
                                        <li key={i}>{n}</li>
                                    ))
                                ) : (
                                    <li>—</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Performance</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Scores derived from customer reviews (1–10)
                    </p>
                </CardHeader>
                <CardContent>
                    <PerformanceRadar metrics={metrics} />
                    {provider.total_jobs_completed > 0 && (
                        <p className="mt-3 text-center text-sm text-muted-foreground">
                            {provider.total_jobs_completed} jobs completed on platform
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Gallery</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Our Work (pro uploads) and Real Results (customer photos)
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Button
                            variant={galleryTab === 'our-work' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setGalleryTab('our-work')}
                        >
                            Our Work
                        </Button>
                        <Button
                            variant={galleryTab === 'real-results' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setGalleryTab('real-results')}
                        >
                            Real Results
                        </Button>
                    </div>
                    <div className="mt-4">
                        {galleryTab === 'our-work' ? (
                            <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
                                Portfolio images will appear here once uploaded to the showcase.
                            </div>
                        ) : (
                            <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
                                Customer review photos will appear here after completed jobs.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {provider.locations.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Service areas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {provider.locations.map((loc) => (
                                <li key={loc.id} className="flex flex-col text-sm">
                                    <span className="font-medium">{loc.nickname || loc.address}</span>
                                    {loc.nickname && loc.address && (
                                        <span className="text-muted-foreground">{loc.address}</span>
                                    )}
                                    <span className="text-muted-foreground">
                                        Radius: {loc.service_radius_km} km
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {provider.main_description && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">About</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="whitespace-pre-wrap text-muted-foreground">
                            {provider.main_description}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
