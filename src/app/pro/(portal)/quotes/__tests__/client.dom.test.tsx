import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import QuotesClient, { type QuoteRow } from '@/app/pro/(portal)/quotes/client';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('sonner', () => ({ toast: toastMock }));

const row = (over: Partial<QuoteRow> = {}): QuoteRow => ({
    id: 'q1',
    number: 'Q-0001',
    status: 'draft',
    total: 1500,
    customerName: 'Ada Lovelace',
    createdAt: '2026-05-01T00:00:00Z',
    ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('QuotesClient', () => {
    it('renders the empty state when there are no quotes', () => {
        render(<QuotesClient rows={[]} />);
        expect(screen.getByText(/no quotes yet/i)).toBeInTheDocument();
    });

    it('renders a quote row with number and customer', () => {
        render(<QuotesClient rows={[row()]} />);
        expect(screen.getByText(/Q-0001 · Ada Lovelace/)).toBeInTheDocument();
    });

    it('creates a quote and navigates to it', async () => {
        server.use(http.post('/api/pro/quotes', () => HttpResponse.json({ id: 'q-new' })));
        const user = userEvent.setup();
        render(<QuotesClient rows={[]} />);
        await user.click(screen.getByRole('button', { name: /new quote/i }));
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/pro/quotes/q-new'));
    });

    it('shows an error toast when creation fails', async () => {
        server.use(http.post('/api/pro/quotes', () => HttpResponse.json({ error: 'nope' }, { status: 500 })));
        const user = userEvent.setup();
        render(<QuotesClient rows={[]} />);
        await user.click(screen.getByRole('button', { name: /new quote/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('nope'));
        expect(nav.push).not.toHaveBeenCalled();
    });
});
