/**
 * Contract tests for /api/cron/feature-announcement.
 *
 * Covers: cron auth, the no-pending-announcement short circuit, dryRun
 * counting (no sends, no email_sent_at stamp), opt-out and suppression
 * filtering, send-failure accounting, and the idempotency stamp on a real
 * run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let cronAuthorized = true;

const sendMendrEmail = vi.fn();
const listUsers = vi.fn();
const announcementUpdates: unknown[] = [];

vi.mock('@/lib/auth/cron-auth', () => ({
    isAuthorizedCronRequest: vi.fn(() => cronAuthorized),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

vi.mock('@/lib/email', () => ({
    sendMendrEmail: (...args: unknown[]) => sendMendrEmail(...(args as [])),
    generateUnsubscribeUrl: vi.fn((email: string) => `https://mendr.test/unsub?e=${email}`),
}));

vi.mock('@/lib/email/templates/feature-announcement', () => ({
    FeatureAnnouncementEmail: () => null,
    featureAnnouncementText: vi.fn(() => 'plain text'),
}));

vi.mock('@/lib/site-url', () => ({
    getSiteUrl: vi.fn(() => 'https://mendr.test'),
}));

const ANNOUNCEMENT = {
    id: 'ann-1',
    slug: 'new-cost-estimates',
    title: 'Cost estimates',
    summary: 'See likely repair costs.',
};

function setup(opts: {
    announcement?: typeof ANNOUNCEMENT | null;
    optOuts?: { user_id: string }[];
    suppressions?: { email: string }[];
    users?: { id: string; email?: string }[];
}): void {
    announcementUpdates.length = 0;
    supabase = mockSupabaseClient({
        tables: {
            feature_announcements: (_t, op) => {
                if (op === 'update') {
                    announcementUpdates.push('stamped');
                    return { data: null, error: null };
                }
                return {
                    data: opts.announcement === undefined ? ANNOUNCEMENT : opts.announcement,
                    error: null,
                };
            },
            notification_preferences: { data: opts.optOuts ?? [], error: null },
            email_suppressions: { data: opts.suppressions ?? [], error: null },
        },
    });
    // The route iterates accounts via the GoTrue admin API, which the shared
    // mock does not model — graft it on.
    (supabase as unknown as { auth: Record<string, unknown> }).auth = {
        ...(supabase as unknown as { auth: Record<string, unknown> }).auth,
        admin: { listUsers },
    };
    listUsers.mockResolvedValue({
        data: { users: opts.users ?? [] },
        error: null,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    cronAuthorized = true;
    sendMendrEmail.mockResolvedValue({ ok: true });
    setup({ users: [{ id: 'u1', email: 'one@example.com' }] });
});

describe('cron/feature-announcement — gates and short circuits', () => {
    it('returns 401 without the cron secret', async () => {
        cronAuthorized = false;
        const { GET } = await import('./route');
        expect((await GET(makeRequest({}))).status).toBe(401);
    });

    it('returns sent: 0 when no announcement is pending', async () => {
        setup({ announcement: null });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({}));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.sent).toBe(0);
        expect(sendMendrEmail).not.toHaveBeenCalled();
    });
});

describe('cron/feature-announcement — dryRun', () => {
    it('counts recipients without sending or stamping', async () => {
        setup({
            users: [
                { id: 'u1', email: 'one@example.com' },
                { id: 'u2', email: 'two@example.com' },
            ],
        });
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/cron/feature-announcement?dryRun=true' }),
        );
        const body = await res.json();
        expect(body).toMatchObject({ dryRun: true, sent: 2, skipped: 0 });
        expect(sendMendrEmail).not.toHaveBeenCalled();
        expect(announcementUpdates).toHaveLength(0);
    });
});

describe('cron/feature-announcement — filtering and sending', () => {
    it('skips opted-out users and suppressed emails', async () => {
        setup({
            users: [
                { id: 'u1', email: 'optout@example.com' },
                { id: 'u2', email: 'suppressed@example.com' },
                { id: 'u3', email: 'ok@example.com' },
                { id: 'u4' }, // no email
            ],
            optOuts: [{ user_id: 'u1' }],
            suppressions: [{ email: 'Suppressed@Example.com ' }],
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST' }));
        const body = await res.json();
        expect(body.sent).toBe(1);
        expect(body.skipped).toBe(3);
        expect(sendMendrEmail).toHaveBeenCalledTimes(1);
        expect(sendMendrEmail.mock.calls[0][0]).toMatchObject({
            to: { email: 'ok@example.com' },
        });
    });

    it('counts send failures as skipped, not sent', async () => {
        sendMendrEmail.mockResolvedValue({ ok: false, error: 'bounce' });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST' }));
        const body = await res.json();
        expect(body.sent).toBe(0);
        expect(body.skipped).toBe(1);
    });

    it('stamps email_sent_at after a real run (idempotency)', async () => {
        const { POST } = await import('./route');
        await POST(makeRequest({ method: 'POST' }));
        expect(announcementUpdates).toHaveLength(1);
    });
});
