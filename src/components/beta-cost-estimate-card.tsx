'use client';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { DiagnosisData } from '@/app/chat/components/types';
import { getBetaCostEstimateRows, hasRenderableBetaCostEstimate } from '@/lib/diagnosis-display';
import { cn, sanitizeAiContent } from '@/lib/utils';

type BetaCostEstimateCardProps = {
    diagnosis: DiagnosisData | Record<string, unknown> | null | undefined;
};

/** Favicons shown in the header stack (matches max Brave calls budget server-side). */
const VISIBLE_SOURCE_AVATARS = 3;

function faviconUrlForLink(url: string): string {
    try {
        const host = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    } catch {
        return '';
    }
}

type NormalizedSource = {
    url: string;
    title: string;
    snippet?: string;
    intent?: string;
};

function normalizeMarketSources(raw: DiagnosisData['market_rates'] | undefined): NormalizedSource[] {
    const s = raw?.sources;
    if (!Array.isArray(s)) return [];
    return s.filter(
        (x): x is NormalizedSource =>
            x != null &&
            typeof x === 'object' &&
            typeof (x as { url?: unknown }).url === 'string' &&
            String((x as { url: string }).url).trim().length > 0
    );
}

function sourceLinkTitle(s: NormalizedSource): string {
    let host = '';
    try {
        host = new URL(s.url).hostname;
    } catch {
        host = s.url;
    }
    const t = (s.title || '').trim();
    return t ? `${t} (${host})` : host;
}

function SourceAvatarStack({ sources }: { sources: NormalizedSource[] }) {
    const visible = sources.slice(0, VISIBLE_SOURCE_AVATARS);
    const extra = sources.length - VISIBLE_SOURCE_AVATARS;
    if (visible.length === 0) return null;

    return (
        <div
            className="flex shrink-0 flex-row items-center justify-end"
            aria-label="Web sources used for cost research"
        >
            <div className="flex flex-row items-center ps-1">
                {visible.map((s, i) => {
                    const icon = faviconUrlForLink(s.url);
                    return (
                        <a
                            key={s.url}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={sourceLinkTitle(s)}
                            className={cn(
                                'relative inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-muted shadow-sm ring-2 ring-background transition-transform',
                                'hover:z-[30] hover:scale-110 focus-visible:z-[30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                i > 0 && '-ms-2'
                            )}
                            style={{ zIndex: i + 1 }}
                        >
                            {icon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={icon}
                                    alt=""
                                    className="size-full object-cover"
                                    width={24}
                                    height={24}
                                />
                            ) : (
                                <span className="block size-full bg-muted" />
                            )}
                        </a>
                    );
                })}
                {extra > 0 ? (
                    <span
                        className="relative z-[20] -ms-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold tabular-nums leading-none text-muted-foreground ring-2 ring-background"
                        title={`${extra} more source${extra === 1 ? '' : 's'}`}
                    >
                        +{extra}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

export function BetaCostEstimateCard({ diagnosis }: BetaCostEstimateCardProps) {
    const record = diagnosis as Record<string, unknown> | null | undefined;
    const typed = diagnosis as DiagnosisData | null | undefined;
    const sources = normalizeMarketSources(typed?.market_rates);
    const showCosts = hasRenderableBetaCostEstimate(record);
    const rows = showCosts ? getBetaCostEstimateRows(record) : [];
    const marketRatesFetchedAt =
        typeof typed?.market_rates?.fetched_at === 'string' &&
        typed.market_rates.fetched_at.trim().length > 0;

    const showCard = showCosts || sources.length > 0 || marketRatesFetchedAt;
    if (!showCard) return null;

    return (
        <>
            <Separator className="my-2" />
            <div className="flex flex-col gap-4">
                <div className="flex flex-row items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-row flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">Cost Estimate</span>
                        <Badge variant="secondary" className="shrink-0">
                            Beta
                        </Badge>
                    </div>
                    <SourceAvatarStack sources={sources} />
                </div>
                {rows.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {rows.map((row, idx) => (
                            <p
                                key={`summary-${idx}-${row.value.slice(0, 32)}`}
                                className="text-sm leading-relaxed text-foreground whitespace-pre-wrap"
                            >
                                {sanitizeAiContent(row.value)}
                            </p>
                        ))}
                    </div>
                ) : null}
                {marketRatesFetchedAt && sources.length === 0 ? (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        No web source links were returned. Set{' '}
                        <code className="text-xs">BRAVE_SEARCH_API_KEY</code> on the server, or inspect{' '}
                        <code className="text-xs">web_search.calls</code> on the market-rates research
                        response.
                    </p>
                ) : null}
                <p className="text-xs text-muted-foreground leading-relaxed">
                    This is an indicative ballpark for similar work, not a formal quote or guarantee.
                    Always confirm scope and pricing with contractors on site before you commit.
                </p>
            </div>
        </>
    );
}
