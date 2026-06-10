import { describe, it, expect } from 'vitest';
import { parseDiagnosisFromModelResponse } from '@/features/diagnosis/parse-diagnosis-from-model-response';

// These are the "golden" payloads that Wave 5a's canonical parser must also pass.
// Any refactor of the parser must keep all these tests green.

describe('parseDiagnosisFromModelResponse', () => {
    // ── Core wire format: <thought>/<json> ────────────────────────────────────
    it('parses standard <thought>/<json> wire payload', () => {
        const input = `<thought>Analysing the appliance...</thought><json>{“diagnosis”:”Faulty heating element”,”trade”:”Appliance Repair”,”action_required”:”Replace element”}</json>`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result).not.toBeNull();
        expect(result?.diagnosis).toBe('Faulty heating element');
        expect(result?.trade).toBe('Appliance Repair');
    });

    it('extracts json block when no closing </json> tag is present', () => {
        const input = `<thought>thinking</thought><json>{“diagnosis”:”Leaking tap”,”trade”:”Plumbing”,”action_required”:”Replace washer”}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Leaking tap');
        expect(result?.trade).toBe('Plumbing');
    });

    // ── Fallback strategies ───────────────────────────────────────────────────
    it('parses a bare JSON object with no tags', () => {
        const input = `{“diagnosis”:”Broken thermostat”,”trade”:”HVAC”,”action_required”:”Replace thermostat”}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Broken thermostat');
        expect(result?.trade).toBe('HVAC');
    });

    it('parses JSON wrapped in markdown fences', () => {
        const input = '```json\n{“diagnosis”:”Tripped circuit breaker”,”trade”:”Electrical”,”action_required”:”Reset breaker”}\n```';
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Tripped circuit breaker');
        expect(result?.trade).toBe('Electrical');
    });

    it('strips trailing comma before closing brace', () => {
        const input = `{“diagnosis”:”Worn belt”,”trade”:”Appliance Repair”,”action_required”:”Replace”,}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Worn belt');
    });

    // ── Field coercion ────────────────────────────────────────────────────────
    it('accepts tradeDetail as fallback for trade_detail', () => {
        const input = `{“diagnosis”:”Compressor fault”,”trade”:”HVAC”,”action_required”:”Replace compressor”,”tradeDetail”:”Air conditioning”}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.trade_detail).toBe('Air conditioning');
    });

    // ── Legacy field: thinking → thought ─────────────────────────────────────
    it('maps legacy thinking field to thinking property', () => {
        const input = `{“diagnosis”:”Faulty element”,”trade”:”Appliance Repair”,”action_required”:”Replace”,”thinking”:”I see rust marks...”}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.thinking).toBe('I see rust marks...');
    });

    it('prefers thought over thinking when both present', () => {
        const input = `{“diagnosis”:”Leak”,”trade”:”Plumbing”,”action_required”:”Fix”,”thought”:”primary thought”,”thinking”:”old thought”}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.thinking).toBe('primary thought');
    });

    // ── Null / missing diagnosis ──────────────────────────────────────────────
    it('returns null when diagnosis field is absent', () => {
        const input = `{“trade”:”Plumbing”,”action_required”:”Fix”}`;
        expect(parseDiagnosisFromModelResponse(input)).toBeNull();
    });

    it('returns null for completely empty string', () => {
        expect(parseDiagnosisFromModelResponse('')).toBeNull();
    });

    it('returns null for prose with no JSON', () => {
        expect(parseDiagnosisFromModelResponse('I cannot determine the issue from this image.')).toBeNull();
    });

    // ── Unicode quote normalisation ───────────────────────────────────────────
    it('normalises curly quotes before parsing', () => {
        const input = `{“diagnosis”:”Faulty switch”,”trade”:”Electrical”,”action_required”:”Replace switch”}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Faulty switch');
    });
});
