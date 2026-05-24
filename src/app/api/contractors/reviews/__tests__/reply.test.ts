/**
 * Contractor reply endpoint — `POST /api/contractors/reviews/[id]/reply`.
 *
 * Auth: only the contractor who owns the provider linked to the outcome may
 * reply or edit. The 24-hour edit window is measured against the existing
 * `contractor_reply_at` (NOT `created_at`), so first replies are always
 * allowed and edits within 24h of the previous reply are allowed.
 *
 * These tests mock the Supabase admin + server clients following the
 * pattern in `apply/__tests__/popia-consent.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

type OutcomeRow = {
    id: string;
    provider_id: string;
    contractor_reply: string | null;
    contractor_reply_at: string | null;
};

type OwnerRow = { id: string } | null;

interface FixtureState {
    outcome: OutcomeRow | null;
    owner: OwnerRow;
    updatedPayload: Record<string, unknown> | null;
    updateResult: {
        data: { contractor_reply: string; contractor_reply_at: string } | null;
        error: { message: string } | null;
    };
}

const state: FixtureState = {
    outcome: null,
    owner: null,
    updatedPayload: null,
    updateResult: {
        data: { contractor_reply: 'ok', contractor_reply_at: '2026-05-23T00:00:00Z' },
        error: null,
    },
};

function buildAdminClient() {
    return {
        from: vi.fn((table: string) => {
            if (table === 'job_outcomes') {
                // Differentiate between the initial lookup (select.eq.maybeSingle)
                // and the update (update.eq.select.single) by tracking the last
                // verb on the builder.
                let mode: 'select' | 'update' = 'select';
                const builder: Record<string, unknown> = {};
                Object.assign(builder, {
                    select: vi.fn(() => builder),
                    update: vi.fn((payload: Record<string, unknown>) => {
                        mode = 'update';
                        state.updatedPayload = payload;
                        return builder;
                    }),
                    eq: vi.fn(() => builder),
                    maybeSingle: vi.fn(async () => ({
                        data: state.outcome,
                        error: null,
                    })),
                    single: vi.fn(async () => {
                        if (mode === 'update') return state.updateResult;
                        return { data: state.outcome, error: null };
                    }),
                });
                return builder;
            }
            if (table === 'provider_applications') {
                const builder: Record<string, unknown> = {};
                Object.assign(builder, {
                    select: vi.fn(() => builder),
                    eq: vi.fn(() => builder),
                    limit: vi.fn(() => builder),
                    maybeSingle: vi.fn(async () => ({ data: state.owner, error: null })),
                });
                return builder;
            }
            return {
                select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
            };
        }),
    };
}

let adminClient: ReturnType<typeof buildAdminClient>;
let serverClient: { auth: { getUser: ReturnType<typeof vi.fn> } };

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

const VALID_OUTCOME_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const PROVIDER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

function makeReplyRequest(body: unknown) {
    return makeRequest({
        method: 'POST',
        path: `/api/contractors/reviews/${VALID_OUTCOME_ID}/reply`,
        body,
    });
}

async function callRoute(req: ReturnType<typeof makeReplyRequest>) {
    const { POST } = await import('../[id]/reply/route');
    return POST(req, { params: Promise.resolve({ id: VALID_OUTCOME_ID }) });
}

beforeEach(() => {
    vi.clearAllMocks();
    state.outcome = {
        id: VALID_OUTCOME_ID,
        provider_id: PROVIDER_ID,
        contractor_reply: null,
        contractor_reply_at: null,
    };
    state.owner = { id: 'app-1' };
    state.updatedPayload = null;
    state.updateResult = {
        data: {
            contractor_reply: 'Thanks for the feedback.',
            contractor_reply_at: '2026-05-23T12:00:00Z',
        },
        error: null,
    };
    serverClient = {
        auth: {
            getUser: vi.fn(async () => ({
                data: { user: { id: 'user-1' } },
                error: null,
            })),
        },
    };
    adminClient = buildAdminClient();
});

describe('POST /api/contractors/reviews/[id]/reply', () => {
    it('returns 401 when unauthenticated', async () => {
        serverClient.auth.getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
        const res = await callRoute(makeReplyRequest({ reply: 'Thanks for the feedback!' }));
        expect(res.status).toBe(401);
    });

    it('returns 403 when the contractor does not own the matched provider', async () => {
        state.owner = null; // no matching approved application
        const res = await callRoute(makeReplyRequest({ reply: 'Thanks for the feedback!' }));
        expect(res.status).toBe(403);
    });

    it('returns 400 when reply is empty', async () => {
        const res = await callRoute(makeReplyRequest({ reply: '   ' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when reply exceeds 1000 chars', async () => {
        const huge = 'a'.repeat(1001);
        const res = await callRoute(makeReplyRequest({ reply: huge }));
        expect(res.status).toBe(400);
    });

    it('first reply succeeds and writes both contractor_reply + contractor_reply_at', async () => {
        const res = await callRoute(
            makeReplyRequest({ reply: 'Thanks for the feedback, we appreciate it.' }),
        );
        expect(res.status).toBe(200);
        const json = (await res.json()) as { ok: boolean };
        expect(json.ok).toBe(true);
        expect(state.updatedPayload).not.toBeNull();
        expect(typeof state.updatedPayload?.contractor_reply).toBe('string');
        expect(typeof state.updatedPayload?.contractor_reply_at).toBe('string');
    });

    it('allows an edit when the existing reply is younger than 24 hours', async () => {
        // Existing reply 1 hour ago — well inside the edit window.
        state.outcome = {
            id: VALID_OUTCOME_ID,
            provider_id: PROVIDER_ID,
            contractor_reply: 'Original reply text.',
            contractor_reply_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        };
        const res = await callRoute(
            makeReplyRequest({ reply: 'Updated reply within the edit window.' }),
        );
        expect(res.status).toBe(200);
    });

    it('rejects an edit when the existing reply is older than 24 hours (window closed)', async () => {
        // Existing reply 25 hours ago — outside the edit window.
        state.outcome = {
            id: VALID_OUTCOME_ID,
            provider_id: PROVIDER_ID,
            contractor_reply: 'Original reply text.',
            contractor_reply_at: new Date(
                Date.now() - 25 * 60 * 60 * 1000,
            ).toISOString(),
        };
        const res = await callRoute(makeReplyRequest({ reply: 'Too late to edit, sorry.' }));
        expect(res.status).toBe(403);
        const json = (await res.json()) as { error?: string };
        expect(json.error).toMatch(/window/i);
    });
});
