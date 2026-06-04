'use client';

import type { ReactNode } from 'react';

/**
 * Section wrapper for the de-tabbed reviews block.
 *
 * The detailed review cards/forms continue to live in `ProReviewsTab`; this
 * component only adds the consistent `rounded-3xl` card styling and the
 * single-scroll heading used across the redesigned contractor page.
 */
export function ReviewsSection({
    title = 'Reviews',
    headingId = 'contractor-reviews-heading',
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
