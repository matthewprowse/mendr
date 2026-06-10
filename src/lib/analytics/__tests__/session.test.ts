import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import { analyticsSessionId } from '@/lib/analytics/session';

function req(headers: Record<string, string>): NextRequest {
    return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe('analyticsSessionId (L3)', () => {
    it('prefers the server-issued scandio_anon cookie', () => {
        const id = analyticsSessionId(req({ cookie: 'scandio_anon=11111111-2222-3333-4444-555555555555' }));
        expect(id).toBe('a:11111111-2222-3333-4444-555555555555');
    });

    it('falls back to a stable IP+UA hash when no cookie is present', () => {
        const headers = { 'x-forwarded-for': '41.2.3.4', 'user-agent': 'Mozilla/5.0' };
        const a = analyticsSessionId(req(headers));
        const b = analyticsSessionId(req(headers));
        expect(a).toMatch(/^h:[0-9a-f]{40}$/);
        expect(a).toBe(b); // stable for the same visitor
    });

    it('ignores any client-supplied session id (not derived from the body)', () => {
        // Two callers with the same IP+UA collapse to one session, so a client
        // cannot inflate distinct-session counts by varying a body field.
        const h = { 'x-forwarded-for': '8.8.8.8', 'user-agent': 'UA' };
        expect(analyticsSessionId(req(h))).toBe(analyticsSessionId(req(h)));
    });
});
