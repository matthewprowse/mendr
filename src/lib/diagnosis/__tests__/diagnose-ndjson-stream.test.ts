import { describe, it, expect, vi } from 'vitest';
import {
    consumeDiagnoseNdjsonStream,
    responseLooksLikeDiagnoseNdjson,
    DiagnoseStreamHttpError,
} from '../diagnose-ndjson-stream';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake Response whose body produces newline-delimited JSON lines.
 * Lines are flushed as a single chunk (sufficient for unit testing the parser).
 */
function makeNdjsonResponse(lines: string[], status = 200): Response {
    const body = lines.map((l) => l + '\n').join('');
    return new Response(body, {
        status,
        headers: { 'content-type': 'application/x-ndjson' },
    });
}

function makeErrorResponse(status: number, body: string): Response {
    return new Response(body, { status });
}

// ---------------------------------------------------------------------------
// responseLooksLikeDiagnoseNdjson
// ---------------------------------------------------------------------------

describe('responseLooksLikeDiagnoseNdjson', () => {
    it('returns true when content-type contains ndjson', () => {
        const res = new Response('', { headers: { 'content-type': 'application/x-ndjson' } });
        expect(responseLooksLikeDiagnoseNdjson(res)).toBe(true);
    });

    it('returns false for JSON content-type', () => {
        const res = new Response('', { headers: { 'content-type': 'application/json' } });
        expect(responseLooksLikeDiagnoseNdjson(res)).toBe(false);
    });

    it('returns false when content-type header is missing', () => {
        const res = new Response('');
        expect(responseLooksLikeDiagnoseNdjson(res)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// consumeDiagnoseNdjsonStream — happy path
// ---------------------------------------------------------------------------

describe('consumeDiagnoseNdjsonStream', () => {
    it('returns the full payload from a complete event', async () => {
        const res = makeNdjsonResponse([
            JSON.stringify({ type: 'thought', text: 'Analysing…' }),
            JSON.stringify({ type: 'complete', full: '{"diagnosis":"Leaking tap","trade":"Plumbing"}' }),
        ]);
        const thoughts: string[] = [];
        const result = await consumeDiagnoseNdjsonStream(res, {
            onThought: (t) => thoughts.push(t),
        });
        expect(result).toBe('{"diagnosis":"Leaking tap","trade":"Plumbing"}');
        expect(thoughts).toEqual(['Analysing…']);
    });

    it('fires onThought for each thought line in order', async () => {
        const res = makeNdjsonResponse([
            JSON.stringify({ type: 'thought', text: 'Step 1' }),
            JSON.stringify({ type: 'thought', text: 'Step 2' }),
            JSON.stringify({ type: 'complete', full: '{"diagnosis":"X"}' }),
        ]);
        const thoughts: string[] = [];
        await consumeDiagnoseNdjsonStream(res, { onThought: (t) => thoughts.push(t) });
        expect(thoughts).toEqual(['Step 1', 'Step 2']);
    });

    it('ignores lines with unknown type without throwing', async () => {
        const res = makeNdjsonResponse([
            JSON.stringify({ type: 'debug', payload: 'internal info' }),
            JSON.stringify({ type: 'complete', full: '{"diagnosis":"Result"}' }),
        ]);
        const result = await consumeDiagnoseNdjsonStream(res, { onThought: vi.fn() });
        expect(result).toBe('{"diagnosis":"Result"}');
    });

    it('skips malformed JSON lines without throwing', async () => {
        const res = makeNdjsonResponse([
            'not-valid-json',
            JSON.stringify({ type: 'complete', full: '{"diagnosis":"OK"}' }),
        ]);
        const result = await consumeDiagnoseNdjsonStream(res, { onThought: vi.fn() });
        expect(result).toBe('{"diagnosis":"OK"}');
    });

    it('skips blank lines', async () => {
        const body = '\n\n' + JSON.stringify({ type: 'complete', full: '{"diagnosis":"Blank"}' }) + '\n';
        const res = new Response(body, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
        });
        const result = await consumeDiagnoseNdjsonStream(res, { onThought: vi.fn() });
        expect(result).toBe('{"diagnosis":"Blank"}');
    });

    // ---- Error paths --------------------------------------------------------

    it('throws DiagnoseStreamHttpError when response status is not ok', async () => {
        const res = makeErrorResponse(429, 'Rate limited');
        await expect(
            consumeDiagnoseNdjsonStream(res, { onThought: vi.fn() })
        ).rejects.toThrow(DiagnoseStreamHttpError);
    });

    it('DiagnoseStreamHttpError carries status and bodyText', async () => {
        const res = makeErrorResponse(503, 'Service unavailable');
        try {
            await consumeDiagnoseNdjsonStream(res, { onThought: vi.fn() });
            expect.fail('Expected error was not thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(DiagnoseStreamHttpError);
            const httpErr = err as DiagnoseStreamHttpError;
            expect(httpErr.status).toBe(503);
            expect(httpErr.bodyText).toBe('Service unavailable');
        }
    });

    it('throws when stream ends without a complete event', async () => {
        const res = makeNdjsonResponse([
            JSON.stringify({ type: 'thought', text: 'Still thinking…' }),
        ]);
        await expect(
            consumeDiagnoseNdjsonStream(res, { onThought: vi.fn() })
        ).rejects.toThrow('ended without a complete payload');
    });

    // ---- Cancellation -------------------------------------------------------

    it('invokes isCancelled during the read loop', async () => {
        const isCancelled = vi.fn(() => false);
        const res = makeNdjsonResponse([
            JSON.stringify({ type: 'thought', text: 'thinking' }),
            JSON.stringify({ type: 'complete', full: '{"diagnosis":"Y"}' }),
        ]);
        await consumeDiagnoseNdjsonStream(res, { onThought: vi.fn(), isCancelled });
        expect(isCancelled).toHaveBeenCalled();
    });

    it('returns immediately when isCancelled is already true on first check', async () => {
        const res = makeNdjsonResponse([
            JSON.stringify({ type: 'complete', full: '{"diagnosis":"Z"}' }),
        ]);
        // Always-true cancellation: stream should bail out before reading any data.
        await expect(
            consumeDiagnoseNdjsonStream(res, { onThought: vi.fn(), isCancelled: () => true })
        ).rejects.toThrow('ended without a complete payload');
    });
});
