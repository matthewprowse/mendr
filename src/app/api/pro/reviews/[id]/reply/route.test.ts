/**
 * Contract tests for POST /api/pro/reviews/[id]/reply.
 *
 * Covers: rate limit, id validation, auth, reply length bounds, 404 unknown
 * outcome, ownership 403, the 24-hour edit window (first reply allowed, edit
 * inside window allowed, edit after window 403), update failure 500, and the
 * happy path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let serverClient: MockSupabaseClient;
let rateLimited = false;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => {
        if (rateLimited) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }
        return null;
    }),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const OUTCOME_ID = '123e4567-e89b-42d3-a456-426614174000';
const USER = { id: 'user-1' };

interface OutcomeRow {
    id: string;
    provider_id: string;
    contractor_reply: string | null;
    contractor_reply_at: string | null;
}

function setup(opts: {
    outcome?: OutcomeRow | null;
    ownerApp?: { id: string } | null;
    updateError?: boolean;
}): void {
    const outcome =
        opts.outcome === undefined
            ? {
                  id: OUTCOME_ID,
                  provider_id: 'prov-1',
                  contractor_reply: null,
                  contractor_reply_at: null,
              }
            : opts.outcome;
    // NOTE: the route's update chain ends in `.select().single()`, which makes
    // the mock helper report the op as 'select' — so we distinguish the initial
    // outcome lookup from the update by call order instead.
    let jobOutcomeCalls = 0;
    supabase = mockSupabaseClient({
        tables: {
            job_outcomes: () => {
                jobOutcomeCalls += 1;
                if (jobOutcomeCalls > 1) {
                    return opts.updateError
                        ? { data: null, error: { message: 'update failed' } }
                        : {
                              data: {
                                  contractor_reply: 'Thanks for the feedback!',
                                  contractor_reply_at: '2026-06-09T10:00:00.000Z',
                              },
                              error: null,
                          };
                }
                return { data: outcome, error: null };
            },
            provider_applications: {
                data: opts.ownerApp === undefined ? { id: 'app-1' } : opts.ownerApp,
                error: null,
            },
        },
    });
}

function replyRequest(
    reply: unknown,
    id: string = OUTCOME_ID,
): { req: ReturnType<typeof makeRequest>; ctx: { params: Promise<{ id: string }> } } {
    return {
        req: makeRequest({ method: 'POST', body: { reply } }),
        ctx: { params: Promise.resolve({ id }) },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimited = false;
    serverClient = mockSupabaseClient({ user: USER });
    setup({});
});

afterEach(() => {
    vi.useRealTimers();
});

describe('POST /api/pro/reviews/[id]/reply — gates', () => {
    it('returns 429 when rate limited', async () => {
        rateLimited = true;
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('A perfectly fine reply');
        expect((await POST(req, ctx)).status).toBe(429);
    });

    it('returns 400 for a non-UUID id', async () => {
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('A perfectly fine reply', 'nope');
        expect((await POST(req, ctx)).status).toBe(400);
    });

    it('returns 401 when not signed in', async () => {
        serverClient = mockSupabaseClient({ user: null });
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('A perfectly fine reply');
        expect((await POST(req, ctx)).status).toBe(401);
    });
});

describe('POST /api/pro/reviews/[id]/reply — validation', () => {
    it('rejects replies under 5 characters', async () => {
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('Hi');
        expect((await POST(req, ctx)).status).toBe(400);
    });

    it('rejects replies over 1000 characters', async () => {
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('x'.repeat(1001));
        expect((await POST(req, ctx)).status).toBe(400);
    });

    it('trims before validating length', async () => {
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('   ab   ');
        expect((await POST(req, ctx)).status).toBe(400);
    });
});

describe('POST /api/pro/reviews/[id]/reply — ownership and window', () => {
    it('returns 404 for an unknown outcome', async () => {
        setup({ outcome: null });
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('A perfectly fine reply');
        expect((await POST(req, ctx)).status).toBe(404);
    });

    it('returns 403 when the user does not own the provider', async () => {
        setup({ ownerApp: null });
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('A perfectly fine reply');
        expect((await POST(req, ctx)).status).toBe(403);
    });

    it('allows an edit inside the 24-hour window', async () => {
        setup({
            outcome: {
                id: OUTCOME_ID,
                provider_id: 'prov-1',
                contractor_reply: 'old',
                contractor_reply_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            },
        });
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('An updated reply');
        expect((await POST(req, ctx)).status).toBe(200);
    });

    it('returns 403 once the 24-hour edit window has closed', async () => {
        setup({
            outcome: {
                id: OUTCOME_ID,
                provider_id: 'prov-1',
                contractor_reply: 'old',
                contractor_reply_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
            },
        });
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('Too late now');
        expect((await POST(req, ctx)).status).toBe(403);
    });
});

describe('POST /api/pro/reviews/[id]/reply — persistence', () => {
    it('returns 500 when the update fails', async () => {
        setup({ updateError: true });
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('A perfectly fine reply');
        expect((await POST(req, ctx)).status).toBe(500);
    });

    it('saves a first reply and echoes it back', async () => {
        const { POST } = await import('./route');
        const { req, ctx } = replyRequest('Thanks for the feedback!');
        const res = await POST(req, ctx);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.contractor_reply).toBe('Thanks for the feedback!');
        expect(body.contractor_reply_at).toBeTruthy();
    });
});
