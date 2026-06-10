import { describe, it, expect } from 'vitest';
import { parseDiagnosisFromModelResponse } from '@/features/diagnosis/parse-diagnosis-from-model-response';

describe('parseDiagnosisFromModelResponse', () => {
    it('parses a plain JSON object', () => {
        const out = parseDiagnosisFromModelResponse(
            '{"diagnosis":"Burst pipe","trade":"Plumbing"}',
        );
        expect(out?.diagnosis).toBe('Burst pipe');
        expect(out?.trade).toBe('Plumbing');
    });

    it('extracts JSON from a <json> tagged block', () => {
        const out = parseDiagnosisFromModelResponse(
            '<thought>reasoning</thought><json>{"diagnosis":"D","trade":"Plumbing"}</json>',
        );
        expect(out?.diagnosis).toBe('D');
    });

    it('extracts JSON from a markdown code fence', () => {
        const out = parseDiagnosisFromModelResponse(
            '```json\n{"diagnosis":"D","trade":"Electrical"}\n```',
        );
        expect(out?.diagnosis).toBe('D');
        expect(out?.trade).toBe('Electrical');
    });

    it('normalises smart quotes before parsing', () => {
        const out = parseDiagnosisFromModelResponse('{“diagnosis”:“D”,“trade”:“Plumbing”}');
        expect(out?.diagnosis).toBe('D');
    });

    it('tolerates a trailing comma and trailing prose after the object', () => {
        expect(
            parseDiagnosisFromModelResponse('{"diagnosis":"D","trade":"Plumbing",}')?.diagnosis,
        ).toBe('D');
        expect(
            parseDiagnosisFromModelResponse(
                '{"diagnosis":"D","trade":"Plumbing"} and some trailing prose',
            )?.diagnosis,
        ).toBe('D');
    });

    it('maps the thought field onto thinking', () => {
        const out = parseDiagnosisFromModelResponse(
            '{"diagnosis":"D","trade":"Plumbing","thought":"because the pipe burst"}',
        );
        expect(out?.thinking).toBe('because the pipe burst');
    });

    it('falls back trade_detail to trade when absent', () => {
        const out = parseDiagnosisFromModelResponse('{"diagnosis":"D","trade":"Plumbing"}');
        expect(out?.trade_detail).toBe('Plumbing');
    });

    it('returns null when there is no diagnosis field or it is empty', () => {
        expect(parseDiagnosisFromModelResponse('{"trade":"Plumbing"}')).toBeNull();
        expect(
            parseDiagnosisFromModelResponse('{"diagnosis":"   ","trade":"Plumbing"}'),
        ).toBeNull();
    });

    it('returns null for non-JSON text', () => {
        expect(parseDiagnosisFromModelResponse('hello, no json here')).toBeNull();
        expect(parseDiagnosisFromModelResponse('')).toBeNull();
    });
});
