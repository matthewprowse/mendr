/**
 * DOM tests for the provider application edit page
 * (`pro/application/edit/client.tsx`).
 *
 * This token-gated page loads an existing application via
 * GET /api/pro/application/edit?token=... on mount, lets the Pro edit their
 * profile summary and metadata, and POSTs the changes back. It has four render
 * phases: loading, error (no/invalid token), the editable form, and the saved
 * confirmation. The token comes from the query string via useSearchParams.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const searchParamsMock = vi.hoisted(() => ({ value: 'valid-token' }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('next/navigation', () => ({
    useSearchParams: () => ({
        get: (k: string) => (k === 'token' ? searchParamsMock.value : null),
    }),
}));

import ApplicationEditClient from '@/app/pro/application/edit/client';

const payload = {
    applicationId: 'app1',
    contactName: 'Jane Doe',
    businessName: 'Doe Plumbing',
    trade: 'plumbing',
    currentSummary: 'We fix burst pipes fast.',
    geminiSummary: 'AI draft summary.',
    hasEdited: false,
    highlights: '24/7 callout, 12-month warranty',
    specialisations: 'burst pipes, geysers',
    insuranceCover: 'Public liability up to R5m',
    typicalResponseTime: 'within_1h',
    pricingModel: 'Fixed callout, then quoted',
    calloutFee: '450',
    preferredContactChannel: 'whatsapp',
};

beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.value = 'valid-token';
});

describe('ApplicationEditClient', () => {
    it('shows the error state when no token is present', async () => {
        searchParamsMock.value = '';
        render(<ApplicationEditClient />);
        expect(await screen.findByText(/link unavailable/i)).toBeInTheDocument();
        expect(screen.getByText(/no token provided/i)).toBeInTheDocument();
    });

    it('shows the error state when the link is invalid or expired', async () => {
        server.use(
            http.get('/api/pro/application/edit', () =>
                HttpResponse.json({ error: 'This link has expired.' }, { status: 410 }),
            ),
        );
        render(<ApplicationEditClient />);
        expect(await screen.findByText(/link unavailable/i)).toBeInTheDocument();
        expect(screen.getByText(/this link has expired\./i)).toBeInTheDocument();
    });

    it('loads and pre-fills the form with the existing application data', async () => {
        server.use(
            http.get('/api/pro/application/edit', () => HttpResponse.json(payload)),
        );
        render(<ApplicationEditClient />);
        const summary = await screen.findByLabelText(/profile summary/i);
        expect(summary).toHaveValue('We fix burst pipes fast.');
        expect(screen.getByLabelText(/highlights/i)).toHaveValue(
            '24/7 callout, 12-month warranty',
        );
        expect(screen.getByLabelText(/specialisations/i)).toHaveValue('burst pipes, geysers');
        // Greets the Pro by first name.
        expect(screen.getByText(/hi jane\./i)).toBeInTheDocument();
    });

    it('disables Save and submit when the summary is empty', async () => {
        server.use(
            http.get('/api/pro/application/edit', () =>
                HttpResponse.json({ ...payload, currentSummary: '' }),
            ),
        );
        render(<ApplicationEditClient />);
        await screen.findByLabelText(/profile summary/i);
        expect(screen.getByRole('button', { name: /save and submit/i })).toBeDisabled();
    });

    it('saves the edited application and shows the saved confirmation', async () => {
        const captured: { body: { summary?: string; token?: string } | null } = {
            body: null,
        };
        server.use(
            http.get('/api/pro/application/edit', () => HttpResponse.json(payload)),
            http.post('/api/pro/application/edit', async ({ request }) => {
                captured.body = (await request.json()) as {
                    summary?: string;
                    token?: string;
                };
                return HttpResponse.json({ ok: true });
            }),
        );
        const user = userEvent.setup();
        render(<ApplicationEditClient />);
        const summary = await screen.findByLabelText(/profile summary/i);
        await user.clear(summary);
        await user.type(summary, 'Revised summary for homeowners.');
        await user.click(screen.getByRole('button', { name: /save and submit/i }));
        expect(await screen.findByText(/profile saved/i)).toBeInTheDocument();
        expect(captured.body?.summary).toBe('Revised summary for homeowners.');
        expect(captured.body?.token).toBe('valid-token');
    });

    it('shows an error toast when the save fails and stays on the form', async () => {
        server.use(
            http.get('/api/pro/application/edit', () => HttpResponse.json(payload)),
            http.post('/api/pro/application/edit', () =>
                HttpResponse.json({ error: 'Save rejected' }, { status: 400 }),
            ),
        );
        const user = userEvent.setup();
        render(<ApplicationEditClient />);
        await screen.findByLabelText(/profile summary/i);
        await user.click(screen.getByRole('button', { name: /save and submit/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Save rejected'));
        // Still on the form, not the saved screen.
        expect(screen.queryByText(/profile saved/i)).not.toBeInTheDocument();
    });
});
