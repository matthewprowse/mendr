/**
 * Phase 5 — `logIfDiagnosisJsonShapeUnexpected` tests.
 *
 * The validator is a non-blocking shape guard: conforming JSON is silent,
 * drifted JSON logs a single structured `console.warn`. These tests assert the
 * warn-vs-silent contract across valid, partial, and malformed inputs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logIfDiagnosisJsonShapeUnexpected } from '@/features/diagnosis/diagnosis-json-validate';

describe('logIfDiagnosisJsonShapeUnexpected', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warn.mockRestore();
    });

    it('does not warn for a fully conforming object', () => {
        logIfDiagnosisJsonShapeUnexpected({
            diagnosis: 'Geyser leak',
            trade: 'Plumbing',
            message: 'A clear explanation.',
            confidence: 88,
            requires_clarification: false,
            rejected: false,
            unserviced: false,
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn for an empty object — all fields are optional', () => {
        logIfDiagnosisJsonShapeUnexpected({});
        expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn for a partial object with only some valid fields', () => {
        logIfDiagnosisJsonShapeUnexpected({ trade: 'Electrical' });
        expect(warn).not.toHaveBeenCalled();
    });

    it('preserves unknown passthrough fields without warning', () => {
        logIfDiagnosisJsonShapeUnexpected({ diagnosis: 'x', some_future_field: 123 });
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns when confidence is out of the 0–100 range', () => {
        logIfDiagnosisJsonShapeUnexpected({ confidence: 150 });
        expect(warn).toHaveBeenCalledTimes(1);
        const logged = warn.mock.calls[0][0] as string;
        expect(logged).toContain('diagnosis_json_shape_warn');
    });

    it('warns when a field has the wrong type', () => {
        logIfDiagnosisJsonShapeUnexpected({ confidence: 'high' });
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('warns when requires_clarification is not a boolean', () => {
        logIfDiagnosisJsonShapeUnexpected({ requires_clarification: 'yes' });
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('warns for a non-object input such as a string', () => {
        logIfDiagnosisJsonShapeUnexpected('not an object');
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('warns for null input', () => {
        logIfDiagnosisJsonShapeUnexpected(null);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('emits a JSON-parseable payload with an issues key', () => {
        logIfDiagnosisJsonShapeUnexpected({ confidence: -5 });
        const logged = warn.mock.calls[0][0] as string;
        const parsed = JSON.parse(logged) as { type: string; issues: unknown };
        expect(parsed.type).toBe('diagnosis_json_shape_warn');
        expect(parsed.issues).toBeDefined();
    });
});
