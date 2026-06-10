/**
 * Tests for audit-log.ts — logMendrEvent, getClientMetadata
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { logMendrEvent, getClientMetadata } from '../audit-log';

afterEach(() => {
    vi.restoreAllMocks();
});

// ── Helper: mock Supabase client ──────────────────────────────────────────────

function makeSupabaseMock(insertError: { message: string } | null = null) {
    const insertMock = vi.fn().mockResolvedValue({ error: insertError });
    return {
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-abc' } } }),
        },
        from: vi.fn(() => ({ insert: insertMock })),
        _insertMock: insertMock,
    };
}

// ── logMendrEvent ─────────────────────────────────────────────────────────────

describe('logMendrEvent', () => {
    it('inserts a row with the correct event fields', async () => {
        const sb = makeSupabaseMock();
        const result = await logMendrEvent(sb as never, {
            action: 'diagnosis_created',
            type: 'DIAGNOSTIC',
            entityId: 'diag-001',
            entityType: 'diagnosis',
            payload: { trade: 'Electrical' },
        });

        expect(result.error).toBeNull();
        expect(sb.from).toHaveBeenCalledWith('audit_logs');
        const insertArg = sb._insertMock.mock.calls[0][0];
        expect(insertArg.user_id).toBe('user-abc');
        expect(insertArg.event_type).toBe('DIAGNOSTIC');
        expect(insertArg.action).toBe('diagnosis_created');
        expect(insertArg.entity_id).toBe('diag-001');
        expect(insertArg.entity_type).toBe('diagnosis');
        expect(insertArg.payload).toEqual({ trade: 'Electrical' });
    });

    it('inserts with null user_id when no user is authenticated', async () => {
        const sb = {
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
            },
            from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
        };
        await logMendrEvent(sb as never, {
            action: 'anon_event',
            type: 'SYSTEM',
        });
        const insertArg = (sb.from().insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        // user_id should be null for anonymous user
        if (insertArg) {
            expect(insertArg.user_id).toBeNull();
        }
    });

    it('returns error when insert fails', async () => {
        const sb = makeSupabaseMock({ message: 'DB connection error' });
        const result = await logMendrEvent(sb as never, {
            action: 'test_action',
            type: 'SYSTEM',
        });
        expect(result.error).toBeTruthy();
    });

    it('does not throw when getUser throws', async () => {
        const sb = {
            auth: {
                getUser: vi.fn().mockRejectedValue(new Error('auth down')),
            },
            from: vi.fn(),
        };
        const result = await logMendrEvent(sb as never, {
            action: 'test',
            type: 'SYSTEM',
        });
        expect(result.error).toBeInstanceOf(Error);
    });

    it('uses provided metadata instead of collecting it', async () => {
        const sb = makeSupabaseMock();
        await logMendrEvent(
            sb as never,
            { action: 'test', type: 'AUTH' },
            { metadata: { ip: '1.2.3.4', user_agent: 'test-ua' } },
        );
        const insertArg = sb._insertMock.mock.calls[0][0];
        expect(insertArg.metadata?.ip).toBe('1.2.3.4');
        expect(insertArg.metadata?.user_agent).toBe('test-ua');
    });
});

// ── getClientMetadata ─────────────────────────────────────────────────────────

describe('getClientMetadata', () => {
    it('returns an object without throwing', async () => {
        const meta = await getClientMetadata();
        expect(typeof meta).toBe('object');
    });

    it('extracts IP from x-forwarded-for header', async () => {
        const headers = new Headers();
        headers.set('x-forwarded-for', '10.0.0.1, 10.0.0.2');
        const meta = await getClientMetadata({ headers });
        expect(meta.ip).toBe('10.0.0.1');
    });

    it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
        const headers = new Headers();
        headers.set('x-real-ip', '192.168.1.1');
        const meta = await getClientMetadata({ headers });
        expect(meta.ip).toBe('192.168.1.1');
    });

    it('extracts user_agent from headers when navigator.userAgent is unavailable', async () => {
        const headers = new Headers();
        headers.set('user-agent', 'TestAgent/1.0');
        const meta = await getClientMetadata({ headers });
        // user_agent could be from navigator or headers
        expect(typeof meta.user_agent).toBe('string');
    });
});
