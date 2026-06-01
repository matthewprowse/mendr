'use client';

import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { PRO_TERM } from '@/lib/brand-system';

export type MatchNoProvidersEmptyProps = {
    onEditAddress: () => void;
};

export function MatchNoProvidersEmpty({ onEditAddress }: MatchNoProvidersEmptyProps) {
    return (
        <Empty
            className="border border-dashed border-border bg-card"
            role="status"
            aria-live="polite"
        >
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <MapPin />
                </EmptyMedia>
                <EmptyTitle>No {PRO_TERM.many} in This Search Area</EmptyTitle>
                <EmptyDescription>
                    Rural and low-density areas often have fewer listings. Try a larger
                    radius, a nearby town, or double-check the pin on the map.
                </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                <Button type="button" className="w-full" onClick={onEditAddress}>
                    Edit Address
                </Button>
            </EmptyContent>
        </Empty>
    );
}
