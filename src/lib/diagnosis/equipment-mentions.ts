/**
 * Equipment-mention extractor.
 *
 * Detects when the homeowner has named specific residential equipment in
 * their text or conversation history. The detection is authoritative:
 * if the user says "geyser", the diagnosis subcategory MUST be a
 * geyser-related subcategory — not the model's visual interpretation.
 *
 * Lives in `lib/diagnosis/` because it's pure logic (no Gemini calls)
 * usable both by the response-builder reconcile step (server) and tests.
 *
 * Mapping table is intentionally a small named whitelist of high-confidence
 * SA-residential equipment patterns. Adding a new equipment name is a
 * structural change (taxonomy data); never a fix for a single user case.
 * If you find yourself adding a pattern in response to a single bug
 * report, stop — that's a Bucket A patch in disguise.
 *
 * Architecture Hardening Plan reference: Phase 1 of the
 * Diagnostic-Accuracy-Hardening-Plan.md.
 */

import {
    type CanonicalTradeLabel,
    TAXONOMY_SUBCATEGORIES,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';

/** Possible confidence levels for a detected equipment mention. */
export type EquipmentMentionConfidence = 'high' | 'medium' | 'low';

export interface EquipmentMention {
    /** The exact lowercase phrase that matched. */
    readonly phrase: string;
    /** The subcategory_id the mention maps to. */
    readonly subcategoryId: string;
    /** How confident we are in this mapping. */
    readonly confidence: EquipmentMentionConfidence;
    /** Optional SA brand hint, surfaced for downstream prompt enrichment. */
    readonly brandHint?: string;
}

interface EquipmentPattern {
    /** Regex pattern (case-insensitive by default — we lowercase the input). */
    readonly match: RegExp;
    /** Target subcategory_id (must exist in TAXONOMY_SUBCATEGORIES). */
    readonly subcategoryId: string;
    /** Confidence in this mapping. */
    readonly confidence: EquipmentMentionConfidence;
    /** Brand name if the pattern includes one. */
    readonly brandHint?: string;
}

/**
 * High-confidence direct equipment patterns. Matching one of these
 * triggers the authoritative override in `reconcileEquipmentFromUserMentions`.
 *
 * Rules for adding a new pattern:
 *   1. The phrase must unambiguously name a piece of equipment in SA
 *      residential context (no "valve" — too generic; "tip valve" OK).
 *   2. The subcategory_id MUST exist in TAXONOMY_SUBCATEGORIES (enforced
 *      by an invariant test in __tests__/equipment-mentions.test.ts).
 *   3. If two different subcategories could match the phrase (e.g.
 *      "geyser" could be geyser_fault_plumbing OR geyser_electrical),
 *      use the MORE COMMON one as the primary mapping. The disambiguation
 *      between siblings is the model's job once it knows the equipment.
 *   4. No brand pattern by itself overrides — always paired with the
 *      equipment category (e.g. "Centurion gate motor" maps; "Centurion"
 *      alone does not).
 */
const HIGH_CONFIDENCE_PATTERNS: readonly EquipmentPattern[] = [
    // ── Plumbing — geyser family ─────────────────────────────────────────────
    {
        match: /\b(geyser|hot water cylinder|hot water heater|hwc)\b/i,
        subcategoryId: 'geyser_fault_plumbing',
        confidence: 'high',
    },
    {
        match: /\b(kwikot|heat[- ]?tech|heat ?light|techron|franke|gwd)\b/i,
        subcategoryId: 'geyser_fault_plumbing',
        confidence: 'high',
        brandHint: 'geyser-brand',
    },
    {
        match: /\b(tip valve|pressure relief valve|temperature pressure relief|tprv)\b/i,
        subcategoryId: 'geyser_fault_plumbing',
        confidence: 'high',
    },
    {
        match: /\b(geyser element|heating element|thermostat (?:on|in|of) (?:the |my )?geyser)\b/i,
        subcategoryId: 'geyser_electrical',
        confidence: 'high',
    },

    // ── Plumbing — drains / leaks / taps ─────────────────────────────────────
    {
        match: /\b(burst pipe|burst (?:water |main )?pipe|broken pipe)\b/i,
        subcategoryId: 'burst_pipe_leak',
        confidence: 'high',
    },
    {
        match: /\b(blocked drain|drain (?:is )?blocked|blocked (?:sewer|sewerage|toilet|sink|bath|shower drain))\b/i,
        subcategoryId: 'blocked_drain',
        confidence: 'high',
    },
    {
        match: /\b(leaking tap|dripping tap|broken tap|toilet (?:is )?leaking|toilet cistern|toilet flush|leaking toilet)\b/i,
        subcategoryId: 'tap_toilet_repair',
        confidence: 'high',
    },

    // ── Security — gate / garage ─────────────────────────────────────────────
    {
        match: /\b(gate motor|sliding gate|swing gate|driveway gate|automatic gate)\b/i,
        subcategoryId: 'gate_motor_fault',
        confidence: 'high',
    },
    {
        match: /\b(centurion(?: gate)?|et systems|dts gate|hansa gate)\b/i,
        subcategoryId: 'gate_motor_fault',
        confidence: 'high',
        brandHint: 'gate-motor-brand',
    },
    {
        match: /\b(garage door|roll[- ]?up door|sectional door|garage motor|chamberlain|liftmaster|digidoor|dooratech)\b/i,
        subcategoryId: 'garage_door_fault',
        confidence: 'high',
    },
    {
        match: /\b(intercom|access control|gate intercom|access panel|door entry)\b/i,
        subcategoryId: 'intercom_access_control',
        confidence: 'high',
    },
    {
        match: /\b(cctv|security camera|surveillance camera|dvr|nvr)\b/i,
        subcategoryId: 'cctv_camera_system',
        confidence: 'high',
    },
    {
        match: /\b(electric fence|fence energizer|fence energiser)\b/i,
        subcategoryId: 'electric_fence_fault',
        confidence: 'high',
    },

    // ── Electrical ───────────────────────────────────────────────────────────
    {
        match: /\b(db board|distribution board|main board|circuit (?:board|breaker)|breaker (?:keeps |is )?tripping|earth leakage|elcb|main switch)\b/i,
        subcategoryId: 'db_board_tripping',
        confidence: 'high',
    },
    {
        match: /\b(plug socket|wall socket|power point|broken socket|outlet (?:not |stopped )?working)\b/i,
        subcategoryId: 'lights_wiring',
        confidence: 'high',
    },
    {
        match: /\b(solar inverter|inverter (?:not |stopped )?working|sunsynk|growatt|deye|victron)\b/i,
        subcategoryId: 'solar_inverter',
        confidence: 'high',
    },
    {
        match: /\b(load shedding (?:damage|surge)|surge damage|lightning damage|power surge)\b/i,
        subcategoryId: 'load_shedding_surge',
        confidence: 'high',
    },

    // ── Locksmith ────────────────────────────────────────────────────────────
    {
        match: /\b(locked out|lockout|key broke (?:in |off in )?(?:the )?lock|stuck in (?:the )?lock)\b/i,
        subcategoryId: 'lockout_emergency',
        confidence: 'high',
    },
    {
        match: /\b(broken (?:door |security |slam )?lock|lock (?:is |has )?broken|lock replacement|deadbolt)\b/i,
        subcategoryId: 'lock_replacement',
        confidence: 'high',
    },
    {
        match: /\b(slam lock|gate lock|padlock)\b/i,
        subcategoryId: 'gate_padlock_security_lock',
        confidence: 'high',
    },

    // ── Pool ─────────────────────────────────────────────────────────────────
    {
        match: /\b(pool pump|pool filter|pool motor|pool weir|kreepy|baracuda|sand filter)\b/i,
        subcategoryId: 'pool_pump_filter',
        confidence: 'high',
    },
    {
        match: /\b(green pool|cloudy pool|algae|pool chlorine|salt chlorinator)\b/i,
        subcategoryId: 'pool_chemical_balance',
        confidence: 'high',
    },

    // ── Building / structural ────────────────────────────────────────────────
    {
        match: /\b(roof leak|roof (?:is )?leaking|ceiling (?:is )?leaking|water (?:coming |dripping )(?:through|from) (?:the )?ceiling)\b/i,
        subcategoryId: 'roof_leak_repair',
        confidence: 'high',
    },
    {
        match: /\b(rising damp|wall damp|damp(?:ness)? (?:in|on) (?:the )?wall|waterproofing)\b/i,
        subcategoryId: 'damp_waterproofing',
        confidence: 'high',
    },
    {
        match: /\b(retaining wall|boundary wall|garden wall (?:is )?(?:cracked|falling|collapsed))\b/i,
        subcategoryId: 'retaining_boundary_wall',
        confidence: 'high',
    },
    {
        match: /\b(jojo tank|water tank|rainwater tank|storage tank)\b/i,
        // JoJo tanks have no dedicated subcategory; nearest match is plumbing.
        // When this fires we drop confidence and let the model fill in detail.
        subcategoryId: 'water_pressure_supply',
        confidence: 'medium',
    },
] as const;

/**
 * Returns equipment mentions found anywhere in the inputs. De-duplicates
 * by `subcategoryId` (keeping the highest confidence per id). Order
 * preserved: first occurrence per subcategory wins.
 */
export function extractEquipmentMentions(
    primaryText: string | null | undefined,
    historyTexts?: ReadonlyArray<string | null | undefined>,
): EquipmentMention[] {
    const inputs: string[] = [];
    if (typeof primaryText === 'string' && primaryText.trim().length > 0) {
        inputs.push(primaryText);
    }
    if (Array.isArray(historyTexts)) {
        for (const h of historyTexts) {
            if (typeof h === 'string' && h.trim().length > 0) inputs.push(h);
        }
    }
    if (inputs.length === 0) return [];
    const combined = inputs.join(' \n ').toLowerCase();
    if (!combined.trim()) return [];

    // Highest-confidence-per-subcategory map; first occurrence wins on ties.
    const found = new Map<string, EquipmentMention>();
    for (const pattern of HIGH_CONFIDENCE_PATTERNS) {
        const m = combined.match(pattern.match);
        if (!m || !m[0]) continue;
        const phrase = m[0].trim();
        const candidate: EquipmentMention = {
            phrase,
            subcategoryId: pattern.subcategoryId,
            confidence: pattern.confidence,
            brandHint: pattern.brandHint,
        };
        const existing = found.get(pattern.subcategoryId);
        if (!existing) {
            found.set(pattern.subcategoryId, candidate);
            continue;
        }
        const order: Record<EquipmentMentionConfidence, number> = {
            high: 3,
            medium: 2,
            low: 1,
        };
        if (order[candidate.confidence] > order[existing.confidence]) {
            found.set(pattern.subcategoryId, candidate);
        }
    }
    return Array.from(found.values());
}

/**
 * Looks up the canonical trade for a given subcategory_id. Returns null
 * when the subcategory does not exist in the taxonomy. Used by the
 * reconcile step so trade and subcategory stay in lock-step.
 */
export function lookupTradeForSubcategory(
    subcategoryId: string,
): CanonicalTradeLabel | null {
    const row = TAXONOMY_SUBCATEGORIES.find((r) => r.id === subcategoryId);
    return row ? row.trade : null;
}

/**
 * For tests / invariants — every pattern's subcategoryId must exist in
 * TAXONOMY_SUBCATEGORIES. Exposed so the test suite can iterate.
 */
export const EQUIPMENT_MENTION_PATTERNS_FOR_TESTING = HIGH_CONFIDENCE_PATTERNS;
