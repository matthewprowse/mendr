import { describe, it, expect } from 'vitest';
import { buildSystemInstruction, buildProseBaseInstruction } from '../prompts/composer';
import type { PromptContext } from '../prompts/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CONTEXT: PromptContext = {
    isFollowUp: false,
    hasUserContext: false,
    isTextOnlyNoAttachments: false,
    serviceListText: 'Electrical, Plumbing, Security',
};

function ctx(overrides: Partial<PromptContext> = {}): PromptContext {
    return { ...BASE_CONTEXT, ...overrides };
}

// ---------------------------------------------------------------------------
// buildSystemInstruction
// ---------------------------------------------------------------------------

describe('buildSystemInstruction', () => {
    it('returns a non-empty string for a minimal context', () => {
        const result = buildSystemInstruction(BASE_CONTEXT);
        expect(typeof result).toBe('string');
        expect(result.trim().length).toBeGreaterThan(100);
    });

    it('includes the service list text', () => {
        const result = buildSystemInstruction(ctx({ serviceListText: 'Solar, Gate Motor, Roofing' }));
        expect(result).toContain('Solar');
        expect(result).toContain('Gate Motor');
    });

    it('includes the output format block (thought/json tags)', () => {
        const result = buildSystemInstruction(BASE_CONTEXT);
        // The output format block instructs the model to use <thought> and <json> tags.
        expect(result).toMatch(/<thought>|<\/thought>|\bthought\b/i);
    });

    it('includes the negative feedback instruction when feedback is "down"', () => {
        const result = buildSystemInstruction(ctx({ feedback: 'down' }));
        expect(result).toMatch(/previous diagnosis was INCORRECT/i);
    });

    it('does NOT include the negative feedback instruction when feedback is absent', () => {
        const result = buildSystemInstruction(ctx({ feedback: undefined }));
        expect(result).not.toMatch(/previous diagnosis was INCORRECT/i);
    });

    it('includes follow-up guidance when isFollowUp is true', () => {
        const base = buildSystemInstruction(ctx({ isFollowUp: false }));
        const followUp = buildSystemInstruction(ctx({ isFollowUp: true }));
        // Follow-up prompt adds extra sections; result should differ.
        expect(followUp).not.toBe(base);
    });

    it('includes provider context when providers are supplied', () => {
        const result = buildSystemInstruction(
            ctx({
                providers: [
                    {
                        name: 'Cape Electric Co',
                        rating: 4.8,
                        ratingCount: 120,
                        specialisations: ['Fuse boards'],
                        isFavourite: true,
                        favouriteReason: 'Top-rated in area',
                    },
                ],
            })
        );
        expect(result).toContain('Cape Electric Co');
    });

    it('includes rejection guidance when diagnosisRejected is true', () => {
        const base = buildSystemInstruction(BASE_CONTEXT);
        const rejected = buildSystemInstruction(ctx({ diagnosisRejected: true }));
        expect(rejected).not.toBe(base);
    });

    it('produces consistent output for identical contexts (deterministic)', () => {
        const a = buildSystemInstruction(BASE_CONTEXT);
        const b = buildSystemInstruction(BASE_CONTEXT);
        expect(a).toBe(b);
    });

    it('result is at least 500 characters and contains recognisable prompt content', () => {
        const result = buildSystemInstruction(BASE_CONTEXT);
        expect(result.length).toBeGreaterThan(500);
        // The output format block always includes the structured JSON schema fragment.
        expect(result).toContain('confidence');
    });

    // Ported from scripts/test-diagnose-prompts.ts ---------------------------

    it('embeds the allowed service labels in canonical order', () => {
        const result = buildSystemInstruction({
            ...BASE_CONTEXT,
            serviceListText: 'Electrical, Plumbing, Painting',
        });
        expect(result).toContain(
            'Allowed service labels (in order): Electrical, Plumbing, Painting'
        );
    });

    it('includes the UNRELATED IMAGE RULE block', () => {
        const result = buildSystemInstruction(BASE_CONTEXT);
        expect(result).toContain('UNRELATED IMAGE RULE');
    });

    it('includes the UNSUPPORTED HOME SERVICE RULE block', () => {
        const result = buildSystemInstruction(BASE_CONTEXT);
        expect(result).toContain('UNSUPPORTED HOME SERVICE RULE');
    });

    it('includes the OUTPUT FORMAT header', () => {
        const result = buildSystemInstruction(BASE_CONTEXT);
        expect(result).toContain('OUTPUT FORMAT:');
    });

    it('includes the strict JSON format header', () => {
        const result = buildSystemInstruction(BASE_CONTEXT);
        expect(result).toContain('JSON FORMAT (STRICT):');
    });

    it('shortens the thought guidance in follow-up mode', () => {
        const result = buildSystemInstruction(
            ctx({ isFollowUp: true, hasUserContext: true })
        );
        expect(result).toContain(
            'FOLLOW-UP MODE: Keep <thought> to 2–3 short sentences.'
        );
    });

    it('echoes the user-selected trade context when supplied', () => {
        const result = buildSystemInstruction(
            ctx({
                isFollowUp: true,
                hasUserContext: true,
                userSelectedTrade: {
                    diagnosis: 'Gate Motor Problem',
                    trade: 'Security & Access',
                },
            })
        );
        expect(result).toContain('USER CONTEXT: The user first selected "Gate Motor Problem"');
    });

    it('flags text-only turns when no image is attached', () => {
        const result = buildSystemInstruction(
            ctx({
                isFollowUp: true,
                hasUserContext: true,
                isTextOnlyNoAttachments: true,
            })
        );
        expect(result).toContain(
            'TEXT-ONLY (NO IMAGE): The user has NOT uploaded any image.'
        );
    });

    it('surfaces the previous diagnosis when one is supplied', () => {
        const result = buildSystemInstruction(
            ctx({
                isFollowUp: true,
                hasUserContext: true,
                previousDiagnosis: {
                    diagnosis: 'Gate Motor Capacitor Fault',
                    trade: 'Security & Access',
                    trade_detail: 'Automated Gate Motor',
                },
            })
        );
        expect(result).toContain(
            'The user already has a diagnosis: "Gate Motor Capacitor Fault"'
        );
    });

    it('includes the negative feedback guidance when feedback is "down"', () => {
        const result = buildSystemInstruction(ctx({ feedback: 'down' }));
        expect(result).toContain(
            'IMPORTANT: The user has indicated that the previous diagnosis was INCORRECT.'
        );
    });

    it('emits the DIAGNOSIS REJECTED block when diagnosisRejected is true', () => {
        const result = buildSystemInstruction(
            ctx({ diagnosisRejected: true })
        );
        expect(result).toContain('DIAGNOSIS REJECTED:');
        expect(result).toContain('The user has indicated the diagnosis is incorrect');
    });

    it('includes existing-providers guidance when providers are supplied', () => {
        const result = buildSystemInstruction(
            ctx({
                isFollowUp: true,
                hasUserContext: true,
                providers: [
                    {
                        name: 'Provider One',
                        rating: 4.8,
                        ratingCount: 142,
                        specialisations: ['Gate Motor Repair'],
                        isFavourite: true,
                        favouriteReason: 'Highest rating and response time',
                    },
                ],
            })
        );
        expect(result).toContain(
            'The following highly-rated service providers are already displayed'
        );
        // The supplied provider name should appear in the rendered list.
        expect(result).toContain('Provider One');
    });
});

// ---------------------------------------------------------------------------
// buildProseBaseInstruction
// ---------------------------------------------------------------------------

describe('buildProseBaseInstruction', () => {
    it('returns a non-empty string for a minimal context', () => {
        const result = buildProseBaseInstruction(BASE_CONTEXT);
        expect(typeof result).toBe('string');
        expect(result.trim().length).toBeGreaterThan(100);
    });

    it('does NOT contain the tagged-output format block', () => {
        const result = buildProseBaseInstruction(BASE_CONTEXT);
        // The prose instruction explicitly strips OUTPUT_FORMAT_PROMPT_BLOCK
        // which contains instructions to open with <thought> tags.
        // Verify that the result is shorter than buildSystemInstruction.
        const full = buildSystemInstruction(BASE_CONTEXT);
        expect(result.length).toBeLessThan(full.length);
    });

    it('still includes the service list text', () => {
        const result = buildProseBaseInstruction(ctx({ serviceListText: 'Pool, Pest Control' }));
        expect(result).toContain('Pool');
    });

    it('includes the negative feedback instruction when feedback is "down"', () => {
        const result = buildProseBaseInstruction(ctx({ feedback: 'down' }));
        expect(result).toMatch(/previous diagnosis was INCORRECT/i);
    });

    it('produces consistent output for identical contexts (deterministic)', () => {
        const a = buildProseBaseInstruction(BASE_CONTEXT);
        const b = buildProseBaseInstruction(BASE_CONTEXT);
        expect(a).toBe(b);
    });

    it('prose instruction differs from full system instruction', () => {
        const prose = buildProseBaseInstruction(BASE_CONTEXT);
        const full = buildSystemInstruction(BASE_CONTEXT);
        expect(prose).not.toBe(full);
    });
});
