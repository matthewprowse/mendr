import { describe, it, expect } from 'vitest';
import { parseDiagnosisFromModelResponse } from '../parse-diagnosis-from-model-response';

// These are the "golden" payloads that Wave 5a's canonical parser must also pass.
// Any refactor of the parser must keep all these tests green.

describe('parseDiagnosisFromModelResponse', () => {
    // ── Core wire format: <thought>/<json> ────────────────────────────────────
    it('parses standard <thought>/<json> wire payload', () => {
        const input = `<thought>Analysing the appliance...</thought><json>{"diagnosis":"Faulty heating element","trade":"Appliance Repair","action_required":"Replace element","urgency_key":"soon","estimated_cost":"R800–R1200"}</json>`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result).not.toBeNull();
        expect(result?.diagnosis).toBe('Faulty heating element');
        expect(result?.trade).toBe('Appliance Repair');
        expect(result?.urgency_key).toBe('soon');
        expect(result?.estimated_cost).toBe('R800–R1200');
    });

    it('extracts json block when no closing </json> tag is present', () => {
        const input = `<thought>thinking</thought><json>{"diagnosis":"Leaking tap","trade":"Plumbing","action_required":"Replace washer","urgency_key":"urgent"}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Leaking tap');
        expect(result?.urgency_key).toBe('urgent');
    });

    // ── Fallback strategies ───────────────────────────────────────────────────
    it('parses a bare JSON object with no tags', () => {
        const input = `{"diagnosis":"Broken thermostat","trade":"HVAC","action_required":"Replace thermostat","urgency_key":"planned"}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Broken thermostat');
        expect(result?.urgency_key).toBe('planned');
    });

    it('parses JSON wrapped in markdown fences', () => {
        const input = '```json\n{"diagnosis":"Tripped circuit breaker","trade":"Electrical","action_required":"Reset breaker","urgency_key":"immediate"}\n```';
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Tripped circuit breaker');
        expect(result?.urgency_key).toBe('immediate');
    });

    it('strips trailing comma before closing brace', () => {
        const input = `{"diagnosis":"Worn belt","trade":"Appliance Repair","action_required":"Replace","urgency_key":"soon",}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Worn belt');
    });

    // ── Field coercion ────────────────────────────────────────────────────────
    it('coerces numeric estimated_cost to a string', () => {
        const input = `{"diagnosis":"Blocked drain","trade":"Plumbing","action_required":"Unblock","urgency_key":"soon","estimated_cost":650}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(typeof result?.estimated_cost).toBe('string');
        expect(result?.estimated_cost).toContain('650');
    });

    it('accepts camelCase estimatedCost as fallback', () => {
        const input = `{"diagnosis":"Faulty pump","trade":"Plumbing","action_required":"Replace pump","urgency_key":"urgent","estimatedCost":"R2000–R3000"}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.estimated_cost).toBe('R2000–R3000');
    });

    it('accepts tradeDetail as fallback for trade_detail', () => {
        const input = `{"diagnosis":"Compressor fault","trade":"HVAC","action_required":"Replace compressor","urgency_key":"urgent","tradeDetail":"Air conditioning"}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.trade_detail).toBe('Air conditioning');
    });

    // ── Legacy field: thinking → thought ─────────────────────────────────────
    it('maps legacy thinking field to thinking property', () => {
        const input = `{"diagnosis":"Faulty element","trade":"Appliance Repair","action_required":"Replace","urgency_key":"soon","thinking":"I see rust marks..."}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.thinking).toBe('I see rust marks...');
    });

    it('prefers thought over thinking when both present', () => {
        const input = `{"diagnosis":"Leak","trade":"Plumbing","action_required":"Fix","urgency_key":"soon","thought":"primary thought","thinking":"old thought"}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.thinking).toBe('primary thought');
    });

    // ── urgency_key normalisation ─────────────────────────────────────────────
    it('normalises unknown urgency_key to "soon"', () => {
        const input = `{"diagnosis":"Minor issue","trade":"General","action_required":"Check","urgency_key":"whenever"}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.urgency_key).toBe('soon');
    });

    it.each(['immediate', 'urgent', 'soon', 'planned'])('preserves valid urgency_key "%s"', (key) => {
        const input = `{"diagnosis":"Test","trade":"General","action_required":"Check","urgency_key":"${key}"}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.urgency_key).toBe(key);
    });

    // ── Null / missing diagnosis ──────────────────────────────────────────────
    it('returns null when diagnosis field is absent', () => {
        const input = `{"trade":"Plumbing","action_required":"Fix"}`;
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
        const input = `{“diagnosis”:“Faulty switch”,“trade”:“Electrical”,“action_required”:“Replace switch”,“urgency_key”:“soon”}`;
        const result = parseDiagnosisFromModelResponse(input);
        expect(result?.diagnosis).toBe('Faulty switch');
    });
});
