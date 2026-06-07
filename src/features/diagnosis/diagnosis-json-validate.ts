/* eslint-disable no-console */
import { z } from 'zod';

/** Loose schema to catch obvious shape drift; passthrough preserves unknown fields. */
const diagnosisJsonShapeSchema = z
    .object({
        diagnosis: z.string().optional(),
        trade: z.string().optional(),
        message: z.string().optional(),
        confidence: z.number().min(0).max(100).optional(),
        requires_clarification: z.boolean().optional(),
        rejected: z.boolean().optional(),
        unserviced: z.boolean().optional(),
    })
    .passthrough();

/**
 * Logs a structured warning when model JSON does not match expected shape (does not block the user).
 */
export function logIfDiagnosisJsonShapeUnexpected(parsed: unknown): void {
    const r = diagnosisJsonShapeSchema.safeParse(parsed);
    if (r.success) return;
    // eslint-disable-next-line no-console
    console.warn(
        JSON.stringify({
            type: 'diagnosis_json_shape_warn',
            issues: r.error.flatten(),
        })
    );
}
