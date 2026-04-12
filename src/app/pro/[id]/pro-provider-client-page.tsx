'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { normalizeWebsiteUrl } from '@/lib/utils';
import { useProProvider } from '../hooks/use-provider';
import { ProPageMap } from './components/map';

type ProProviderClientPageProps = {
    providerId: string;
};

export function ProProviderClientPage({ providerId }: ProProviderClientPageProps) {
    const router = useRouter();
    const {
        providerName,
        providerAddress,
        providerLat,
        providerLng,
        providerSummary,
        providerSummaryLong,
        providerPhone,
        providerWebsiteRaw,
        providerIsOpen,
        isProviderLoading,
        providerSpecialisations,
    } = useProProvider(providerId);

    const websiteHref = useMemo(() => normalizeWebsiteUrl(providerWebsiteRaw), [providerWebsiteRaw]);
    const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    return (
        <main className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
                <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Go back">
                        <ArrowLeft className="size-4" />
                    </Button>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                            {providerName || 'Provider'}
                        </p>
                    </div>
                </div>
            </header>

            <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5">
                <div className="space-y-2">
                    {isProviderLoading ? (
                        <Skeleton className="h-8 w-56" />
                    ) : (
                        <h1 className="text-2xl font-bold text-foreground">{providerName || 'Provider'}</h1>
                    )}
                    {isProviderLoading ? (
                        <Skeleton className="h-4 w-72" />
                    ) : providerAddress ? (
                        <p className="text-sm text-muted-foreground">{providerAddress}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge variant="secondary">
                            {providerIsOpen === true ? 'Open now' : providerIsOpen === false ? 'Closed now' : 'Unknown'}
                        </Badge>
                        {providerSpecialisations.slice(0, 4).map((item) => (
                            <Badge key={item} variant="outline">
                                {item}
                            </Badge>
                        ))}
                    </div>
                </div>

                {providerLat != null && providerLng != null && providerName ? (
                    <ProPageMap
                        apiKey={mapsApiKey}
                        provider={{
                            name: providerName,
                            address: providerAddress || undefined,
                            latitude: providerLat,
                            longitude: providerLng,
                        }}
                    />
                ) : (
                    <div className="h-48 rounded-xl border border-border bg-muted/40" />
                )}

                <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        About this provider
                    </h2>
                    {isProviderLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-[95%]" />
                            <Skeleton className="h-4 w-[88%]" />
                        </div>
                    ) : (
                        <p className="text-sm leading-relaxed text-foreground/90">
                            {providerSummaryLong || providerSummary || 'No provider description available yet.'}
                        </p>
                    )}
                </section>

                <section className="flex flex-wrap gap-2">
                    {providerPhone ? (
                        <Button asChild>
                            <a href={`tel:${providerPhone}`}>
                                <Phone className="size-4" />
                                Call
                            </a>
                        </Button>
                    ) : null}
                    {websiteHref ? (
                        <Button variant="outline" asChild>
                            <a href={websiteHref} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="size-4" />
                                Website
                            </a>
                        </Button>
                    ) : null}
                </section>
            </section>
        </main>
    );
}
