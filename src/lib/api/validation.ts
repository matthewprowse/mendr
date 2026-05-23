/**
 * Shared API validation helpers.
 *
 * Routes should adopt these in preference to ad-hoc `typeof x === 'string'`
 * checks — Zod gives consistent, descriptive 400 responses and a single source
 * of truth for the request shape.
 *
 * Usage:
 *   const parsed = await parseJsonBody(req, MySchema);
 *   if ('error' in parsed) return parsed.error;
 *   const { data } = parsed;
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export type ParseResult<T> = { data: T } | { error: NextResponse };

/**
 * Parse a JSON request body and validate it against a Zod schema.
 *
 * Returns:
 *   - `{ data }` on success
 *   - `{ error }` with a typed 400 response on JSON parse failure or
 *     schema mismatch. The response body is `{ error, issues? }`.
 */
export async function parseJsonBody<T>(
    req: NextRequest,
    schema: z.ZodType<T>,
): Promise<ParseResult<T>> {
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return {
            error: NextResponse.json(
                { error: 'Invalid JSON body' },
                { status: 400 },
            ),
        };
    }

    if (raw === null || raw === undefined) {
        return {
            error: NextResponse.json(
                { error: 'Missing request body' },
                { status: 400 },
            ),
        };
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
        return {
            error: NextResponse.json(
                {
                    error: firstIssueMessage(result.error),
                    issues: result.error.issues.map((i) => ({
                        path: i.path.join('.'),
                        message: i.message,
                        code: i.code,
                    })),
                },
                { status: 400 },
            ),
        };
    }

    return { data: result.data };
}

/**
 * Parse URL search params against a Zod schema. Use for GET routes whose
 * inputs come from the query string.
 */
export function parseQuery<T>(
    req: NextRequest,
    schema: z.ZodType<T>,
): ParseResult<T> {
    const params: Record<string, string> = {};
    req.nextUrl.searchParams.forEach((value, key) => {
        params[key] = value;
    });

    const result = schema.safeParse(params);
    if (!result.success) {
        return {
            error: NextResponse.json(
                {
                    error: firstIssueMessage(result.error),
                    issues: result.error.issues.map((i) => ({
                        path: i.path.join('.'),
                        message: i.message,
                        code: i.code,
                    })),
                },
                { status: 400 },
            ),
        };
    }

    return { data: result.data };
}

/**
 * Pick a human-readable summary message from a ZodError. We surface the first
 * issue's message prefixed with the path (so the caller can disambiguate which
 * field failed) — full issues are still attached on `issues` for richer UIs.
 */
function firstIssueMessage(error: z.ZodError): string {
    const first = error.issues[0];
    if (!first) return 'Invalid request';
    const path = first.path.join('.');
    return path ? `${path}: ${first.message}` : first.message;
}

/**
 * Common reusable primitives.
 */
export const TrimmedString = z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, 'required'));

export const Email = z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(
        z
            .string()
            .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Valid email is required'),
    );
