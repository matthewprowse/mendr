/**
 * Unit tests for image-loader extracted from /api/diagnose/route.ts in Phase 2.
 *
 * Covers:
 *   - `arrayBufferToBase64` round-trip.
 *   - `imageStringToInlineData`:
 *       * data: URI happy path
 *       * data: URI missing payload / mime
 *       * data: URI exceeding size guardrail
 *       * http URL outside allowed origins (SSRF guard)
 *       * http URL fetched OK
 *       * http URL not OK
 *       * fetch throwing (network failure)
 */
import { describe, it, expect, vi } from 'vitest';
import {
    arrayBufferToBase64,
    imageStringToInlineData,
    type FetchImpl,
} from '../image-loader';

const ALLOWED = ['https://example.supabase.co'];

describe('arrayBufferToBase64', () => {
    it('encodes a known buffer to the expected base64', () => {
        const buf = new TextEncoder().encode('hello world').buffer;
        // "hello world" → aGVsbG8gd29ybGQ=
        expect(arrayBufferToBase64(buf)).toBe('aGVsbG8gd29ybGQ=');
    });

    it('handles an empty buffer', () => {
        expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
    });
});

describe('imageStringToInlineData — data URI path', () => {
    it('decodes a valid data URI into inlineData', async () => {
        // 1x1 png — minimal payload
        const payload = 'iVBORw0KGgoAAAANS';
        const dataUri = `data:image/png;base64,${payload}`;
        const result = await imageStringToInlineData(dataUri);
        expect(result).toEqual({
            inlineData: { data: payload, mimeType: 'image/png' },
        });
    });

    it('returns null when the data URI is missing the base64 payload', async () => {
        expect(await imageStringToInlineData('data:image/png;base64,')).toBeNull();
    });

    it('returns null when the data URI is malformed (no comma)', async () => {
        expect(await imageStringToInlineData('data:image/png;base64')).toBeNull();
    });

    it('drops images exceeding the size guardrail', async () => {
        // Construct a payload whose decoded byteLength > 100 bytes via maxBytes=100.
        const big = 'A'.repeat(200); // 200 base64 chars → 150 bytes
        const dataUri = `data:image/png;base64,${big}`;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await imageStringToInlineData(dataUri, { maxBytes: 100 });
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

function mockFetchOk(
    bytes: Uint8Array,
    contentType = 'image/jpeg',
): FetchImpl {
    return vi.fn(async () => ({
        ok: true,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
        arrayBuffer: async () => bytes.buffer,
    })) as unknown as FetchImpl;
}

describe('imageStringToInlineData — http path', () => {
    it('returns null when the http origin is not allow-listed', async () => {
        const fetchSpy = vi.fn();
        const result = await imageStringToInlineData('https://evil.example.com/x.jpg', {
            allowedOrigins: ALLOWED,
            fetchImpl: fetchSpy as unknown as FetchImpl,
        });
        expect(result).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fetches and base64-encodes when the origin is allowed', async () => {
        const bytes = new TextEncoder().encode('hello world');
        const fetchImpl = mockFetchOk(bytes);
        const result = await imageStringToInlineData(
            'https://example.supabase.co/foo.jpg',
            { allowedOrigins: ALLOWED, fetchImpl },
        );
        expect(result).toEqual({
            inlineData: { data: 'aGVsbG8gd29ybGQ=', mimeType: 'image/jpeg' },
        });
    });

    it('returns null when fetch returns non-OK', async () => {
        const fetchImpl: FetchImpl = vi.fn(async () => ({
            ok: false,
            headers: { get: () => null },
            arrayBuffer: async () => new ArrayBuffer(0),
        })) as unknown as FetchImpl;
        const result = await imageStringToInlineData(
            'https://example.supabase.co/x.jpg',
            { allowedOrigins: ALLOWED, fetchImpl },
        );
        expect(result).toBeNull();
    });

    it('returns null when fetch throws', async () => {
        const fetchImpl: FetchImpl = vi.fn(async () => {
            throw new Error('boom');
        }) as unknown as FetchImpl;
        const result = await imageStringToInlineData(
            'https://example.supabase.co/x.jpg',
            { allowedOrigins: ALLOWED, fetchImpl },
        );
        expect(result).toBeNull();
    });

    it('drops fetched payload exceeding the guardrail', async () => {
        const bytes = new Uint8Array(200); // 200 bytes
        const fetchImpl = mockFetchOk(bytes);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await imageStringToInlineData(
            'https://example.supabase.co/x.jpg',
            { allowedOrigins: ALLOWED, fetchImpl, maxBytes: 100 },
        );
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
