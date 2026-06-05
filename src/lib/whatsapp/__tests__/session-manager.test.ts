import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// A focused Supabase admin mock that records insert/update payloads and serves
// queued results per terminal operation. The session manager hits a single
// table (whatsapp_sessions) repeatedly, so `select` is a queue.
// ---------------------------------------------------------------------------

interface Result {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
}

const state: {
    select: Result[];
    insert: Result;
    update: Result;
    inserts: Record<string, unknown>[];
    updates: Record<string, unknown>[];
} = { select: [], insert: { data: null, error: null }, update: { data: null, error: null }, inserts: [], updates: [] };

function makeAdmin() {
    function from(_table: string) {
        let op: 'select' | 'insert' | 'update' = 'select';
        const builder: Record<string, unknown> = {
            select() {
                return builder;
            },
            eq() {
                return builder;
            },
            insert(payload: Record<string, unknown>) {
                op = 'insert';
                state.inserts.push(payload);
                return builder;
            },
            update(payload: Record<string, unknown>) {
                op = 'update';
                state.updates.push(payload);
                return builder;
            },
            maybeSingle() {
                return Promise.resolve(resolve());
            },
            single() {
                return Promise.resolve(resolve());
            },
        };
        function resolve(): Result {
            if (op === 'insert') return state.insert;
            if (op === 'update') return state.update;
            return state.select.length > 1 ? state.select.shift()! : (state.select[0] ?? { data: null, error: null });
        }
        return builder;
    }
    return { from } as unknown as Awaited<
        ReturnType<typeof import('@/lib/auth/supabase-server').createSupabaseAdminClient>
    >;
}

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => makeAdmin()),
}));

import {
    getSession,
    getOrCreateSession,
    updateSession,
    resetSession,
    msSinceLastMessage,
} from '../session-manager';
import type { WhatsappSession } from '../types';

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 's1',
        phone_number: '27820000000',
        user_id: null,
        state: 'idle',
        active_diagnosis_id: null,
        pending_contractors: null,
        pending_address: null,
        pending_clarification: null,
        last_message_at: '2026-06-01T00:00:00Z',
        created_at: '2026-06-01T00:00:00Z',
        ...over,
    };
}

beforeEach(() => {
    state.select = [];
    state.insert = { data: null, error: null };
    state.update = { data: null, error: null };
    state.inserts = [];
    state.updates = [];
});

describe('getSession', () => {
    it('maps a row to a session', async () => {
        state.select = [{ data: row({ state: 'awaiting_address' }), error: null }];
        const s = await getSession('27820000000');
        expect(s).toMatchObject({ id: 's1', phone_number: '27820000000', state: 'awaiting_address' });
    });

    it('returns null when no row exists', async () => {
        state.select = [{ data: null, error: null }];
        expect(await getSession('nope')).toBeNull();
    });

    it('returns null on a query error', async () => {
        state.select = [{ data: null, error: { message: 'boom' } }];
        expect(await getSession('x')).toBeNull();
    });
});

describe('getOrCreateSession', () => {
    it('returns the existing session', async () => {
        state.select = [{ data: row(), error: null }];
        const s = await getOrCreateSession('27820000000', null);
        expect(s.id).toBe('s1');
        expect(state.inserts).toHaveLength(0);
    });

    it('syncs user_id onto an existing row that lacks it', async () => {
        state.select = [
            { data: row({ user_id: null }), error: null }, // getSession
        ];
        state.update = { data: row({ user_id: 'user-9' }), error: null };
        const s = await getOrCreateSession('27820000000', 'user-9');
        expect(s.user_id).toBe('user-9');
        expect(state.updates[0]).toMatchObject({ user_id: 'user-9' });
    });

    it('creates a fresh idle session when none exists', async () => {
        state.select = [{ data: null, error: null }]; // getSession → none
        state.insert = { data: row({ id: 's-new' }), error: null };
        const s = await getOrCreateSession('27820000000', 'user-1');
        expect(s.id).toBe('s-new');
        expect(state.inserts[0]).toMatchObject({ phone_number: '27820000000', user_id: 'user-1', state: 'idle' });
    });

    it('recovers from an insert race by re-reading the row', async () => {
        state.select = [
            { data: null, error: null }, // first getSession → none
            { data: row({ id: 's-race' }), error: null }, // re-read after insert race
        ];
        state.insert = { data: null, error: { message: 'duplicate key' } };
        const s = await getOrCreateSession('27820000000', null);
        expect(s.id).toBe('s-race');
    });

    it('throws when the insert fails and the row still cannot be read', async () => {
        state.select = [
            { data: null, error: null },
            { data: null, error: null },
        ];
        state.insert = { data: null, error: { message: 'fatal' } };
        await expect(getOrCreateSession('27820000000', null)).rejects.toThrow(/fatal/);
    });
});

describe('updateSession', () => {
    it('touches last_message_at by default', async () => {
        state.update = { data: row(), error: null };
        await updateSession('27820000000', { state: 'awaiting_address' });
        expect(state.updates[0]).toHaveProperty('last_message_at');
        expect(state.updates[0]).toMatchObject({ state: 'awaiting_address' });
    });

    it('omits last_message_at when touch is false', async () => {
        state.update = { data: row(), error: null };
        await updateSession('27820000000', { state: 'idle', touch: false });
        expect(state.updates[0]).not.toHaveProperty('last_message_at');
        expect(state.updates[0]).not.toHaveProperty('touch');
    });

    it('returns null on error', async () => {
        state.update = { data: null, error: { message: 'boom' } };
        expect(await updateSession('x', { state: 'idle' })).toBeNull();
    });
});

describe('resetSession', () => {
    it('clears pending state but preserves the active diagnosis by default', async () => {
        state.update = { data: row(), error: null };
        await resetSession('27820000000');
        const payload = state.updates[0];
        expect(payload).toMatchObject({
            state: 'idle',
            pending_contractors: null,
            pending_address: null,
            pending_clarification: null,
        });
        expect(payload).not.toHaveProperty('active_diagnosis_id');
    });

    it('also clears the active diagnosis when asked', async () => {
        state.update = { data: row(), error: null };
        await resetSession('27820000000', { clearDiagnosis: true });
        expect(state.updates[0]).toMatchObject({ active_diagnosis_id: null });
    });
});

describe('msSinceLastMessage', () => {
    it('returns a finite elapsed time for a valid timestamp', () => {
        const session = { last_message_at: new Date(Date.now() - 5000).toISOString() } as WhatsappSession;
        const ms = msSinceLastMessage(session);
        expect(ms).toBeGreaterThanOrEqual(4000);
        expect(ms).toBeLessThan(60_000);
    });

    it('returns Infinity for an unparseable timestamp', () => {
        const session = { last_message_at: 'not-a-date' } as WhatsappSession;
        expect(msSinceLastMessage(session)).toBe(Number.POSITIVE_INFINITY);
    });
});
