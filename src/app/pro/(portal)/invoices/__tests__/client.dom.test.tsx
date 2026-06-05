import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import InvoicesClient, { type InvoiceRow } from '@/app/pro/(portal)/invoices/client';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('sonner', () => ({ toast: toastMock }));

const row = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
    id: 'inv1',
    number: 'INV-0001',
    status: 'sent',
    total: 2300,
    amountPaid: 0,
    customerName: 'Grace Hopper',
    createdAt: '2026-05-01T00:00:00Z',
    ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('InvoicesClient', () => {
    it('renders the empty state when there are no invoices', () => {
        render(<InvoicesClient rows={[]} />);
        expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument();
    });

    it('renders an invoice row and falls back to Draft for an unissued number', () => {
        render(<InvoicesClient rows={[row({ number: null, status: 'draft' })]} />);
        expect(screen.getByText(/Draft · Grace Hopper/)).toBeInTheDocument();
    });

    it('creates an invoice and navigates to it', async () => {
        server.use(http.post('/api/pro/invoices', () => HttpResponse.json({ id: 'inv-new' })));
        const user = userEvent.setup();
        render(<InvoicesClient rows={[]} />);
        await user.click(screen.getByRole('button', { name: /new invoice/i }));
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/pro/invoices/inv-new'));
    });

    it('shows an error toast when creation fails', async () => {
        server.use(http.post('/api/pro/invoices', () => HttpResponse.json({ error: 'denied' }, { status: 403 })));
        const user = userEvent.setup();
        render(<InvoicesClient rows={[]} />);
        await user.click(screen.getByRole('button', { name: /new invoice/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('denied'));
    });
});
