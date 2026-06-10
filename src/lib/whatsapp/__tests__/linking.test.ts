import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A chainable Supabase mock. Each `from(table)` returns a builder whose
// terminal `maybeSingle`/`single` resolves a value popped from a per-table
// queue; `insert`/`update`/`delete` record their payloads and resolve to a
// queued result (default { error: null }).
type Result = { data?: unknown; error?: unknown };

interface MockState {
    selectQueue: Result[];
    insertResult: Result;
    updateResult: Result;
    inserts: Array<{ table: string; payload: Record<string, unknown> }>;
    updates: Array<{ table: string; payload: Record<string, unknown> }>;
}

const ms: MockState = {
    selectQueue: [],
    insertResult: { error: null },
    updateResult: { error: null },
    inserts: [],
    updates: [],
};

function nextSelect(): Result {
    return ms.selectQueue.length ? ms.selectQueue.shift()! : { data: null, error: null };
}

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => ({
        from(table: string) {
            let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                neq: () => builder,
                not: () => builder,
                is: () => builder,
                order: () => builder,
                limit: () => builder,
                insert(payload: Record<string, unknown>) {
                    op = 'insert';
                    ms.inserts.push({ table, payload });
                    return Promise.resolve(ms.insertResult);
                },
                update(payload: Record<string, unknown>) {
                    op = 'update';
                    ms.updates.push({ table, payload });
                    return builder;
                },
                delete() {
                    op = 'delete';
                    return builder;
                },
                maybeSingle: () =>
                    Promise.resolve(op === 'update' ? ms.updateResult : nextSelect()),
                single: () =>
                    Promise.resolve(op === 'update' ? ms.updateResult : nextSelect()),
            };
            return builder;
        },
    })),
}));

vi.mock('@/lib/site-url', () => ({
    getSiteUrl: () => 'https://mendr.test',
    getAppOrigin: () => 'https://mendr.test',
}));

import {
    createMagicLink,
    consumeMagicLink,
    createOtp,
    verifyOtp,
    findUserByVerifiedPhone,
} from '../linking';

beforeEach(() => {
    ms.selectQueue = [];
    ms.insertResult = { error: null };
    ms.updateResult = { data: { id: 'u1' }, error: null };
    ms.inserts = [];
    ms.updates = [];
    vi.clearAllMocks();
});

const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => errSpy.mockClear());

describe('createMagicLink', () => {
    it('inserts a hashed magic_link token and returns a link URL', async () => {
        const url = await createMagicLink('27821234567');
        expect(url).toMatch(/^https:\/\/mendr\.test\/api\/whatsapp\/link\?token=/);
        expect(ms.inserts[0].table).toBe('whatsapp_link_tokens');
        expect(ms.inserts[0].payload).toMatchObject({
            phone_number: '27821234567',
            kind: 'magic_link',
        });
        // The token in the URL must not equal the stored hash.
        const token = (url as string).split('token=')[1];
        expect(ms.inserts[0].payload.token_hash).not.toBe(token);
    });

    it('returns null when the insert fails', async () => {
        ms.insertResult = { error: { message: 'insert failed' } };
        expect(await createMagicLink('27821234567')).toBeNull();
    });
});

describe('consumeMagicLink', () => {
    it('returns invalid when the token row is not found', async () => {
        ms.selectQueue = [{ data: null, error: null }];
        const res = await consumeMagicLink('tok', 'user-1');
        expect(res).toEqual({ ok: false, reason: 'invalid' });
    });

    it('returns used when the token was already consumed', async () => {
        ms.selectQueue = [
            {
                data: {
                    id: 't1',
                    phone_number: '27821234567',
                    expires_at: new Date(Date.now() + 1000).toISOString(),
                    consumed_at: new Date().toISOString(),
                },
            },
        ];
        const res = await consumeMagicLink('tok', 'user-1');
        expect(res).toEqual({ ok: false, reason: 'used' });
    });

    it('returns expired for a token past its expiry', async () => {
        ms.selectQueue = [
            {
                data: {
                    id: 't1',
                    phone_number: '27821234567',
                    expires_at: new Date(Date.now() - 1000).toISOString(),
                    consumed_at: null,
                },
            },
        ];
        const res = await consumeMagicLink('tok', 'user-1');
        expect(res).toEqual({ ok: false, reason: 'expired' });
    });

    it('links the phone and marks the token consumed on success', async () => {
        ms.selectQueue = [
            // token lookup
            {
                data: {
                    id: 't1',
                    phone_number: '27821234567',
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                    consumed_at: null,
                },
            },
            // linkPhoneToUser uniqueness check → no other owner
            { data: null, error: null },
        ];
        const res = await consumeMagicLink('tok', 'user-1');
        expect(res).toEqual({ ok: true, phone: '27821234567' });
        // profiles updated + token consumed
        expect(ms.updates.some((u) => u.table === 'profiles')).toBe(true);
        expect(
            ms.updates.some(
                (u) => u.table === 'whatsapp_link_tokens' && 'consumed_at' in u.payload,
            ),
        ).toBe(true);
    });

    it('returns phone_in_use when the phone already belongs to another verified profile', async () => {
        ms.selectQueue = [
            {
                data: {
                    id: 't1',
                    phone_number: '27821234567',
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                    consumed_at: null,
                },
            },
            // uniqueness check returns an existing owner
            { data: { id: 'other-user' }, error: null },
        ];
        const res = await consumeMagicLink('tok', 'user-1');
        expect(res).toEqual({ ok: false, reason: 'phone_in_use' });
    });
});

describe('createOtp', () => {
    it('inserts a hashed otp token and returns a 6-digit code', async () => {
        const code = await createOtp('27821234567', 'user-1');
        expect(code).toMatch(/^\d{6}$/);
        const otpInsert = ms.inserts.find((i) => i.payload.kind === 'otp');
        expect(otpInsert).toBeDefined();
        expect(otpInsert!.payload).toMatchObject({
            phone_number: '27821234567',
            created_for: 'user-1',
        });
    });

    it('returns null when the insert fails', async () => {
        ms.insertResult = { error: { message: 'fail' } };
        expect(await createOtp('27821234567', 'user-1')).toBeNull();
    });
});

describe('verifyOtp', () => {
    it('returns invalid when no pending otp row exists', async () => {
        ms.selectQueue = [{ data: null, error: null }];
        const res = await verifyOtp('27821234567', '123456', 'user-1');
        expect(res).toEqual({ ok: false, reason: 'invalid' });
    });

    it('returns expired for an expired otp', async () => {
        ms.selectQueue = [
            {
                data: {
                    id: 'o1',
                    expires_at: new Date(Date.now() - 1000).toISOString(),
                    consumed_at: null,
                    attempts: 0,
                },
            },
        ];
        const res = await verifyOtp('27821234567', '123456', 'user-1');
        expect(res).toEqual({ ok: false, reason: 'expired' });
    });

    it('returns too_many_attempts after the attempt cap', async () => {
        ms.selectQueue = [
            {
                data: {
                    id: 'o1',
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                    consumed_at: null,
                    attempts: 5,
                },
            },
        ];
        const res = await verifyOtp('27821234567', '123456', 'user-1');
        expect(res).toEqual({ ok: false, reason: 'too_many_attempts' });
    });

    it('returns wrong_code and increments attempts on a hash mismatch', async () => {
        ms.selectQueue = [
            {
                data: {
                    id: 'o1',
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                    consumed_at: null,
                    attempts: 0,
                },
            },
            // hash match lookup → no match
            { data: null, error: null },
        ];
        const res = await verifyOtp('27821234567', '000000', 'user-1');
        expect(res).toEqual({ ok: false, reason: 'wrong_code' });
        expect(
            ms.updates.some(
                (u) => u.table === 'whatsapp_link_tokens' && u.payload.attempts === 1,
            ),
        ).toBe(true);
    });

    it('links the phone and consumes the otp on a correct code', async () => {
        ms.selectQueue = [
            {
                data: {
                    id: 'o1',
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                    consumed_at: null,
                    attempts: 0,
                },
            },
            // hash match lookup → matches
            { data: { id: 'o1' }, error: null },
            // linkPhoneToUser uniqueness check → no other owner
            { data: null, error: null },
        ];
        const res = await verifyOtp('27821234567', '123456', 'user-1');
        expect(res).toEqual({ ok: true });
        expect(ms.updates.some((u) => u.table === 'profiles')).toBe(true);
    });
});

describe('findUserByVerifiedPhone', () => {
    it('returns the user id for a verified phone', async () => {
        ms.selectQueue = [{ data: { id: 'user-7' }, error: null }];
        expect(await findUserByVerifiedPhone('27821234567')).toBe('user-7');
    });

    it('returns null when no verified profile matches', async () => {
        ms.selectQueue = [{ data: null, error: null }];
        expect(await findUserByVerifiedPhone('27829999999')).toBeNull();
    });
});
