import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import ClaimClient from '@/app/pro/(portal)/claim/client';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('sonner', () => ({ toast: toastMock }));

beforeEach(() => vi.clearAllMocks());

describe('ClaimClient', () => {
    it('renders the search heading and input', () => {
        render(<ClaimClient />);
        expect(screen.getByRole('heading', { name: /claim your business/i })).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/search your business name/i)).toBeInTheDocument();
    });

    it('searches after typing and renders results', async () => {
        server.use(
            http.get('/api/pro/providers/search', () =>
                HttpResponse.json({ providers: [{ id: 'p1', name: 'Acme Plumbing', address: '1 Main Rd', leads: 2 }] }),
            ),
        );
        const user = userEvent.setup();
        render(<ClaimClient />);
        await user.type(screen.getByPlaceholderText(/search your business name/i), 'acme');
        expect(await screen.findByText('Acme Plumbing')).toBeInTheDocument();
        expect(screen.getByText(/2 leads waiting/i)).toBeInTheDocument();
    });

    it('shows the no-results message when nothing matches', async () => {
        server.use(http.get('/api/pro/providers/search', () => HttpResponse.json({ providers: [] })));
        const user = userEvent.setup();
        render(<ClaimClient />);
        await user.type(screen.getByPlaceholderText(/search your business name/i), 'zzz');
        expect(await screen.findByText(/no unclaimed businesses match/i)).toBeInTheDocument();
    });

    it('submits a claim and routes home on success', async () => {
        server.use(
            http.get('/api/pro/providers/search', () =>
                HttpResponse.json({ providers: [{ id: 'p1', name: 'Acme Plumbing', address: '', leads: 0 }] }),
            ),
            http.post('/api/pro/claim', () => HttpResponse.json({ ok: true, status: 'pending' })),
        );
        const user = userEvent.setup();
        render(<ClaimClient />);
        await user.type(screen.getByPlaceholderText(/search your business name/i), 'acme');
        await screen.findByText('Acme Plumbing');
        await user.click(screen.getByRole('button', { name: /^claim$/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Claim submitted for review.'));
        expect(nav.push).toHaveBeenCalledWith('/pro/home');
    });

    it('shows an error toast when the claim is rejected', async () => {
        server.use(
            http.get('/api/pro/providers/search', () =>
                HttpResponse.json({ providers: [{ id: 'p1', name: 'Acme Plumbing', address: '', leads: 0 }] }),
            ),
            http.post('/api/pro/claim', () => HttpResponse.json({ error: 'Already claimed.' }, { status: 409 })),
        );
        const user = userEvent.setup();
        render(<ClaimClient />);
        await user.type(screen.getByPlaceholderText(/search your business name/i), 'acme');
        await screen.findByText('Acme Plumbing');
        await user.click(screen.getByRole('button', { name: /^claim$/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Already claimed.'));
    });
});
