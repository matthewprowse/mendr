import type { DiagnosisData } from '@/app/chat/components/types';
import type { PartPrice } from './types';

/**
 * Fetches per-part ZAR estimates and attaches them to the diagnosis payload so they
 * persist on `diagnoses.diagnosis` JSON (not only in `parts_price_cache`).
 */
export async function enrichDiagnosisWithPartPrices(d: DiagnosisData): Promise<DiagnosisData> {
    const parts = Array.isArray(d.expected_parts)
        ? d.expected_parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        : [];
    if (parts.length === 0) return d;

    const trade = typeof d.trade === 'string' && d.trade.trim() ? d.trade.trim() : 'General Handyman';
    const trade_detail = typeof d.trade_detail === 'string' ? d.trade_detail.trim() : '';

    try {
        const res = await fetch('/api/parts-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parts, trade, trade_detail }),
        });
        if (!res.ok) return d;
        const data = (await res.json()) as { results?: PartPrice[] };
        const results = Array.isArray(data.results) ? data.results : [];
        if (results.length === 0) return d;
        return {
            ...d,
            expected_part_prices: results.map((row) => ({
                ...row,
                min_price: row.price_min,
                max_price: row.price_max,
                price_displayed: row.price_display,
            })),
        };
    } catch {
        return d;
    }
}
