import type { ReactNode } from 'react';

/**
 * Spacing aligned with scan-flow pages (welcome / diagnosis / match):
 * - `gap-8` between page title block and document body (set on parent <main>)
 * - `gap-8` between intro narrative and first section heading
 * - `gap-4` inside intro (matches form copy density on /welcome)
 * - `gap-6` between major sections (matches `max-w-xl flex-col gap-6` on /diagnosis)
 * - `gap-3` inside a section between h2 and body (matches diagnosis headline + image `gap-3`)
 */

export function LegalFlowDocument({ children }: { children: ReactNode }) {
    return <div className="flex flex-col gap-8">{children}</div>;
}

export function LegalFlowIntro({ children }: { children: ReactNode }) {
    return (
        <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
            {children}
        </div>
    );
}

export function LegalFlowSections({ children }: { children: ReactNode }) {
    return (
        <div className="flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
            {children}
        </div>
    );
}

/** One h2-led block: heading sits `gap-3` from the first line of content (FlowStep headline pattern). */
export function LegalFlowSection({ children }: { children: ReactNode }) {
    return <section className="flex flex-col gap-3">{children}</section>;
}

/** h3 groups under a single h2 (e.g. “The Service”) — slightly more air between subtopics than gap-3. */
export function LegalFlowSubsections({ children }: { children: ReactNode }) {
    return <div className="flex flex-col gap-4">{children}</div>;
}

export function LegalFlowSubsection({ children }: { children: ReactNode }) {
    return <div className="flex flex-col gap-3">{children}</div>;
}
