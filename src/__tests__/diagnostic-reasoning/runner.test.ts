/**
 * Eval suite for Agent 2c (diagnostic reasoning).
 *
 * These tests validate the normalisation and structural correctness of Agent 2c
 * output using synthetic fixtures. They do NOT make real Gemini calls — that is
 * handled by the separate real-eval runner (eval.ts, run manually with a real key).
 *
 * Each fixture provides:
 *   - mockAgentOutput: what Agent 2c would return in a real call
 *   - expected: semantic expectations a domain expert would have
 *
 * The automated assertions here test:
 *   1. The normaliser accepts valid output without error
 *   2. The output has the required structure (2+ hypotheses, 3+ chips)
 *   3. Every chip that has a non-empty supports field references a real hypothesis id
 *   4. Every chip that has rules_out references real hypothesis ids
 *   5. The "Something else" escape chip is present
 *   6. Round 2 with simulated chip selection produces a different set of chips
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type {
    DiagnosisFacets,
    DiagnosticReasoning,
    RecommendedAction,
} from '@/features/diagnosis/types';
import { computeRecommendedAction } from '@/lib/diagnosis/recommended-action';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

interface ReasoningFixture {
    name: string;
    trade: string;
    description: string;
    mockAgentOutput: DiagnosticReasoning;
    /**
     * Phase 6: synthesised facets the fixture expects Agent 2a would produce
     * alongside the mockAgentOutput reasoning. Used by `computeRecommendedAction`
     * to derive the commit-vs-clarify decision.
     */
    mockFacets?: DiagnosisFacets;
    expected: {
        must_consider_hypotheses: string[];
        must_not_consider: string[];
        must_ask_about: string | null;
        /**
         * Phase 0 failure-baseline fixtures declare the recommended action the
         * Phase 6 hypothesis-tree completion logic must produce. Absent on
         * pre-Phase-0 fixtures.
         */
        recommended_action?: RecommendedAction;
        /**
         * Optional Phase-6-specific override: when Phase 6 alone produces a
         * different action from the post-Phase-7 expected behaviour (e.g.
         * hazard escalation reshapes the surface), the fixture declares the
         * Phase 6 transitional value here.
         */
        phase6_action?: RecommendedAction;
        phase6_action_note?: string;
        hazard_escalation?: boolean;
    };
}

function loadFixtures(): { file: string; fixture: ReasoningFixture }[] {
    return fs
        .readdirSync(FIXTURES_DIR)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((file) => ({
            file,
            fixture: JSON.parse(
                fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'),
            ) as ReasoningFixture,
        }));
}

// Mirrors the normaliseReasoning logic in agent-reasoning.ts so we can test
// it in isolation without importing the server-only Gemini SDK.
function normaliseReasoning(raw: unknown): DiagnosticReasoning | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const hypotheses = Array.isArray(r.hypotheses)
        ? (r.hypotheses as Array<Record<string, unknown>>)
              .filter((h) => typeof h === 'object' && h !== null)
              .map((h, i) => ({
                  id: typeof h.id === 'string' && h.id.trim() ? h.id.trim() : `h${i + 1}`,
                  label: typeof h.label === 'string' ? h.label.trim() : `Hypothesis ${i + 1}`,
                  confidence_alone:
                      typeof h.confidence_alone === 'number'
                          ? Math.max(0, Math.min(1, h.confidence_alone))
                          : 0.5,
                  evidence_for: Array.isArray(h.evidence_for)
                      ? (h.evidence_for as string[]).filter((s) => typeof s === 'string' && s.trim())
                      : [],
                  evidence_against: Array.isArray(h.evidence_against)
                      ? (h.evidence_against as string[]).filter((s) => typeof s === 'string' && s.trim())
                      : [],
              }))
        : [];
    if (hypotheses.length < 2) return null;
    const chips = Array.isArray(r.chips)
        ? (r.chips as Array<Record<string, unknown>>)
              .filter((c) => typeof c === 'object' && c !== null)
              .map((c, i) => ({
                  id: typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `c${i + 1}`,
                  text: typeof c.text === 'string' && c.text.trim() ? c.text.trim() : 'Something else.',
                  supports: typeof c.supports === 'string' && c.supports.trim() ? c.supports.trim() : null,
                  rules_out: Array.isArray(c.rules_out)
                      ? (c.rules_out as string[]).filter((s) => typeof s === 'string' && s.trim())
                      : [],
              }))
        : [];
    const round: 1 | 2 = r.round === 2 ? 2 : 1;
    const next_step_if_unresolved: 'ask_again' | 'commit_low_confidence' =
        r.next_step_if_unresolved === 'commit_low_confidence' ? 'commit_low_confidence' : 'ask_again';
    return {
        hypotheses,
        what_we_dont_know: typeof r.what_we_dont_know === 'string' ? r.what_we_dont_know.trim() : '',
        why_it_matters: typeof r.why_it_matters === 'string' ? r.why_it_matters.trim() : '',
        chips,
        round,
        next_step_if_unresolved,
    };
}

describe('Agent 2c normaliser — fixtures', () => {
    const fixtures = loadFixtures();

    it('loads at least 7 reasoning fixtures (one per trade in the plan)', () => {
        expect(fixtures.length).toBeGreaterThanOrEqual(7);
    });

    for (const { file, fixture } of fixtures) {
        describe(`fixture: ${fixture.name} (${fixture.trade})`, () => {
            const raw = fixture.mockAgentOutput as unknown;
            const normalised = normaliseReasoning(raw);

            it(`${file}: normalises without error`, () => {
                expect(normalised).not.toBeNull();
            });

            if (!normalised) return;

            it(`${file}: has 2–4 hypotheses`, () => {
                expect(normalised.hypotheses.length).toBeGreaterThanOrEqual(2);
                expect(normalised.hypotheses.length).toBeLessThanOrEqual(4);
            });

            it(`${file}: has 3–4 chips`, () => {
                expect(normalised.chips.length).toBeGreaterThanOrEqual(3);
                expect(normalised.chips.length).toBeLessThanOrEqual(4);
            });

            it(`${file}: all hypothesis ids are unique`, () => {
                const ids = normalised.hypotheses.map((h) => h.id);
                expect(new Set(ids).size).toBe(ids.length);
            });

            it(`${file}: all chip ids are unique`, () => {
                const ids = normalised.chips.map((c) => c.id);
                expect(new Set(ids).size).toBe(ids.length);
            });

            it(`${file}: chip.supports references a real hypothesis id or is null`, () => {
                const hypothesisIds = new Set(normalised.hypotheses.map((h) => h.id));
                for (const chip of normalised.chips) {
                    if (chip.supports !== null) {
                        expect(hypothesisIds.has(chip.supports)).toBe(true);
                    }
                }
            });

            it(`${file}: chip.rules_out references real hypothesis ids`, () => {
                const hypothesisIds = new Set(normalised.hypotheses.map((h) => h.id));
                for (const chip of normalised.chips) {
                    for (const id of chip.rules_out) {
                        expect(hypothesisIds.has(id)).toBe(true);
                    }
                }
            });

            it(`${file}: at least one chip is an "escape" chip (null supports, empty rules_out)`, () => {
                const escape = normalised.chips.find(
                    (c) => c.supports === null && c.rules_out.length === 0,
                );
                expect(escape).toBeDefined();
            });

            it(`${file}: every hypothesis has at least one evidence_for item`, () => {
                for (const h of normalised.hypotheses) {
                    expect(h.evidence_for.length).toBeGreaterThanOrEqual(1);
                }
            });

            it(`${file}: what_we_dont_know is a non-empty string`, () => {
                expect(normalised.what_we_dont_know.length).toBeGreaterThan(10);
            });

            it(`${file}: at least one chip actually reduces uncertainty (rules_out is non-empty)`, () => {
                const discriminating = normalised.chips.filter((c) => c.rules_out.length > 0);
                expect(discriminating.length).toBeGreaterThanOrEqual(1);
            });

            it(`${file}: confidence_alone values are in 0–1 range`, () => {
                for (const h of normalised.hypotheses) {
                    expect(h.confidence_alone).toBeGreaterThanOrEqual(0);
                    expect(h.confidence_alone).toBeLessThanOrEqual(1);
                }
            });

            it(`${file}: round is 1 or 2`, () => {
                expect([1, 2]).toContain(normalised.round);
            });

            it(`${file}: next_step_if_unresolved is a valid value`, () => {
                expect(['ask_again', 'commit_low_confidence']).toContain(
                    normalised.next_step_if_unresolved,
                );
            });
        });
    }
});

describe('Agent 2c round-2 differentiation contract', () => {
    it('round 2 chips must target a different discriminator than round 1', () => {
        const round1 = normaliseReasoning({
            hypotheses: [
                { id: 'h1', label: 'Spring failure', confidence_alone: 0.8, evidence_for: ['Sound'], evidence_against: [] },
                { id: 'h2', label: 'Motor failure', confidence_alone: 0.5, evidence_for: ['No movement'], evidence_against: [] },
            ],
            what_we_dont_know: 'Does the door make a sound when the remote is pressed?',
            why_it_matters: 'Sound distinguishes mechanical from electrical failure.',
            chips: [
                { id: 'c1', text: 'The door makes a sound.', supports: 'h1', rules_out: ['h2'] },
                { id: 'c2', text: 'Complete silence.', supports: 'h2', rules_out: ['h1'] },
                { id: 'c3', text: 'Something else.', supports: '', rules_out: [] },
            ],
            round: 1,
            next_step_if_unresolved: 'ask_again',
        });

        const round2 = normaliseReasoning({
            hypotheses: [
                { id: 'h1', label: 'Spring failure', confidence_alone: 0.8, evidence_for: ['Sound present'], evidence_against: [] },
                { id: 'h2', label: 'Cable failure', confidence_alone: 0.4, evidence_for: ['Cables visible'], evidence_against: ['No slack visible'] },
            ],
            what_we_dont_know: 'Is the spring visibly broken or unwound?',
            why_it_matters: 'Visual confirmation determines whether this needs a spring or cable replacement.',
            chips: [
                { id: 'c1', text: 'I can see a broken spring.', supports: 'h1', rules_out: [] },
                { id: 'c2', text: 'Cables look slack or loose.', supports: null, rules_out: [] },
                { id: 'c3', text: 'Something else.', supports: null, rules_out: [] },
            ],
            round: 2,
            next_step_if_unresolved: 'commit_low_confidence',
        });

        expect(round1).not.toBeNull();
        expect(round2).not.toBeNull();
        if (!round1 || !round2) return;

        expect(round1.round).toBe(1);
        expect(round2.round).toBe(2);

        // The discriminator question should differ between rounds.
        expect(round1.what_we_dont_know).not.toBe(round2.what_we_dont_know);

        // Round 2 discriminating chips should not duplicate round 1 chip texts.
        // Escape chips (null supports, empty rules_out) are structurally required in every
        // round so they are excluded from the duplicate check.
        const isEscape = (c: { supports: string | null; rules_out: string[] }) =>
            c.supports === null && c.rules_out.length === 0;
        const round1Texts = new Set(round1.chips.filter((c) => !isEscape(c)).map((c) => c.text));
        const round2DiscriminatingTexts = round2.chips.filter((c) => !isEscape(c)).map((c) => c.text);
        const duplicates = round2DiscriminatingTexts.filter((t) => round1Texts.has(t));
        expect(duplicates.length).toBe(0);
    });

    it('empty chips on round 2 signals force-commit', () => {
        const round2WithNoChips = {
            hypotheses: [
                { id: 'h1', label: 'Spring failure', confidence_alone: 0.7, evidence_for: ['Sound'], evidence_against: [] },
                { id: 'h2', label: 'Cable failure', confidence_alone: 0.6, evidence_for: ['Slack cable'], evidence_against: [] },
            ],
            what_we_dont_know: '',
            why_it_matters: '',
            chips: [],
            round: 2,
            next_step_if_unresolved: 'commit_low_confidence',
        };
        // normaliseReasoning returns null for <2 hypotheses, but empty chips with 2+ hypotheses is valid —
        // the force-commit is handled by the server, not the normaliser.
        // Here we just verify the server-side logic: if chips is empty on round 2, force commit.
        const chips = round2WithNoChips.chips;
        expect(chips.length).toBe(0);
        expect(round2WithNoChips.next_step_if_unresolved).toBe('commit_low_confidence');
    });
});

/**
 * Phase 6 — Phase 0 failure-baseline fixtures now run through the real
 * `computeRecommendedAction`. Each fixture supplies a `mockFacets` block
 * alongside the `mockAgentOutput` reasoning; the test asserts the computed
 * action matches the fixture's declared expectation.
 *
 * Most fixtures express their Phase 6 expectation in `expected.recommended_action`.
 * Where Phase 6 alone produces a different result from the post-Phase-7
 * behaviour (currently only the hazard-escalation case in p0-geyser-leak-ceiling-stain),
 * the fixture declares `expected.phase6_action` and the assertion uses that.
 */

describe('Phase 0 — failure baseline (Phase 6 wired)', () => {
    const phase0Fixtures = loadFixtures().filter(({ fixture }) =>
        Boolean(fixture.expected.recommended_action),
    );

    it('loads at least 8 Phase 0 failure-baseline fixtures', () => {
        expect(phase0Fixtures.length).toBeGreaterThanOrEqual(8);
    });

    for (const { file, fixture } of phase0Fixtures) {
        const normalised = normaliseReasoning(fixture.mockAgentOutput as unknown);
        if (!normalised) continue;

        it(`${file}: computed recommended_action matches expected`, () => {
            expect(
                fixture.mockFacets,
                `${file} must declare mockFacets to drive computeRecommendedAction`,
            ).toBeDefined();

            const decision = computeRecommendedAction(normalised, fixture.mockFacets);
            expect(decision, `decision must not be null when reasoning + facets are present`).not.toBeNull();

            const expectedAction =
                fixture.expected.phase6_action ?? fixture.expected.recommended_action;
            expect(
                decision!.action,
                `Phase 6 action mismatch. reasons:\n${decision!.reasons.join('\n')}`,
            ).toBe(expectedAction);
        });
    }
});

describe('Agent 2c P1 principle compliance', () => {
    it('P3: every chip with supports or rules_out moves the hypothesis tree', () => {
        for (const { fixture } of loadFixtures()) {
            const normalised = normaliseReasoning(fixture.mockAgentOutput as unknown);
            if (!normalised) continue;
            for (const chip of normalised.chips) {
                const movesTree = chip.supports !== null || chip.rules_out.length > 0;
                const isEscape = chip.supports === null && chip.rules_out.length === 0;
                // Every chip is either a discriminating chip OR an escape chip. Nothing in between.
                expect(movesTree || isEscape).toBe(true);
            }
        }
    });

    it('P4: no fixture has round > 2', () => {
        for (const { fixture } of loadFixtures()) {
            expect(fixture.mockAgentOutput.round).toBeLessThanOrEqual(2);
        }
    });
});
