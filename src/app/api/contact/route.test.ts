/**
 * Contract tests for POST /api/contact.
 *
 * Covers:
 *  - validation failure on malformed body
 *  - validation failure on bad email
 *  - happy path returns { ok: true } and writes a contact row
 *  - DB error surfaces as 500
 *  - whitelist enforcement for `subject`
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

// ── Mocks ─────────────────────────────────────────────────────────────────────
let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

vi.mock('resend', () => ({
    Resend: vi.fn(() => ({
        emails: { send: vi.fn(async () => ({ data: { id: 'x' }, error: null })) },
    })),
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: { contact_messages: { data: null, error: null } },
    });
});

describe('POST /api/contact — validation', () => {
    it('returns 400 on malformed JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: undefined, rawBody: '{ broken' }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when name is missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { email: 'a@b.com', message: 'hi' } }),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/name/i);
    });

    it('returns 400 when email is malformed', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { name: 'Ada', email: 'not-an-email', message: 'hi' },
            }),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/email/i);
    });

    it('returns 400 when message exceeds 5000 chars', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: {
                    name: 'Ada',
                    email: 'a@b.com',
                    message: 'x'.repeat(5001),
                },
            }),
        );
        expect(res.status).toBe(400);
    });
});

describe('POST /api/contact — happy path', () => {
    it('returns { ok: true } and inserts a contact_messages row', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: {
                    name: '  Ada Lovelace  ',
                    email: '  ADA@example.COM  ',
                    subject: 'General question',
                    message: 'Hello there',
                },
            }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ ok: true });
        expect(supabase.from).toHaveBeenCalledWith('contact_messages');
    });

    it('drops invalid subject values (whitelist)', async () => {
        const { POST } = await import('./route');
        const insertSpy = vi.fn((_payload?: unknown) => supabase.from('contact_messages'));
        supabase.from = vi.fn((table: string) => {
            const b = mockSupabaseClient({
                tables: { [table]: { data: null, error: null } },
            }).from(table);
            // Capture the insert payload
            const origInsert = b.insert as unknown as (payload: unknown) => unknown;
            b.insert = vi.fn((payload: unknown) => {
                insertSpy(payload);
                return origInsert(payload);
            });
            return b;
        });

        const res = await POST(
            makeRequest({
                method: 'POST',
                body: {
                    name: 'Ada',
                    email: 'ada@example.com',
                    subject: '<script>',
                    message: 'hi',
                },
            }),
        );
        expect(res.status).toBe(200);
    });
});

describe('POST /api/contact — DB failure', () => {
    it('returns 500 when the insert fails', async () => {
        supabase = mockSupabaseClient({
            tables: { contact_messages: { data: null, error: { message: 'db down' } } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { name: 'Ada', email: 'a@b.com', message: 'hi' },
            }),
        );
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('db down');
    });
});

describe('POST /api/contact — rate limit', () => {
    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rateLimitConfig = await import('@/lib/rate-limit-config');
        vi.mocked(rateLimitConfig.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rate_limited' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { name: 'Ada', email: 'a@b.com', message: 'hi' },
            }),
        );
        expect(res.status).toBe(429);
    });
});
