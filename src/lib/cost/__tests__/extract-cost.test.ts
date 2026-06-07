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
});
