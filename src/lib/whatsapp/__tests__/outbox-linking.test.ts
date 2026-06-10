import { describe, it, expect, vi, beforeEach } from 'vitest';

const inserted: Array<Record<string, unknown>> = [];
let optedOut = false;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => ({
        from: (table: string) => ({
            insert: (row: Record<string, unknown>) => {
                inserted.push({ table, ...row });
                return Promise.resolve({ data: null, error: null });
            },
            upsert: () => Promise.resolve({ data: null, error: null }),
            delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({
                        data: optedOut ? { phone_number: 'x' } : null,
                        error: null,
                    }),
                }),
            }),
        }),
    })),
}));

import { sendOutbound } from '../outbox';
import { normalisePhone } from '../linking';
import type { WhatsappChannel, SendResult } from '../channel/types';

function fakeChannel(results: SendResult[]): WhatsappChannel & { calls: number } {
    const channel = {
        calls: 0,
        verifySignature: () => true,
        parseInbound: () => ({ events: [], statuses: [] }),
        sendText: async () => {
            channel.calls++;
            return results[Math.min(channel.calls - 1, results.length - 1)];
        },
        sendInteractive: async () => {
            channel.calls++;
            return results[Math.min(channel.calls - 1, results.length - 1)];
        },
        sendTemplate: async () => {
            channel.calls++;
            return results[Math.min(channel.calls - 1, results.length - 1)];
        },
        fetchMedia: async () => null,
    };
    return channel;
}

beforeEach(() => {
    inserted.length = 0;
    optedOut = false;
});

describe('outbox', () => {
    it('retries retryable failures then succeeds', async () => {
        const channel = fakeChannel([
            { ok: false, retryable: true, error: '500' },
            { ok: true, messageId: 'wamid.ok' },
        ]);
        const res = await sendOutbound({ to: '27821234567', kind: 'reply', text: 'hi' }, channel);
        expect(res.ok).toBe(true);
        expect(channel.calls).toBe(2);
    });

    it('does not retry non-retryable failures and dead-letters them', async () => {
        const channel = fakeChannel([{ ok: false, retryable: false, error: 'bad request' }]);
        const res = await sendOutbound({ to: '27821234567', kind: 'reply', text: 'hi' }, channel);
        expect(res.ok).toBe(false);
        expect(channel.calls).toBe(1);
        expect(inserted.some((r) => r.table === 'whatsapp_outbox_failures')).toBe(true);
    });

    it('suppresses proactive sends to opted-out numbers', async () => {
        optedOut = true;
        const channel = fakeChannel([{ ok: true }]);
        const res = await sendOutbound(
            { to: '27821234567', kind: 'proactive', text: 'nudge' },
            channel,
        );
        expect(res.ok).toBe(false);
        expect(res.error).toContain('opted out');
        expect(channel.calls).toBe(0);
    });

    it('still sends replies to opted-out numbers (user-initiated)', async () => {
        optedOut = true;
        const channel = fakeChannel([{ ok: true }]);
        const res = await sendOutbound({ to: '27821234567', kind: 'reply', text: 'hi' }, channel);
        expect(res.ok).toBe(true);
    });
});

describe('normalisePhone', () => {
    it('keeps E.164 SA numbers', () => {
        expect(normalisePhone('27821234567')).toBe('27821234567');
    });
    it('converts local 0-prefixed numbers', () => {
        expect(normalisePhone('082 123 4567')).toBe('27821234567');
    });
    it('strips formatting', () => {
        expect(normalisePhone('+27 82 123-4567')).toBe('27821234567');
    });
    it('rejects junk', () => {
        expect(normalisePhone('hello')).toBeNull();
        expect(normalisePhone('123')).toBeNull();
    });
});
