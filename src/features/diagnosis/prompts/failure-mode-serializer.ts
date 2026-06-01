/**
 * Failure-mode prompt serialiser.
 *
 * Turns the structured `failureModes` catalog on a `TaxonomySubcategory`
 * into a compact prompt block that gets injected into Agent 2b's system
 * instruction at runtime. The model reasons against the failure modes
 * (cues + repair scope + urgency) instead of relying on its general
 * training to guess SA-residential failure patterns.
 *
 * Architecture rules:
 *   - This is Bucket B (structured domain knowledge as data). No per-case
 *     patches. The serialiser is purely mechanical: feed it a subcategory,
 *     get back a prompt block.
 *   - Only the relevant subcategory's failure modes are injected — never
 *     the full 30+ subcategory catalog — to keep prompt size bounded.
 *   - When a subcategory has no `failureModes` declared (rollout in
 *     progress), the serialiser returns an empty string. Agent 2b falls
 *     back to general-knowledge reasoning. No regression on existing
 *     behaviour.
 *
 * Architecture Hardening Plan reference: Phase 2 of the
 * Diagnostic-Accuracy-Hardening-Plan.md.
 */

import {
    type FailureMode,
    type TaxonomySubcategory,
    getSubcategoryById,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';

const COST_BAND_DESCRIPTIONS: Record<FailureMode['typicalRepair']['costBand'], string> = {
    minor: 'minor repair (under R1,000)',
    medium: 'mid-range repair (R1,000 – R5,000)',
    major: 'major repair (R5,000 – R15,000)',
    replacement: 'full replacement (R10,000+)',
};

const URGENCY_DESCRIPTIONS: Record<FailureMode['urgency'], string> = {
    now: 'address immediately (safety or escalating damage)',
    soon: 'address within days (degrades if unattended)',
    planned: 'schedule when convenient',
};

function renderFailureMode(mode: FailureMode): string {
    const cueLines = mode.diagnosticCues.map(
        (c) => `    - ${c.type.toUpperCase()}: ${c.description}`,
    );
    return [
        `[${mode.id}]  ${mode.label}`,
        `  Description: ${mode.description}`,
        `  Cues:`,
        ...cueLines,
        `  Typical repair: ${mode.typicalRepair.summary}`,
        `  Cost band: ${COST_BAND_DESCRIPTIONS[mode.typicalRepair.costBand]}.`,
        `  Urgency: ${URGENCY_DESCRIPTIONS[mode.urgency]}.`,
    ].join('\n');
}

/**
 * Build the prompt block for a single subcategory's failure modes. Returns
 * empty string when the subcategory has no catalog yet (still in rollout).
 */
export function buildFailureModeBlock(subcategoryId: string): string {
    if (!subcategoryId || subcategoryId === 'none_unmapped') return '';
    const sub = getSubcategoryById(subcategoryId);
    if (!sub || !sub.failureModes || sub.failureModes.length === 0) return '';

    const intro = [
        `KNOWN FAILURE MODES FOR ${sub.label} (subcategory_id: ${sub.id}).`,
        '',
        'These are the recognised patterns for this subcategory in South African residential context.',
        'Reason against the cues — count how many cues match the visible evidence + the homeowner\'s description.',
        'Rules:',
        '  1. When ≥2 cues for ONE failure mode match: name that failure mode\'s label as the diagnosis title and its id as the failed_component anchor. The visible damage from cascading effects goes in cascading_damage.',
        '  2. When cues split across multiple failure modes (no clear winner): set requires_clarification=true and produce a structured_clarification with the top 2 failure modes as hypotheses.',
        '  3. When NO failure mode\'s cues match: do NOT force one. Acknowledge the unknown and produce a clarifying question or a site-visit recommendation.',
        '',
        '─── Catalog ───',
    ].join('\n');

    const body = sub.failureModes.map(renderFailureMode).join('\n\n');

    return [intro, body].join('\n\n');
}

/**
 * Sibling subcategories worth weighing as alternatives. The model sees
 * the primary subcategory's full catalog AND the top failure mode from
 * each declared sibling (via `excludes`). This handles the "geyser fault
 * vs water pressure issue" disambiguation: both subcategories' top
 * failure modes are visible, model can pick the better fit.
 *
 * Returns empty string when no sibling has a populated catalog.
 */
export function buildSiblingFailureModeHints(subcategoryId: string): string {
    const sub = getSubcategoryById(subcategoryId);
    if (!sub || !sub.excludes || sub.excludes.length === 0) return '';

    // `excludes` is an array of free-text exclusion notes like
    // "Pool pump (→ pool_pump_filter)". Extract subcategory_ids from
    // trailing `→ <id>` markers.
    const siblingIds = sub.excludes
        .map((line) => {
            const m = line.match(/→\s*([a-z0-9_]+)/i);
            return m ? m[1] : null;
        })
        .filter((id): id is string => id !== null);

    if (siblingIds.length === 0) return '';

    const blocks: string[] = [];
    for (const sid of siblingIds) {
        const sibling = getSubcategoryById(sid);
        if (!sibling || !sibling.failureModes || sibling.failureModes.length === 0) continue;
        const top = sibling.failureModes[0];
        blocks.push(
            [
                `If your evidence actually fits "${sibling.label}" (subcategory ${sibling.id}) instead, the top failure mode there is:`,
                `[${top.id}]  ${top.label}`,
                `  ${top.description}`,
                `  Top cue: ${top.diagnosticCues[0]?.description ?? '(no cues defined)'}.`,
            ].join('\n'),
        );
    }

    if (blocks.length === 0) return '';
    return [
        'SIBLING SUBCATEGORIES — consider these only if your evidence points away from the primary subcategory above:',
        ...blocks,
    ].join('\n\n');
}

/**
 * Combined block: primary subcategory's full catalog + sibling top
 * failure modes for cross-subcategory disambiguation. Empty string when
 * neither has any catalog content yet.
 */
export function buildCatalogBlockForClassification(subcategoryId: string): string {
    const primary = buildFailureModeBlock(subcategoryId);
    const siblings = buildSiblingFailureModeHints(subcategoryId);
    return [primary, siblings].filter((s) => s.length > 0).join('\n\n');
}

/**
 * Re-export the lookup helper so the serialiser is self-contained for
 * callers that only need to know whether a subcategory has a catalog.
 */
export function hasFailureModeCatalog(subcategoryId: string): boolean {
    const sub = getSubcategoryById(subcategoryId);
    return Boolean(sub && sub.failureModes && sub.failureModes.length > 0);
}

export type { FailureMode, TaxonomySubcategory };
