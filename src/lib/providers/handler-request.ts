/**
 * Request parsing and validation for /api/providers. Extracted from `handler.ts`
 * in Phase 2.
 *
 * Returns either a 400/500 `Response` to send back, or a fully-validated view
 * of the request the caller will use. Behaviour preserved verbatim.
 */

import { NextResponse } from 'next/server';
import type { ProvidersRequestBody } from './contracts';

export type ParseProvidersResult =
    | { kind: 'response'; response: NextResponse }
    | { kind: 'parsed'; parsed: ProvidersRequestBody; quickMode: boolean; radius: number };

const MAX_RADIUS_METERS = 50_000;

/**
 * Read the raw POST body, parse JSON, and validate the required fields. Caps
 * the radius at 50 km. Returns a `Response` for any validation failure or
 * `parsed` for downstream use.
 */
export async function parseProvidersRequest(
    raw: string,
): Promise<ParseProvidersResult> {
    if (!raw.trim()) {
        return {
            kind: 'response',
            response: NextResponse.json({ error: 'Request body required' }, { status: 400 }),
        };
    }
    let body: ProvidersRequestBody;
    try {
        body = JSON.parse(raw) as ProvidersRequestBody;
    } catch {
        return {
            kind: 'response',
            response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }),
        };
    }

    const { lat, lng, trade, radius: customRadius, pageToken, searchQuery } = body;
    if (!lat || !lng || !trade) {
        return {
            kind: 'response',
            response: NextResponse.json(
                { error: 'Missing required parameters (lat, lng, trade)' },
                { status: 400 },
            ),
        };
    }
    if (pageToken && !searchQuery) {
        return {
            kind: 'response',
            response: NextResponse.json(
                { error: 'searchQuery is required when using pageToken for pagination' },
                { status: 400 },
            ),
        };
    }

    const radius = Math.min(Number(customRadius) || MAX_RADIUS_METERS, MAX_RADIUS_METERS);
    const quickMode = body.quick === true;

    return { kind: 'parsed', parsed: body, quickMode, radius };
}
