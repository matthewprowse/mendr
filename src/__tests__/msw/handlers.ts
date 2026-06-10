/**
 * Default MSW handler set for jsdom component tests.
 *
 * Each handler returns the minimum "happy path" response the UI needs to
 * progress past the network step. Individual tests override these via
 * `server.use(...)` to exercise error states, validation failures, etc.
 */

import { http, HttpResponse } from 'msw';

export const handlers = [
    // Contact form (homeowner + contractor variants share path namespace).
    http.post('/api/contact', async ({ request }) => {
        // Best-effort body parse — kept loose so tests don't have to match exact bodies.
        await request.json().catch(() => null);
        return HttpResponse.json({ ok: true }, { status: 200 });
    }),

    // Contractor waitlist (legacy intake, writes into provider_applications).
    http.post('/api/waitlist', async ({ request }) => {
        await request.json().catch(() => null);
        return HttpResponse.json({ ok: true }, { status: 200 });
    }),

    // Beta-access password gate.
    http.post('/api/beta-access', async () => {
        return HttpResponse.json({ ok: true }, { status: 200 });
    }),

    // Contractor application submission.
    http.post('/api/providers/apply', async ({ request }) => {
        await request.json().catch(() => null);
        return HttpResponse.json({ ok: true, id: 'app_test_123' }, { status: 200 });
    }),

    // Existing-application lookup the Pro-onboard page hits on mount.
    http.get('/api/providers/application-session', () => {
        return HttpResponse.json({ application: null }, { status: 200 });
    }),

    // Catch-all for any Supabase auth endpoint hit indirectly.
    http.post('https://*.supabase.co/auth/v1/*', async () => {
        return HttpResponse.json({}, { status: 200 });
    }),
];
