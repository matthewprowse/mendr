'use client';

import type { ReactNode } from 'react';

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
            className="rounded-lg border border-border bg-card p-4"
            aria-labelledby={headingId}
        >
            <h2 id={headingId} className="mb-3 text-lg font-semibold text-foreground">
                {title}
            </h2>
            <div className="-mx-1">{children}</div>
        </section>
    );
}
