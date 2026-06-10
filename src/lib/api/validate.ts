/**
 * Per-route zod validation (finding M13).
 *
 * A single place to parse + validate a JSON body against a zod schema so checks
 * stop drifting between routes. Returns either the typed data or a ready 400
 * response.
 */

import { NextResponse } from 'next/server';
import type { z } from 'zod';

export type Validated<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Parse the request JSON and validate it against `schema`. */
export async function parseJson<T extends z.ZodTypeAny>(
    req: Request,
    schema: T,
): Promise<Validated<z.infer<T>>> {
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return { ok: false, response: NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) };
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Invalid request.', details: result.error.flatten() },
                { status: 400 },
            ),
        };
    }
    return { ok: true, data: result.data };
}
