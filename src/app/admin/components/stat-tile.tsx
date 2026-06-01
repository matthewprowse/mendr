'use client';

import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type AdminStatTileProps = {
    label: string;
    value: string | number;
    sub?: string;
    href?: string;
    icon?: LucideIcon;
    loading?: boolean;
};

/**
 * Shared admin stat tile, styled to the consumer front-end pattern (icon square,
 * soft surface, rounded-2xl). Replaces the five bespoke stat-card components that
 * had accumulated across the admin pages.
 */
export function AdminStatTile({ label, value, sub, href, icon: Icon, loading }: AdminStatTileProps) {
    const inner = (
        <div
            className={cn(
                'flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors',
                href && 'group hover:border-foreground/20 hover:bg-muted/30',
            )}
        >
            <div className="flex items-start justify-between">
                {Icon ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground">
                        <Icon className="h-5 w-5" />
                    </span>
                ) : (
                    <span />
                )}
                {href ? (
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                ) : null}
            </div>
            <div className="flex flex-col gap-1">
                {loading ? (
                    <div className="h-9 w-16 animate-pulse rounded-md bg-muted" />
                ) : (
                    <p className="text-3xl font-semibold text-foreground">{value}</p>
                )}
                <p className="text-sm font-medium text-foreground">{label}</p>
                {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
            </div>
        </div>
    );

    return href ? (
        <Link href={href} className="block">
            {inner}
        </Link>
    ) : (
        inner
    );
}
