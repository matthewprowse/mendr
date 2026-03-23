'use client';

import { ProvidersMap } from '@/app/chat/_components/providers-map';
import type { Provider } from '@/app/chat/_components/types';

type ProPageMapProps = {
    apiKey: string;
    provider: {
        name: string;
        address?: string;
        latitude: number;
        longitude: number;
    };
};

/**
 * Renders the same styled map as the match/report pages (ProvidersMap with mapId)
 * for the single provider on the pro profile page.
 */
export function ProPageMap({ apiKey, provider }: ProPageMapProps) {
    const mapProvider: Provider = {
        name: provider.name,
        address: provider.address ?? '',
        summary: '',
        services: [],
        latitude: provider.latitude,
        longitude: provider.longitude,
    };

    if (!apiKey) {
        return (
            <div className="flex h-48 w-full items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
                Map unavailable (no API key)
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ProvidersMap
                apiKey={apiKey}
                providers={[mapProvider]}
                emergingProviders={[]}
                nearbyOnlyProviders={[]}
                userLocation={null}
                hideFloatingCard
                className="w-full"
                mapInnerClassName="relative h-48 w-full"
            />
        </div>
    );
}
