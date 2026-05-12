'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiagnosisData } from '@/features/diagnosis/types';
import { getBetaCostEstimateRows, hasRenderableBetaCostEstimate } from '@/lib/diagnosis-display';
import { sanitizeAiContent } from '@/lib/utils';
import { coerceWholeRand } from '@/lib/parts-prices/coerce-rand';
import type { PartPrice } from '@/lib/parts-prices/types';

const INK = '#16120E';

type BetaCostEstimateCardProps = {
    diagnosis: DiagnosisData | Record<string, unknown> | null | undefined;
};

// ── Source avatars ─────────────────────────────────────────────────────────────

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

function sourceDisplayName(s: NormalizedSource): string {
    const t = (s.title || '').trim();
    if (t) return t;
    try {
        return new URL(s.url).hostname;
    } catch {
        return s.url;
    }
}

function SourceAvatarStack({ sources }: { sources: NormalizedSource[] }) {
    const visible = sources.slice(0, VISIBLE_SOURCE_AVATARS);
    const extra = sources.length - VISIBLE_SOURCE_AVATARS;
    const [expanded, setExpanded] = useState(false);
    if (visible.length === 0) return null;

    return (
        <div className="flex w-full flex-col gap-2" aria-label="Web sources used for cost research">
            <div className="flex flex-row items-center justify-between gap-3">
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
                            className="relative inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-white transition-transform hover:z-[30] hover:scale-110"
                            style={{ zIndex: i + 1, marginLeft: i > 0 ? '-6px' : undefined }}
                        >
                            {icon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={icon}
                                    alt=""
                                    className="size-full object-cover"
                                    width={20}
                                    height={20}
                                />
                            ) : (
                                <span className="block size-full bg-white" />
                            )}
                        </a>
                    );
                })}
                {extra > 0 ? (
                    <span
                        className="relative z-[20] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-semibold tabular-nums leading-none text-foreground ring-2 ring-white"
                        style={{ marginLeft: '-6px' }}
                        title={`${extra} more source${extra === 1 ? '' : 's'}`}
                    >
                        +{extra}
                    </span>
                ) : null}
                </div>
                <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => setExpanded((prev) => !prev)}
                >
                    {expanded ? 'View Less' : 'View More'}
                </button>
            </div>
            <div
                className={`grid transition-all duration-200 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
            >
                <div className="overflow-hidden">
                    <div className="flex flex-col gap-3 pt-1">
                        {sources.map((s, idx) => {
                            const icon = faviconUrlForLink(s.url);
                            return (
                                <div key={`${s.url}-${idx}`} className="flex items-center gap-3">
                                    <a
                                        href={s.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={sourceLinkTitle(s)}
                                        className="inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-border"
                                    >
                                        {icon ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={icon}
                                                alt=""
                                                className="size-full object-cover"
                                                width={20}
                                                height={20}
                                            />
                                        ) : (
                                            <span className="block size-full bg-white" />
                                        )}
                                    </a>
                                    <a
                                        href={s.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="min-w-0 truncate text-sm text-foreground underline underline-offset-2"
                                        title={sourceLinkTitle(s)}
                                    >
                                        {sanitizeAiContent(sourceDisplayName(s))}
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Parts breakdown ────────────────────────────────────────────────────────────

function formatZarWhole(n: number): string {
    return `R${Math.round(n).toLocaleString('en-ZA')}`;
}

function normalizePartKey(value: string): string {
    return value.trim().toLowerCase();
}

/** Normalise a row loaded from persisted `diagnosis.expected_part_prices` JSON. */
function normalizeStoredPartPrice(r: {
    part_name?: unknown;
    variant?: unknown;
    price_min?: unknown;
    price_max?: unknown;
    price_display?: unknown;
    min_price?: unknown;
    max_price?: unknown;
    price_displayed?: unknown;
    from_cache?: unknown;
}): PartPrice {
    const part_name = typeof r.part_name === 'string' ? r.part_name : '';
    const normalizedMin = coerceWholeRand(r.price_min ?? r.min_price);
    const normalizedMax = coerceWholeRand(r.price_max ?? r.max_price);
    const normalizedDisplayRaw = r.price_display ?? r.price_displayed;
    return {
        part_name,
        variant: typeof r.variant === 'string' ? r.variant : '',
        price_min: normalizedMin,
        price_max: normalizedMax,
        price_display:
            typeof normalizedDisplayRaw === 'string' && normalizedDisplayRaw.trim()
                ? normalizedDisplayRaw.trim()
                : null,
        from_cache: Boolean(r.from_cache),
    };
}

/** Prefer `price_display`; otherwise build a range from min/max when present. */
function formatPartPriceLine(price: PartPrice): string {
    if (price.price_display?.trim()) return price.price_display.trim();
    const min = price.price_min;
    const max = price.price_max;
    if (min != null && max != null && min !== max) {
        return `${formatZarWhole(min)}–${formatZarWhole(max)}`;
    }
    if (min != null) return formatZarWhole(min);
    if (max != null) return formatZarWhole(max);
    return '';
}

function storedPartPricesComplete(
    parts: string[],
    rows: DiagnosisData['expected_part_prices'] | undefined,
): boolean {
    if (parts.length === 0) return false;
    if (!Array.isArray(rows) || rows.length === 0) return false;
    return parts.every((p) => {
        const row = rows.find(
            (r) => normalizePartKey(String(r?.part_name ?? '')) === normalizePartKey(p)
        );
        if (!row) return false;
        return formatPartPriceLine(normalizeStoredPartPrice(row)).length > 0;
    });
}

function PartRow({ name, price, loading }: { name: string; price: PartPrice | null; loading: boolean }) {
    const line = price === null ? null : formatPartPriceLine(price);
    return (
        <div className="flex flex-row items-center justify-between gap-3 py-1">
            <div className="flex flex-row items-center gap-2 min-w-0">
                <span className="h-1 w-1 shrink-0 rounded-full bg-black/20" />
                <span className="text-sm text-foreground truncate">{sanitizeAiContent(name)}</span>
            </div>
            <span className="shrink-0 text-sm tabular-nums text-foreground font-semibold">
                {loading && (price === null || !line) ? (
                    <span className="inline-block h-3 w-14 animate-pulse rounded bg-black/[0.06]" />
                ) : !line ? (
                    'Price unavailable'
                ) : (
                    line
                )}
            </span>
        </div>
    );
}

function ExpectedPartsBreakdown({
    parts,
    prices,
    loading,
}: {
    parts: string[];
    prices: Map<string, PartPrice>;
    loading: boolean;
}) {
    const cleaned = parts.filter((p) => typeof p === 'string' && p.trim().length > 0);
    if (cleaned.length === 0) return null;

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-col">
                {cleaned.map((part, idx) => (
                    <PartRow
                        key={`part-${idx}-${part.slice(0, 24)}`}
                        name={part}
                        loading={loading}
                        price={
                            loading && !prices.has(normalizePartKey(part))
                                ? null
                                : prices.get(normalizePartKey(part)) ?? {
                                      part_name: part,
                                      variant: '',
                                      price_min: null,
                                      price_max: null,
                                      price_display: null,
                                      from_cache: false,
                                  }
                        }
                    />
                ))}
            </div>
        </div>
    );
}

// ── Main card ──────────────────────────────────────────────────────────────────

export function BetaCostEstimateCard({ diagnosis }: BetaCostEstimateCardProps) {
    const record = diagnosis as Record<string, unknown> | null | undefined;
    const typed = diagnosis as DiagnosisData | null | undefined;
    const sources = normalizeMarketSources(typed?.market_rates);
    const showCosts = hasRenderableBetaCostEstimate(record);
    const rows = showCosts ? getBetaCostEstimateRows(record) : [];

    const expectedParts = Array.isArray(typed?.expected_parts)
        ? (typed.expected_parts as string[]).filter((p) => typeof p === 'string' && p.trim().length > 0)
        : [];
    // ── Parts price fetching ─────────────────────────────────────────────────
    const [prices, setPrices] = useState<Map<string, PartPrice>>(new Map());
    const [pricingLoading, setPricingLoading] = useState(false);
    const fetchedPartsKey = useRef<string>('');

    const storedPricesKey = JSON.stringify(typed?.expected_part_prices ?? []);

    useEffect(() => {
        const rows = typed?.expected_part_prices;
        if (!Array.isArray(rows) || rows.length === 0) return;
        setPrices((prev) => {
            const next = new Map(prev);
            for (const r of rows) {
                if (r && typeof r.part_name === 'string' && r.part_name.trim()) {
                    next.set(normalizePartKey(r.part_name), normalizeStoredPartPrice(r));
                }
            }
            return next;
        });
    }, [storedPricesKey, expectedParts.join('||')]);

    useEffect(() => {
        if (expectedParts.length === 0) return;
        const partsKey = expectedParts.join('||');

        if (storedPartPricesComplete(expectedParts, typed?.expected_part_prices)) {
            const m = new Map<string, PartPrice>();
            const rows = typed?.expected_part_prices;
            if (Array.isArray(rows)) {
                for (const r of rows) {
                    if (r?.part_name) m.set(normalizePartKey(r.part_name), normalizeStoredPartPrice(r));
                }
            }
            setPrices(m);
            fetchedPartsKey.current = partsKey;
            setPricingLoading(false);
            return;
        }

        if (fetchedPartsKey.current === partsKey) return;
        fetchedPartsKey.current = partsKey;

        const trade = typeof typed?.trade === 'string' ? typed.trade : 'General Handyman';
        const tradeDetail = typeof typed?.trade_detail === 'string' ? typed.trade_detail : '';

        setPricingLoading(true);
        fetch('/api/parts-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parts: expectedParts, trade, trade_detail: tradeDetail }),
        })
            .then((r) => r.json())
            .then((data: { results?: PartPrice[] }) => {
                const results = data.results;
                if (!Array.isArray(results)) return;
                setPrices((prev) => {
                    const map = new Map(prev);
                    for (const row of results) {
                        map.set(normalizePartKey(row.part_name), row);
                    }
                    return map;
                });
            })
            .catch(() => { /* silently degrade */ })
            .finally(() => setPricingLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expectedParts.join('||'), storedPricesKey]);

    const showCard = showCosts || sources.length > 0 || expectedParts.length > 0;
    if (!showCard) return null;

    return (
        <div className="flex flex-col gap-4 border-t border-black/[0.06] pt-4">
            <SourceAvatarStack sources={sources} />

            {/* Estimated cost summary */}
            {rows.length > 0 ? (
                <div className="flex flex-col gap-2">
                    {rows.map((row, idx) => (
                        <p
                            key={`summary-${idx}-${row.value.slice(0, 32)}`}
                            className="text-sm text-foreground whitespace-pre-wrap"
                        >
                            {sanitizeAiContent(row.value)}
                        </p>
                    ))}
                </div>
            ) : null}

            {/* Per-part breakdown with live prices */}
            {expectedParts.length > 0 ? (
                <ExpectedPartsBreakdown
                    parts={expectedParts}
                    prices={prices}
                    loading={pricingLoading}
                />
            ) : null}

            <p className="text-xs text-muted-foreground">
                Prices are indicative ballparks only. Always confirm scope and pricing with a contractor before committing.
            </p>
        </div>
    );
}
