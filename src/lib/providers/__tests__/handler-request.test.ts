/**
 * Unit tests for the request parser extracted from `handler.ts` in Phase 2.
 */
import { describe, it, expect } from 'vitest';
import { parseProvidersRequest } from '../handler-request';

describe('parseProvidersRequest — validation failures', () => {
    it('returns 400 for empty body', async () => {
        const r = await parseProvidersRequest('');
        expect(r.kind).toBe('response');
        if (r.kind !== 'response') return;
        expect(r.response.status).toBe(400);
    });

    it('returns 400 for whitespace-only body', async () => {
        const r = await parseProvidersRequest('   \n   ');
        expect(r.kind).toBe('response');
        if (r.kind !== 'response') return;
        expect(r.response.status).toBe(400);
    });

    it('returns 400 for malformed JSON', async () => {
        const r = await parseProvidersRequest('not { json');
        expect(r.kind).toBe('response');
        if (r.kind !== 'response') return;
        expect(r.response.status).toBe(400);
    });

    it('returns 400 when lat/lng/trade are missing', async () => {
        const r = await parseProvidersRequest(JSON.stringify({ lat: -33.92 }));
        expect(r.kind).toBe('response');
        if (r.kind !== 'response') return;
        expect(r.response.status).toBe(400);
    });

    it('returns 400 when pageToken is supplied without searchQuery', async () => {
        const r = await parseProvidersRequest(
            JSON.stringify({
                lat: -33.92,
                lng: 18.42,
                trade: 'Plumbing',
                pageToken: 'abc',
            }),
        );
        expect(r.kind).toBe('response');
        if (r.kind !== 'response') return;
        expect(r.response.status).toBe(400);
    });
});

describe('parseProvidersRequest — successful parses', () => {
    it('parses a minimal valid request', async () => {
        const r = await parseProvidersRequest(
            JSON.stringify({ lat: -33.92, lng: 18.42, trade: 'Plumbing' }),
        );
        expect(r.kind).toBe('parsed');
        if (r.kind !== 'parsed') return;
        expect(r.parsed.lat).toBe(-33.92);
        expect(r.parsed.trade).toBe('Plumbing');
        expect(r.radius).toBe(50_000); // default
        expect(r.quickMode).toBe(false);
    });

    it('caps radius at 50_000 meters', async () => {
        const r = await parseProvidersRequest(
            JSON.stringify({
                lat: -33.92,
                lng: 18.42,
                trade: 'Plumbing',
                radius: 999_999,
            }),
        );
        expect(r.kind).toBe('parsed');
        if (r.kind !== 'parsed') return;
        expect(r.radius).toBe(50_000);
    });

    it('honours custom radius below the cap', async () => {
        const r = await parseProvidersRequest(
            JSON.stringify({
                lat: -33.92,
                lng: 18.42,
                trade: 'Plumbing',
                radius: 5000,
            }),
        );
        expect(r.kind).toBe('parsed');
        if (r.kind !== 'parsed') return;
        expect(r.radius).toBe(5000);
    });

    it('extracts quickMode flag', async () => {
        const r = await parseProvidersRequest(
            JSON.stringify({
                lat: -33.92,
                lng: 18.42,
                trade: 'Plumbing',
                quick: true,
            }),
        );
        expect(r.kind).toBe('parsed');
        if (r.kind !== 'parsed') return;
        expect(r.quickMode).toBe(true);
    });

    it('accepts pageToken when searchQuery is also supplied', async () => {
        const r = await parseProvidersRequest(
            JSON.stringify({
                lat: -33.92,
                lng: 18.42,
                trade: 'Plumbing',
                pageToken: 'abc',
                searchQuery: 'plumber',
            }),
        );
        expect(r.kind).toBe('parsed');
    });
});
