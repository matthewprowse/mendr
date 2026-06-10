'use client';

import { useEffect, useState } from 'react';
import type { CostEstimate } from '@/lib/cost/estimate-cost';

const ZAR = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
});

function formatRange(low: number, high: number): string {
    return low === high ? ZAR.format(low) : `${ZAR.format(low)} – ${ZAR.format(high)}`;
}

/**
 * "Estimated Cost" section for the diagnosis page. Follows the homeowner-page
 * section pattern (Settings/History): a text-lg section heading with a muted
 * sub-line, then plain label/value rows — not a bordered card. Lazily fetches
 * (and on first view, generates) the estimate, and renders nothing when there
 * is none (rejected/unserviced diagnoses, or a failure).
 */
export function CostEstimateSection({ conversationId }: { conversationId: string }) {
    const [estimate, setEstimate] = useState<CostEstimate | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'hidden'>('loading');

    useEffect(() => {
        let cancelled = false;
        setStatus('loading');
        fetch(`/api/diagnoses/${encodeURIComponent(conversationId)}/cost-estimate`)
            .then((r) => (r.ok ? r.json() : null))
            .then((j: { estimate?: CostEstimate | null } | null) => {
                if (cancelled) return;
                const est = j?.estimate;
                if (est && Array.isArray(est.line_items) && est.line_items.length > 0) {
                    setEstimate(est);
                    setStatus('ready');
                } else {
                    setStatus('hidden');
                }
            })
            .catch(() => {
                if (!cancelled) setStatus('hidden');
            });
        return () => {
            cancelled = true;
        };
    }, [conversationId]);

    if (status === 'hidden') return null;

    return (
        <section className="flex flex-col gap-3 border-t border-border pt-5">
            <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-foreground">Estimated Cost</h2>
                <p className="text-sm text-muted-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
                    tempor incididunt ut labore et dolore magna aliqua.
                </p>
            </div>

            {status === 'loading' || !estimate ? (
                <div className="flex flex-col">
                    <div className="flex items-baseline justify-between gap-4 py-2">
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="flex flex-col">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-baseline justify-between gap-4 py-1.5">
                                <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
                                <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col">
                    <div className="flex items-baseline justify-between gap-4 py-2">
                        <p className="text-sm font-semibold text-foreground">Total</p>
                        <p className="text-base font-semibold text-foreground tabular-nums">
                            {formatRange(estimate.low, estimate.high)}
                        </p>
                    </div>
                    <div className="flex flex-col">
                        {estimate.line_items.map((li, i) => (
                            <div
                                key={i}
                                className="flex items-baseline justify-between gap-4 py-1.5"
                            >
                                <p className="text-sm text-muted-foreground">{li.label}</p>
                                <p className="text-sm text-foreground tabular-nums">
                                    {formatRange(li.low, li.high)}
                                </p>
                            </div>
                        ))}
                    </div>
                    {estimate.note ? (
                        <p className="pt-2 text-xs text-muted-foreground">{estimate.note}</p>
                    ) : null}
                </div>
            )}
        </section>
    );
}
