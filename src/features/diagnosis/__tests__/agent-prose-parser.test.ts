/**
 * Phase 2 — parser/validator boundary for Agent 2b (prose generation).
 *
 * `parseProseResponse` is the pure-function parser pulled out of
 * `runProseGeneration` so we can pin its behaviour against a wide range of
 * realistic Gemini outputs WITHOUT mocking the SDK. Fixtures live under
 * `__tests__/fixtures/prose/` — hand-crafted from the schema in
 * `agent-prose.ts` and the shapes captured by existing tests
 * (`composer.test.ts`, `image-observations.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    parseProseResponse,
    FALLBACK_PROSE,
    type ProseResult,
} from '../agent-prose';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'prose');

interface ProseFixture {
    name: string;
    raw: string;
    expected: Record<string, unknown>;
}

function loadFixtures(): { file: string; fixture: ProseFixture }[] {
    const files = fs
        .readdirSync(FIXTURES_DIR)
        .filter((f) => f.endsWith('.json'))
        .sort();
    return files.map((file) => ({
        file,
        fixture: JSON.parse(
            fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'),
        ) as ProseFixture,
    }));
}

function countByRole(prose: ProseResult, role: string): number {
    return prose.image_observations.filter((o) => o.role_in_diagnosis === role).length;
}

describe('parseProseResponse — fixtures', () => {
    const fixtures = loadFixtures();
    it('loads at least 6 hand-crafted prose fixtures', () => {
        expect(fixtures.length).toBeGreaterThanOrEqual(6);
    });

    for (const { file, fixture } of fixtures) {
        it(`parses fixture: ${file} (${fixture.name})`, () => {
            const out = parseProseResponse(fixture.raw);
            expect(out, `fixture ${file} should parse to a non-null result`).not.toBeNull();
            if (!out) return;

            const e = fixture.expected;
            if (typeof e.diagnosis === 'string') {
                expect(out.diagnosis).toBe(e.diagnosis);
            }
            if (typeof e.contractor_checklist_count === 'number') {
                expect(out.contractor_checklist.length).toBe(e.contractor_checklist_count);
            }
            if (typeof e.image_descriptions_count === 'number') {
                expect(out.image_descriptions.length).toBe(e.image_descriptions_count);
            }
            if (typeof e.image_observations_count === 'number') {
                expect(out.image_observations.length).toBe(e.image_observations_count);
            }
            if (typeof e.primary_evidence_count === 'number') {
                expect(countByRole(out, 'primary_evidence')).toBe(e.primary_evidence_count);
            }
            if (typeof e.contradicting_count === 'number') {
                expect(countByRole(out, 'contradicting')).toBe(e.contradicting_count);
            }
            if (typeof e.clarification_questions_count === 'number') {
                expect((out.clarification_questions ?? []).length).toBe(
                    e.clarification_questions_count,
                );
            }
            if (e.homeowner_prep_present === true) {
                expect((out.homeowner_prep ?? '').length).toBeGreaterThan(0);
            }
            if (e.homeowner_prep_empty === true) {
                expect(out.homeowner_prep).toBe('');
            }
            if (e.photo_request_present === true) {
                expect((out.photo_request ?? '').length).toBeGreaterThan(0);
            }
            if (e.image_descriptions_derived === true) {
                // When image_descriptions is missing/empty but image_observations
                // is populated, parser derives descriptions from primary_observation.
                expect(out.image_descriptions.length).toBe(out.image_observations.length);
                expect(out.image_descriptions[0]).toBe(
                    out.image_observations[0].primary_observation,
                );
            }
        });
    }
});

describe('parseProseResponse — malformed inputs', () => {
    it('returns null for empty string', () => {
        expect(parseProseResponse('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
        expect(parseProseResponse('   \n  ')).toBeNull();
    });

    it('returns null for unparseable JSON', () => {
        expect(parseProseResponse('{not valid json}')).toBeNull();
    });

    it('returns null for truncated JSON (incomplete object)', () => {
        expect(parseProseResponse('{"diagnosis":"Burst Pipe"')).toBeNull();
    });

    it('returns null for a JSON array (not an object)', () => {
        expect(parseProseResponse('[]')).toBeNull();
    });

    it('returns null for a JSON null literal', () => {
        expect(parseProseResponse('null')).toBeNull();
    });

    it('returns null for a JSON string literal (refusal style)', () => {
        expect(parseProseResponse('"I cannot help with that."')).toBeNull();
    });
});

describe('parseProseResponse — refusal / safety responses', () => {
    it('returns null when the model emits a plain-text refusal instead of JSON', () => {
        const refusal =
            'Sorry, I am not able to provide a diagnosis for this content.';
        expect(parseProseResponse(refusal)).toBeNull();
    });

    it('returns null when the model wraps a refusal in a markdown code fence', () => {
        const wrapped = '```\nI cannot generate prose for this image.\n```';
        expect(parseProseResponse(wrapped)).toBeNull();
    });
});

describe('parseProseResponse — field coercion and defaults', () => {
    it('substitutes the fallback thought when the model emits a thought shorter than 200 chars', () => {
        const raw = JSON.stringify({
            thought: 'too short',
            diagnosis: 'Geyser Leak',
            message: 'The geyser is leaking from the PRV.',
            action_required: '',
            contractor_checklist: [],
            homeowner_prep: '',
            image_descriptions: [],
            image_observations: [],
            clarification_questions: [],
            diy_verification: '',
            photo_request: '',
            confidence_drivers: [],
        });
        const out = parseProseResponse(raw);
        expect(out?.thought).toBe(FALLBACK_PROSE.thought);
    });

    it('keeps a long-enough thought verbatim', () => {
        const longThought = 'X'.repeat(250);
        const raw = JSON.stringify({
            thought: longThought,
            diagnosis: 'Geyser Leak',
            message: 'The geyser is leaking from the PRV.',
            action_required: '',
            contractor_checklist: [],
            homeowner_prep: '',
            image_descriptions: [],
            image_observations: [],
            clarification_questions: [],
            diy_verification: '',
            photo_request: '',
            confidence_drivers: [],
        });
        const out = parseProseResponse(raw);
        expect(out?.thought).toBe(longThought);
    });

    it('coerces missing array fields to empty arrays', () => {
        const raw = JSON.stringify({
            thought: 'X'.repeat(250),
            diagnosis: 'Tap Leak',
            message: 'The tap is dripping.',
            action_required: '',
        });
        const out = parseProseResponse(raw);
        expect(out?.contractor_checklist).toEqual([]);
        expect(out?.image_descriptions).toEqual([]);
        expect(out?.image_observations).toEqual([]);
        expect(out?.clarification_questions).toEqual([]);
        expect(out?.confidence_drivers).toEqual([]);
    });

    it('coerces missing string fields to empty strings', () => {
        const raw = JSON.stringify({
            thought: 'X'.repeat(250),
            diagnosis: 'Tap Leak',
            message: 'The tap is dripping.',
            action_required: '',
        });
        const out = parseProseResponse(raw);
        expect(out?.homeowner_prep).toBe('');
        expect(out?.diy_verification).toBe('');
        expect(out?.photo_request).toBe('');
    });

    it('coerces non-string homeowner_prep to empty string', () => {
        const raw = JSON.stringify({
            thought: 'X'.repeat(250),
            diagnosis: 'Tap Leak',
            message: 'The tap is dripping.',
            homeowner_prep: 42, // Wrong type
        });
        const out = parseProseResponse(raw);
        expect(out?.homeowner_prep).toBe('');
    });

    it('coerces unknown role_in_diagnosis to context_only', () => {
        const raw = JSON.stringify({
            thought: 'X'.repeat(250),
            diagnosis: 'Tap Leak',
            message: 'The tap is dripping.',
            image_observations: [
                {
                    primary_observation: 'A drip is visible.',
                    components_visible: ['tap'],
                    components_missing_or_damaged: ['washer'],
                    role_in_diagnosis: 'definitely_not_a_real_role',
                },
            ],
        });
        const out = parseProseResponse(raw);
        expect(out?.image_observations[0].role_in_diagnosis).toBe('context_only');
    });
});

describe('parseProseResponse — image_descriptions derivation', () => {
    it('derives image_descriptions from image_observations[].primary_observation when descriptions missing', () => {
        const raw = JSON.stringify({
            thought: 'X'.repeat(250),
            diagnosis: 'Leak',
            message: 'A leak is visible.',
            image_descriptions: [],
            image_observations: [
                {
                    primary_observation: 'First image: visible drip at the joint.',
                    components_visible: ['joint'],
                    components_missing_or_damaged: ['seal'],
                    role_in_diagnosis: 'primary_evidence',
                },
                {
                    primary_observation: 'Second image: water stain on floor below.',
                    components_visible: ['floor'],
                    components_missing_or_damaged: [],
                    role_in_diagnosis: 'corroborating',
                },
            ],
        });
        const out = parseProseResponse(raw);
        expect(out?.image_descriptions).toEqual([
            'First image: visible drip at the joint.',
            'Second image: water stain on floor below.',
        ]);
    });

    it('does NOT override image_descriptions when both are present', () => {
        const raw = JSON.stringify({
            thought: 'X'.repeat(250),
            diagnosis: 'Leak',
            message: 'A leak is visible.',
            image_descriptions: ['Original description text.'],
            image_observations: [
                {
                    primary_observation: 'Different observation text.',
                    components_visible: [],
                    components_missing_or_damaged: [],
                    role_in_diagnosis: 'primary_evidence',
                },
            ],
        });
        const out = parseProseResponse(raw);
        expect(out?.image_descriptions).toEqual(['Original description text.']);
    });
});
