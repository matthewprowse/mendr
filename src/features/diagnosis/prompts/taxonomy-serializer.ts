/**
 * Phase 5 of the Diagnosis Architecture Hardening Plan.
 *
 * Serialises `TAXONOMY_SUBCATEGORIES` (plus `SERVICE_LABELS` and
 * `EXCLUDED_SERVICES`) into the structured block injected into the V2 system
 * prompt at runtime. Bucket B content (trade scopes, disambiguation excludes,
 * supported/excluded lists) flows from data → prompt here — the prompt body
 * itself contains zero trade names.
 *
 * See: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 5
 * See: docs/prompt-content-audit.md (Bucket B rows)
 */

import {
    TAXONOMY_NONE_ID,
    TAXONOMY_SUBCATEGORIES,
    type CanonicalTradeLabel,
    type TaxonomySubcategory,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';
import { EXCLUDED_SERVICES, SERVICE_LABELS } from '@/lib/services';

/**
 * Trade taxonomy block — the structured snapshot the V2 prompt uses to route
 * every diagnosis. Replaces the prose-embedded "Security / Plumbing / ..."
 * lists and the "pool vs borehole vs irrigation, gate vs garage door" examples
 * Bucket B content audited out in Phase 1.
 */
export function buildTaxonomyPromptBlock(): string {
    const byTrade = new Map<CanonicalTradeLabel, TaxonomySubcategory[]>();
    for (const row of TAXONOMY_SUBCATEGORIES) {
        const list = byTrade.get(row.trade) ?? [];
        list.push(row);
        byTrade.set(row.trade, list);
    }

    const lines: string[] = [
        'TRADE TAXONOMY (use this to classify; do not infer trade scopes from training data)',
        '',
        'Rules:',
        '  • Match by SCOPE, not by keywords. Find the subcategory whose scope description best',
        '    matches the component or system the user is describing.',
        `  • Use "${TAXONOMY_NONE_ID}" only when no scope applies at all.`,
        '  • When subcategory_id is set, "trade" and "trade_detail" MUST match the row exactly.',
        '  • The Excludes line on each row tells you what does NOT belong, with the correct',
        '    destination subcategory. Follow these boundaries; they are not optional.',
        '',
    ];

    for (const trade of SERVICE_LABELS) {
        const rows = byTrade.get(trade);
        if (!rows?.length) continue;
        lines.push(trade);
        for (const r of rows) {
            lines.push(`  • ${r.id} — "${r.label}"`);
            lines.push(`    Scope: ${r.scope}`);
            if (r.excludes?.length) {
                lines.push(`    Excludes: ${r.excludes.join(' | ')}`);
            }
        }
        lines.push('');
    }

    return lines.join('\n').trim();
}

/**
 * Supported service labels block — the canonical enum injected into the V2
 * prompt at runtime instead of hard-coding "Electrical, Plumbing, Security, ..."
 * in the prompt body (Bucket B audit rows 11 and 21).
 */
export function buildSupportedServicesBlock(): string {
    return [
        'SUPPORTED TRADES (the only valid `trade` values besides "N/A"):',
        SERVICE_LABELS.join(', '),
    ].join('\n');
}

/**
 * Excluded services block — categories Mendr does NOT offer. The model uses
 * this to set `unserviced: true` deterministically (Bucket B audit row 22).
 */
export function buildExcludedServicesBlock(): string {
    if (EXCLUDED_SERVICES.length === 0) return '';
    const bullets = EXCLUDED_SERVICES.map((s) => `  • ${s}`).join('\n');
    return [
        'EXPLICITLY UNSERVICED (set unserviced=true if the user asks for one of these):',
        bullets,
    ].join('\n');
}

/**
 * Convenience: every Bucket B block stacked together in the order the V2
 * composer injects them. Used by the drift-detection test to verify no trade
 * names leak into the V2 prompt outside of these blocks.
 */
export function buildAllBucketBBlocks(): string {
    return [
        buildSupportedServicesBlock(),
        buildExcludedServicesBlock(),
        buildTaxonomyPromptBlock(),
    ]
        .filter((s) => s.trim().length > 0)
        .join('\n\n');
}
