'use client';

import type { ReactNode } from 'react';
import { INK } from '@/lib/design-tokens';

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
