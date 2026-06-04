'use client';

import type { ReactNode } from 'react';
import { INK } from '@/lib/design-tokens';

/**
 * Section wrapper for the de-tabbed gallery block. Photo grid, lightbox and
 * upload modal continue to live in `ProGalleryTab`; this just establishes the
 * consistent card chrome used across the redesigned contractor page.
 */
export function GallerySection({
    title = 'Gallery',
    headingId = 'contractor-gallery-heading',
    children,
}: {
    title?: string;
    headingId?: string;
    children: ReactNode;
}) {
    return (
        <section
            className="rounded-3xl border border-black/[0.07] bg-white p-4 sm:p-5"
            aria-labelledby={headingId}
        >
            <h2 id={headingId} className="mb-3 text-base font-semibold" style={{ color: INK }}>
                {title}
            </h2>
            <div className="-mx-1">{children}</div>
        </section>
    );
}
