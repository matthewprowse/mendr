/**
 * Tiny presentational helpers shared by every step (labels, step header).
 * Pulled out of the monolithic client so each step file can import them
 * without dragging the whole wizard in.
 */

import { Label } from '@/components/ui/label';

export function RequiredLabel({
    htmlFor,
    children,
}: {
    htmlFor?: string;
    children: React.ReactNode;
}) {
    // Required fields get a small muted "Required" note on the far right.
    return (
        <div className="flex items-center justify-between gap-2">
            <Label htmlFor={htmlFor}>{children}</Label>
            <span className="shrink-0 text-xs text-muted-foreground">Required</span>
        </div>
    );
}

export function OptionalLabel({
    htmlFor,
    children,
}: {
    htmlFor?: string;
    children: React.ReactNode;
}) {
    // Optional fields show just the label, no badge or note.
    return <Label htmlFor={htmlFor}>{children}</Label>;
}

export function StepHeader({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    // Matches the centred StepHeading used across /start, /diagnosis, /match:
    // text-2xl semibold title + muted subtitle, centre-aligned, gap-3.
    return (
        <div className="flex w-full flex-col items-center gap-3 text-center">
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    );
}

/** In-step section heading — matches the `text-lg font-semibold` section pattern. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
    return <h2 className="text-lg font-semibold text-foreground">{children}</h2>;
}
