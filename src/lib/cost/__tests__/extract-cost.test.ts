import { describe, it, expect, vi } from 'vitest';
import { parseCostJson, extractCostWithGemini } from '@/lib/cost/extract-cost';

describe('parseCostJson', () => {
    it('parses a valid object', () => {
        expect(
            parseCostJson('{"min_zar":800,"max_zar":2500,"unit":"repair","note":"x"}'),
        ).toEqual({
            min_zar: 800,
            max_zar: 2500,
            unit: 'repair',
            note: 'x',
        });
    });

    it('nulls max when absent or below min, and note when blank', () => {
        expect(parseCostJson('{"min_zar":800,"unit":"repair"}')).toEqual({
            min_zar: 800,
            max_zar: null,
            unit: 'repair',
            note: null,
        });
        expect(parseCostJson('{"min_zar":800,"max_zar":500,"note":"  "}')).toMatchObject({
            max_zar: null,
            note: null,
        });
    });

    it('returns null for invalid JSON or a non-positive minimum', () => {
        expect(parseCostJson('not json')).toBeNull();
        expect(parseCostJson('{"min_zar":0}')).toBeNull();
        expect(parseCostJson('{"max_zar":2500}')).toBeNull();
    });
});

describe('parseCostJson — additional branches', () => {
    it('truncates unit to 60 chars', () => {
        const longUnit = 'A'.repeat(80);
        const result = parseCostJson(JSON.stringify({ min_zar: 500, unit: longUnit }));
        expect(result?.unit.length).toBeLessThanOrEqual(60);
    });

    it('handles a max_zar equal to min_zar (boundary: max >= min)', () => {
        const result = parseCostJson('{"min_zar":1000,"max_zar":1000,"unit":"flat","note":"exact"}');
        expect(result).not.toBeNull();
        expect(result?.max_zar).toBe(1000);
    });

    it('returns null when min_zar is not finite (e.g. string value)', () => {
        expect(parseCostJson('{"min_zar":"cheap","unit":"repair"}')).toBeNull();
    });

    it('strips the note when it is whitespace only', () => {
        const result = parseCostJson('{"min_zar":500,"unit":"visit","note":"   "}');
        expect(result?.note).toBeNull();
    });
});

describe('extractCostWithGemini', () => {
    it('returns null without calling the model when there are no snippets', async () => {
        const model = { generateContent: vi.fn() };
        expect(await extractCostWithGemini('Geyser', [], { model })).toBeNull();
        expect(model.generateContent).not.toHaveBeenCalled();
    });

    it('calls the model and parses its JSON response', async () => {
        const model = {
            generateContent: vi.fn(async () => ({
                text: '{"min_zar":1500,"max_zar":6000,"unit":"repair","note":"y"}',
            })),
        };
        const out = await extractCostWithGemini('Geyser leak', ['snippet one'], { model });
        expect(out).toEqual({ min_zar: 1500, max_zar: 6000, unit: 'repair', note: 'y' });
        expect(model.generateContent).toHaveBeenCalledTimes(1);
    });

    it('returns null when the model returns a non-ZAR range (min_zar 0)', async () => {
        // When snippets contain only USD/EUR pricing the model is instructed to
        // return min_zar 0 — parseCostJson rejects non-positive minimums.
        const model = {
            generateContent: vi.fn(async () => ({
                text: '{"min_zar":0,"max_zar":0,"unit":"unknown","note":"no ZAR data"}',
            })),
        };
        const out = await extractCostWithGemini('Geyser repair (USD snippets)', ['$200 repair'], { model });
        expect(out).toBeNull();
    });

    it('returns null when the model returns malformed JSON', async () => {
        const model = {
            generateContent: vi.fn(async () => ({ text: 'not json at all' })),
        };
        const out = await extractCostWithGemini('leak', ['snippet'], { model });
        expect(out).toBeNull();
    });

    it('returns null when the model returns null text', async () => {
        const model = {
            generateContent: vi.fn(async () => ({ text: null })),
        };
        const out = await extractCostWithGemini('leak', ['snippet'], { model });
        expect(out).toBeNull();
    });
});
