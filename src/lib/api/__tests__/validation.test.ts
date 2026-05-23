import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, parseQuery, TrimmedString, Email } from '../validation';

function makeJsonRequest(body: unknown, opts: { rawBody?: string } = {}) {
    const init: RequestInit = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
    };
    init.body = opts.rawBody !== undefined ? opts.rawBody : JSON.stringify(body);
    return new NextRequest('http://localhost/test', init);
}

describe('parseJsonBody', () => {
    const schema = z.object({ name: z.string().min(1), age: z.number().int() });

    it('returns data when the body matches the schema', async () => {
        const req = makeJsonRequest({ name: 'Ada', age: 36 });
        const out = await parseJsonBody(req, schema);
        expect('data' in out).toBe(true);
        if ('data' in out) {
            expect(out.data).toEqual({ name: 'Ada', age: 36 });
        }
    });

    it('returns a 400 on invalid JSON', async () => {
        const req = makeJsonRequest(null, { rawBody: '{ broken json' });
        const out = await parseJsonBody(req, schema);
        expect('error' in out).toBe(true);
        if ('error' in out) {
            expect(out.error.status).toBe(400);
            const body = await out.error.json();
            expect(body.error).toMatch(/invalid json/i);
        }
    });

    it('returns a 400 when the body is null', async () => {
        const req = makeJsonRequest(null);
        const out = await parseJsonBody(req, schema);
        expect('error' in out).toBe(true);
        if ('error' in out) {
            expect(out.error.status).toBe(400);
        }
    });

    it('returns a 400 with path-prefixed message when a field is missing', async () => {
        const req = makeJsonRequest({ age: 30 });
        const out = await parseJsonBody(req, schema);
        expect('error' in out).toBe(true);
        if ('error' in out) {
            expect(out.error.status).toBe(400);
            const body = await out.error.json();
            expect(body.error).toMatch(/^name:/);
            expect(Array.isArray(body.issues)).toBe(true);
            expect(body.issues[0].path).toBe('name');
        }
    });

    it('returns a 400 when a field is the wrong type', async () => {
        const req = makeJsonRequest({ name: 'Ada', age: 'thirty' });
        const out = await parseJsonBody(req, schema);
        expect('error' in out).toBe(true);
        if ('error' in out) {
            expect(out.error.status).toBe(400);
            const body = await out.error.json();
            expect(body.error).toMatch(/^age:/);
        }
    });
});

describe('parseQuery', () => {
    const schema = z.object({
        q: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(100).optional(),
    });

    it('returns parsed query params', () => {
        const req = new NextRequest('http://localhost/test?q=cape&limit=10');
        const out = parseQuery(req, schema);
        expect('data' in out).toBe(true);
        if ('data' in out) {
            expect(out.data).toEqual({ q: 'cape', limit: 10 });
        }
    });

    it('returns 400 when a required param is missing', () => {
        const req = new NextRequest('http://localhost/test');
        const out = parseQuery(req, schema);
        expect('error' in out).toBe(true);
        if ('error' in out) {
            expect(out.error.status).toBe(400);
        }
    });
});

describe('TrimmedString', () => {
    it('trims and accepts non-empty strings', () => {
        expect(TrimmedString.parse('  hello  ')).toBe('hello');
    });

    it('rejects empty strings after trim', () => {
        expect(() => TrimmedString.parse('   ')).toThrow();
    });

    it('rejects non-string inputs', () => {
        expect(() => TrimmedString.parse(42 as unknown as string)).toThrow();
    });
});

describe('Email', () => {
    it('normalises and accepts valid emails', () => {
        expect(Email.parse('  MATT@example.com ')).toBe('matt@example.com');
    });

    it('rejects malformed emails', () => {
        expect(() => Email.parse('not-an-email')).toThrow();
        expect(() => Email.parse('foo@bar')).toThrow();
    });
});
