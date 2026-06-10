'use client';

import { Input } from '@/components/ui/input';
import { Loader, Crosshair } from 'lucide-react';

/** Address search input with the "use current location" crosshair button. */
export function AddressSearchField({
    value,
    onValueChange,
    onSubmit,
    inputDisabled,
    locateDisabled,
    isLocating,
    onUseCurrentLocation,
}: {
    value: string;
    onValueChange: (value: string) => void;
    onSubmit: () => void;
    inputDisabled: boolean;
    locateDisabled: boolean;
    isLocating: boolean;
    onUseCurrentLocation: () => void;
}) {
    return (
        <div className="relative w-full">
            <Input
                id="match-address-input"
                placeholder="Search address"
                className="h-10 w-full pr-10 text-sm"
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    onSubmit();
                }}
                disabled={inputDisabled}
            />
            <button
                type="button"
                aria-label="Use current location"
                className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                disabled={locateDisabled}
                onClick={onUseCurrentLocation}
            >
                {isLocating ? (
                    <Loader size={16} className="animate-spin" />
                ) : (
                    <Crosshair size={16} />
                )}
            </button>
        </div>
    );
}
