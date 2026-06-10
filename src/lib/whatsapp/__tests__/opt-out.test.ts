import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Op {
    table: string;
    op: 'upsert' | 'delete' | 'select';
    payload?: unknown;
    conflict?: unknown;
    eq?: [string, unknown];
}

const ops: Op[] = [];
let optedOutData: Record<string, unknown> | null = null;
let throwOnClient = false;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => {
        if (throwOnClient) throw new Error('client boom');
        return {
            from: (table: string) => ({
                upsert: (payload: unknown, opts?: { onConflict?: unknown }) => {
                    ops.push({ table, op: 'upsert', payload, conflict: opts?.onConflict });
                    return Promise.resolve({ data: null, error: null });
                },
                delete: () => ({
                    eq: (col: string, val: unknown) => {
                        ops.push({ table, op: 'delete', eq: [col, val] });
                        return Promise.resolve({ data: null, error: null });
                    },
                }),
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({ data: optedOutData, error: null }),
                    }),
                }),
            }),
        };
    }),
}));

import { recordOptOut, clearOptOut, isOptedOut } from '../opt-out';

beforeEach(() => {
    ops.length = 0;
    optedOutData = null;
    throwOnClient = false;
    vi.clearAllMocks();
});

describe('recordOptOut', () => {
    it('upserts the phone into whatsapp_opt_outs keyed on phone_number', async () => {
        await recordOptOut('27821234567');
        expect(ops).toEqual([
            {
                table: 'whatsapp_opt_outs',
                op: 'upsert',
                payload: { phone_number: '27821234567' },
                conflict: 'phone_number',
            },
        ]);
    });

    it('swallows errors and does not throw', async () => {
        throwOnClient = true;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(recordOptOut('27820000000')).resolves.toBeUndefined();
        errSpy.mockRestore();
    });
});

describe('clearOptOut', () => {
    it('deletes the opt-out row for the phone', async () => {
        await clearOptOut('27821234567');
        expect(ops[0]).toMatchObject({
            table: 'whatsapp_opt_outs',
            op: 'delete',
            eq: ['phone_number', '27821234567'],
        });
    });
});

describe('isOptedOut', () => {
    it('returns true when a row exists', async () => {
        optedOutData = { phone_number: '27821234567' };
        expect(await isOptedOut('27821234567')).toBe(true);
    });

    it('returns false when no row exists', async () => {
        optedOutData = null;
        expect(await isOptedOut('27829999999')).toBe(false);
    });

    it('fails open (false) on a client error', async () => {
        throwOnClient = true;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await isOptedOut('27820000000')).toBe(false);
        errSpy.mockRestore();
    });
});
