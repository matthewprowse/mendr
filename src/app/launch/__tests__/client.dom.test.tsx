/**
 * Behavior tests for the `ComingSoonClient` "Card 4" surface — the only
 * production consumer of `/api/contact` (general-question variant) and
 * `/api/beta-access`.
 *
 * The component embeds two forms on the same page:
 *   1. The contact form (name + email + message → /api/contact).
 *   2. The early-access code form (single password input → /api/beta-access).
 *
 * Pinned behaviors:
 *   • Contact form keeps submit disabled until all required fields are filled.
 *   • Successful contact POST swaps the form for the success state ("...").
 *   • Beta-access success redirects to "/" (we assert location.href is set).
 *   • Beta-access failure shows "Incorrect code." and clears the input.
 *   • Beta-access submit is disabled while the input is empty.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ComingSoonClient } from '@/app/coming-soon/client';
import { server } from '@/__tests__/msw/server';

// Mock next/navigation so we can assert router-driven redirects without
// needing a real Next runtime. As of 2026-05-23 the beta-access success path
// uses `router.push('/')` (was `window.location.href = '/'`) so the test
// asserts the router call, not a window.location mutation.
const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: routerPush, refresh: routerRefresh, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));
afterEach(() => {
    routerPush.mockReset();
    routerRefresh.mockReset();
});

describe('ComingSoonClient — contact form', () => {
    it('submit stays disabled until name + email + message are populated', async () => {
        const user = userEvent.setup();
        render(<ComingSoonClient />);

        const submit = screen.getByRole('button', { name: /send message/i });
        expect(submit).toBeDisabled();

        await user.type(screen.getByPlaceholderText(/full name/i), 'Ada');
        await user.type(screen.getByPlaceholderText(/email address/i), 'ada@example.com');
        expect(submit).toBeDisabled();

        await user.type(screen.getByPlaceholderText(/^message$/i), 'Question');
        expect(submit).toBeEnabled();
    });

    it('renders the post-submit success state', async () => {
        const user = userEvent.setup();
        let postedBody: unknown = null;
        server.use(
            http.post('/api/contact', async ({ request }) => {
                postedBody = await request.json();
                return HttpResponse.json({ ok: true }, { status: 200 });
            }),
        );

        render(<ComingSoonClient />);
        await user.type(screen.getByPlaceholderText(/full name/i), 'Ada');
        await user.type(screen.getByPlaceholderText(/email address/i), 'ada@example.com');
        await user.type(screen.getByPlaceholderText(/^message$/i), 'Hi');
        await user.click(screen.getByRole('button', { name: /send message/i }));

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument();
        });
        expect(postedBody).toMatchObject({
            name: 'Ada',
            email: 'ada@example.com',
            message: 'Hi',
            subject: 'General question',
        });
    });

    it('renders the server error message when /api/contact returns an error', async () => {
        const user = userEvent.setup();
        server.use(
            http.post('/api/contact', () =>
                HttpResponse.json({ error: 'Too many requests' }, { status: 429 }),
            ),
        );

        render(<ComingSoonClient />);
        await user.type(screen.getByPlaceholderText(/full name/i), 'Ada');
        await user.type(screen.getByPlaceholderText(/email address/i), 'ada@example.com');
        await user.type(screen.getByPlaceholderText(/^message$/i), 'Hi');
        await user.click(screen.getByRole('button', { name: /send message/i }));

        expect(await screen.findByText(/too many requests/i)).toBeInTheDocument();
        // The form stays — no success state.
        expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
    });
});

describe('ComingSoonClient — beta-access form', () => {
    it('submit is disabled while the code is empty', () => {
        render(<ComingSoonClient />);
        expect(screen.getByRole('button', { name: /^continue$/i })).toBeDisabled();
    });

    it('redirects to / on a 200 from /api/beta-access', async () => {
        const user = userEvent.setup();
        server.use(http.post('/api/beta-access', () => HttpResponse.json({ ok: true })));

        render(<ComingSoonClient />);
        await user.type(screen.getByPlaceholderText(/early access code/i), 'sekret');
        await user.click(screen.getByRole('button', { name: /^continue$/i }));

        await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/'));
        expect(routerRefresh).toHaveBeenCalled();
    });

    it('shows "Incorrect code." and clears the field on a 401', async () => {
        const user = userEvent.setup();
        server.use(
            http.post('/api/beta-access', () => HttpResponse.json({ ok: false }, { status: 401 })),
        );

        render(<ComingSoonClient />);
        const code = screen.getByPlaceholderText(/early access code/i) as HTMLInputElement;
        await user.type(code, 'wrong');
        await user.click(screen.getByRole('button', { name: /^continue$/i }));

        expect(await screen.findByText(/incorrect code\./i)).toBeInTheDocument();
        expect(code.value).toBe('');
    });

    it('handles network errors with a generic try-again message', async () => {
        const user = userEvent.setup();
        server.use(http.post('/api/beta-access', () => HttpResponse.error()));

        render(<ComingSoonClient />);
        await user.type(screen.getByPlaceholderText(/early access code/i), 'sekret');
        await user.click(screen.getByRole('button', { name: /^continue$/i }));

        expect(await screen.findByText(/something went wrong\. please try again\./i)).toBeInTheDocument();
    });
});
