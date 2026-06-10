/**
 * Mock-LLM branch tests.
 *
 * `MOCK_LLM=1` short-circuits `runClassification` and `runProseGeneration` so
 * Playwright E2E specs (Phase 6) can drive `/api/diagnose` without making real
 * Gemini calls. These tests pin the mock contract so that the homeowner
 * golden-path E2E can rely on a deterministic Plumbing/geyser response.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runClassification } from '../agent-classify';
import { runProseGeneration } from '../agent-prose';

describe('MOCK_LLM branch — runClassification', () => {
    const original = process.env.MOCK_LLM;

    beforeEach(() => {
        process.env.MOCK_LLM = '1';
    });

    afterEach(() => {
        if (original === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = original;
        vi.restoreAllMocks();
    });

    it('returns a deterministic Plumbing/geyser classification without hitting Gemini', async () => {
        const result = await runClassification([], 'irrelevant — service list ignored in mock', [
            'Plumbing',
            'Electrical',
        ]);
        expect(result.trade).toBe('Plumbing');
        expect(result.trade_detail).toBe('Geyser / Hot Water Cylinder Repair');
        expect(result.subcategory_id).toBe('geyser_fault');
        expect(result.confidence).toBeGreaterThanOrEqual(80);
        expect(result.rejected).toBe(false);
        expect(result.requires_clarification).toBe(false);
        expect(result.requestFailed).toBeUndefined();
    });

    it('does NOT instantiate the Gemini model in mock mode', async () => {
        // If the mock branch leaked, the Gemini SDK would throw because no
        // GEMINI_API_KEY is set in this test process. Reaching this assertion
        // without throwing is itself the proof.
        const prev = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        try {
            const result = await runClassification([], '', []);
            expect(result.trade).toBe('Plumbing');
        } finally {
            if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
        }
    });
});

describe('MOCK_LLM branch — runProseGeneration', () => {
    const original = process.env.MOCK_LLM;

    beforeEach(() => {
        process.env.MOCK_LLM = '1';
    });

    afterEach(() => {
        if (original === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = original;
    });

    it('returns a schema-valid prose payload tied to the geyser classification', async () => {
        const result = await runProseGeneration({
            contents: [],
            classification: {
                trade: 'Plumbing',
                trade_detail: 'Geyser / Hot Water Cylinder Repair',
                subcategory_id: 'geyser_fault',
                confidence: 92,
                rejected: false,
                requires_clarification: false,
                unserviced: false,
                refetch_providers: false,
                unsupported_reason: '',
                failed_component: '',
                cascading_damage: '',
                trade_candidates: [],
            },
            baseSystemInstruction: 'ignored in mock',
        });
        expect(result.diagnosis).toBe('Geyser Pressure Relief Valve Leak');
        expect(result.message.length).toBeGreaterThan(20);
        expect(result.contractor_checklist.length).toBeGreaterThanOrEqual(3);
        expect(result.homeowner_prep).toContain('DB board');
        expect(result.confidence_drivers.length).toBeGreaterThan(0);
        expect(result.requestFailed).toBeUndefined();
    });

    it('does NOT instantiate the Gemini model in mock mode', async () => {
        const prev = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        try {
            const result = await runProseGeneration({
                contents: [],
                classification: {
                    trade: 'Plumbing',
                    trade_detail: 'Geyser / Hot Water Cylinder Repair',
                    subcategory_id: 'geyser_fault',
                    confidence: 92,
                    rejected: false,
                    requires_clarification: false,
                    unserviced: false,
                    refetch_providers: false,
                    unsupported_reason: '',
                    failed_component: '',
                    cascading_damage: '',
                    trade_candidates: [],
                },
                baseSystemInstruction: '',
            });
            expect(result.diagnosis).toBeTruthy();
        } finally {
            if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
        }
    });
});
