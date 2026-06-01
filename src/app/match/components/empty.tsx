'use client';

import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { INK } from '@/lib/design-tokens';

export type MatchNoProvidersEmptyProps = {
    onEditAddress: () => void;
};

export function MatchNoProvidersEmpty({ onEditAddress }: MatchNoProvidersEmptyProps) {
    return (
        <div
            className="flex flex-col gap-4 rounded-3xl border border-black/[0.07] bg-white p-6 shadow-sm"
            role="status"
            aria-live="polite"
        >
            <div className="flex flex-col gap-2">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-black/[0.03]">
                    <MapPin size={24} className="text-muted-foreground" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold leading-tight" style={{ color: INK }}>Nothing in this search area</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Rural and low-density areas often have fewer listings. Try a larger radius, a nearby town, or
                    double-check the pin on the map.
                </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-4">
                <p className="text-sm font-semibold" style={{ color: INK }}>What you can try</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                        <span className="select-none text-muted-foreground/70" aria-hidden="true">·</span>
                        <span>Increase the search radius using the options above.</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="select-none text-muted-foreground/70" aria-hidden="true">·</span>
                        <span>Search from a nearby city or suburb.</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="select-none text-muted-foreground/70" aria-hidden="true">·</span>
                        <span>Confirm your address and search again.</span>
                    </li>
                </ul>
            </div>

            <Button type="button" className="w-full h-10 rounded-full" onClick={onEditAddress}>
                Edit address &amp; search again
            </Button>
        </div>
    );
}
