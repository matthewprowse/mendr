/**
 * Tiny presentational helpers shared by every step (labels, step header).
 * Pulled out of the monolithic client so each step file can import them
 * without dragging the whole wizard in.
 */

import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export function RequiredLabel({
    htmlFor,
    children,
}: {
    htmlFor?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between">
            <Label htmlFor={htmlFor}>{children}</Label>
            <Badge variant="secondary">Required</Badge>
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
    return (
        <div className="flex items-center justify-between">
            <Label htmlFor={htmlFor}>{children}</Label>
            <Badge variant="secondary">Optional</Badge>
        </div>
    );
}

export function StepHeader({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    );
}
