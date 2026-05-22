import type { Metadata } from 'next';
import { ComingSoonClient } from './client';

export const metadata: Metadata = {
    title: 'Mendr — Launching Soon',
    description:
        'Home fault diagnosis for Western Cape homeowners. Launching soon.',
    robots: { index: false, follow: false },
};

/**
 * The sticky card stack needs to be a direct child of the scroll container
 * (the <body> / root layout div). We use a negative-margin escape hatch so the
 * cards span the full viewport width without the root layout's flex wrapper
 * interfering with the sticky positioning.
 */
export default function ComingSoonPage() {
    return (
        <div className="contents">
            <ComingSoonClient />
        </div>
    );
}
