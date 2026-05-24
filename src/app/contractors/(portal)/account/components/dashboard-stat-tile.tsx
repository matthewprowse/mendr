import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export interface DashboardStatTileProps {
    label: string;
    value: ReactNode;
    hint?: string;
}

/**
 * One stat tile for the contractor dashboard top row.
 * Server-renderable — no client-side state.
 */
export function DashboardStatTile({ label, value, hint }: DashboardStatTileProps) {
    return (
        <Card>
            <CardContent className="flex flex-col gap-1 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                </p>
                <p className="text-2xl font-semibold text-foreground">{value}</p>
                {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
            </CardContent>
        </Card>
    );
}
