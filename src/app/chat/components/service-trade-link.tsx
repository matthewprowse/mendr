'use client';

import { tradeToServiceLabel } from '@/lib/services';

type ServiceTradeLinkProps = {
    trade: string;
    className?: string;
};

/** Renders the canonical service name as plain text. Maps AI trade variations to service labels. */
export function ServiceTradeLink({ trade, className }: ServiceTradeLinkProps) {
    const displayLabel = tradeToServiceLabel(trade) ?? trade;
    if (!displayLabel) return null;

    return (
        <span
            className={className ?? 'text-sm font-medium text-muted-foreground'}
        >
            {displayLabel}
        </span>
    );
}
