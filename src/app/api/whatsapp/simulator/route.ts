/* eslint-disable no-console */
/**
 * Simulator API (Phase A5).
 *
 * Accepts `{ from, text?, imageDataUri[]? }` and returns the outbound message
 * array by calling the shared `bot-handler`. Contains NO Meta-specific code —
 * the same handler will power the Meta webhook in Phase C.
 *
 * Debounce: rapid fragmented messages from the same `from` within a short
 * window are coalesced (the spec's "wait a couple of seconds, treat the batch
 * as one input"). In the browser simulator the client batches sends, but we
 * also guard server-side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { handleMessage } from '@/lib/whatsapp/bot-handler';
import { getSession } from '@/lib/whatsapp/session-manager';
import type { InboundMessage } from '@/lib/whatsapp/types';

export const maxDuration = 60;

interface SimulatorBody {
    from?: unknown;
    text?: unknown;
    imageDataUri?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'diagnose');
    if (limited) {
        return NextResponse.json(
            { error: 'Too many requests. Please slow down.' },
            { status: 429 },
        );
    }

    let body: SimulatorBody | null = null;
    try {
        body = (await req.json()) as SimulatorBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const from = typeof body?.from === 'string' ? body.from.trim() : '';
    if (!from) {
        return NextResponse.json({ error: 'from is required.' }, { status: 400 });
    }
    const text = typeof body?.text === 'string' ? body.text : undefined;
    const imageDataUri = Array.isArray(body?.imageDataUri)
        ? (body.imageDataUri as unknown[])
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              .slice(0, 4)
        : undefined;

    const inbound: InboundMessage = { from, text, imageDataUri };

    const requestOrigin = req.nextUrl?.origin ?? null;

    try {
        const result = await handleMessage(inbound, { requestOrigin });
        const session = await getSession(from);
        return NextResponse.json({
            messages: result.messages,
            state: result.state,
            // Payload view: surface the persisted session for the "Show payload"
            // toggle so we can debug the formatter and state transitions.
            session: session
                ? {
                      state: session.state,
                      active_diagnosis_id: session.active_diagnosis_id,
                      pending_clarification: session.pending_clarification,
                      pending_address: session.pending_address,
                      pending_contractors: session.pending_contractors,
                  }
                : null,
        });
    } catch (e) {
        console.error('[whatsapp/simulator] handler error:', e);
        return NextResponse.json(
            { error: 'The bot failed to process that message.' },
            { status: 500 },
        );
    }
}
