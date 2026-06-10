/**
 * DOM tests for the quote editor (`pro/(portal)/quotes/[id]/client.tsx`).
 *
 * Mirrors the invoice editor: line item management, 15% VAT math, save + status
 * transitions (Sent / Accepted / Declined), and converting an accepted quote into
 * an invoice. Status changes PATCH /api/pro/quotes/:id with a `status` field;
 * conversion POSTs /api/pro/invoices and navigates to the new invoice.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import QuoteEditorClient, {
    type QuoteEditorData,
} from '@/app/pro/(portal)/quotes/[id]/client';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('sonner', () => ({ toast: toastMock }));

const baseData = (over: Partial<QuoteEditorData> = {}): QuoteEditorData => ({
    id: 'q1',
    number: 'Q-0001',
    status: 'draft',
    customerName: 'Ada Lovelace',
    depositPercent: '10',
    validUntil: '2026-07-01',
    terms: 'Valid for 30 days',
    vatRegistered: true,
    items: [{ description: 'Pipe repair', qty: '1', unitPrice: '800' }],
    ...over,
});

const digitsOf = (s: string) => s.replace(/\D+/g, '');

beforeEach(() => vi.clearAllMocks());

describe('QuoteEditorClient', () => {
    it('renders the quote number, status label and customer name', () => {
        render(<QuoteEditorClient data={baseData()} />);
        expect(screen.getByRole('heading', { name: /quote q-0001/i })).toBeInTheDocument();
        expect(screen.getByText(/draft · ada lovelace/i)).toBeInTheDocument();
    });

    it('computes VAT as 15% of subtotal', () => {
        render(
            <QuoteEditorClient
                data={baseData({ items: [{ description: 'X', qty: '1', unitPrice: '1000' }] })}
            />,
        );
        const vatRow = screen.getByText(/vat \(15%\)/i).closest('div') as HTMLElement;
        // 1000 * 0.15 = 150.
        expect(digitsOf(vatRow.textContent ?? '')).toContain('150');
    });

    it('omits the VAT row for a non-VAT-registered Pro', () => {
        render(<QuoteEditorClient data={baseData({ vatRegistered: false })} />);
        expect(screen.queryByText(/vat \(15%\)/i)).not.toBeInTheDocument();
    });

    it('adds a new line item row', async () => {
        const user = userEvent.setup();
        render(<QuoteEditorClient data={baseData()} />);
        const before = screen.getAllByPlaceholderText('Description').length;
        await user.click(screen.getByRole('button', { name: /add item/i }));
        expect(screen.getAllByPlaceholderText('Description')).toHaveLength(before + 1);
    });

    it('removes a line item row', async () => {
        const user = userEvent.setup();
        render(
            <QuoteEditorClient
                data={baseData({
                    items: [
                        { description: 'A', qty: '1', unitPrice: '100' },
                        { description: 'B', qty: '1', unitPrice: '200' },
                    ],
                })}
            />,
        );
        expect(screen.getAllByPlaceholderText('Description')).toHaveLength(2);
        await user.click(screen.getAllByRole('button', { name: /remove item/i })[0]);
        expect(screen.getAllByPlaceholderText('Description')).toHaveLength(1);
    });

    it('saves the quote via PATCH and shows a success toast', async () => {
        const captured: { body: { status?: string } | null } = { body: null };
        server.use(
            http.patch('/api/pro/quotes/q1', async ({ request }) => {
                captured.body = (await request.json()) as { status?: string };
                return HttpResponse.json({ ok: true });
            }),
        );
        const user = userEvent.setup();
        render(<QuoteEditorClient data={baseData()} />);
        await user.click(screen.getByRole('button', { name: /^save$/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Quote saved.'));
        expect(captured.body?.status).toBeUndefined();
    });

    it('marks the quote as sent', async () => {
        const captured: { body: { status?: string } | null } = { body: null };
        server.use(
            http.patch('/api/pro/quotes/q1', async ({ request }) => {
                captured.body = (await request.json()) as { status?: string };
                return HttpResponse.json({ ok: true });
            }),
        );
        const user = userEvent.setup();
        render(<QuoteEditorClient data={baseData()} />);
        await user.click(screen.getByRole('button', { name: /mark as sent/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Quote updated.'));
        expect(captured.body?.status).toBe('sent');
    });

    it('shows an error toast when the save fails', async () => {
        server.use(
            http.patch('/api/pro/quotes/q1', () => HttpResponse.json({}, { status: 500 })),
        );
        const user = userEvent.setup();
        render(<QuoteEditorClient data={baseData()} />);
        await user.click(screen.getByRole('button', { name: /^save$/i }));
        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Could not save. Please try again.'),
        );
    });

    it('shows the Create Invoice action only once the quote is accepted', async () => {
        server.use(
            http.patch('/api/pro/quotes/q1', () => HttpResponse.json({ ok: true })),
        );
        const user = userEvent.setup();
        render(<QuoteEditorClient data={baseData()} />);
        // Not visible in draft state.
        expect(
            screen.queryByRole('button', { name: /create invoice from quote/i }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /^accepted$/i }));
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: /create invoice from quote/i }),
            ).toBeInTheDocument(),
        );
    });

    it('creates an invoice from an accepted quote and navigates to it', async () => {
        let invoiceBody: { quoteId?: string } | null = null;
        server.use(
            http.post('/api/pro/invoices', async ({ request }) => {
                invoiceBody = (await request.json()) as { quoteId?: string };
                return HttpResponse.json({ id: 'inv-new' });
            }),
        );
        const user = userEvent.setup();
        render(<QuoteEditorClient data={baseData({ status: 'accepted' })} />);
        await user.click(screen.getByRole('button', { name: /create invoice from quote/i }));
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/pro/invoices/inv-new'));
        expect(invoiceBody).toEqual({ quoteId: 'q1' });
    });

    it('shows an error toast when invoice creation fails', async () => {
        server.use(
            http.post('/api/pro/invoices', () =>
                HttpResponse.json({ error: 'Quote not accepted' }, { status: 409 }),
            ),
        );
        const user = userEvent.setup();
        render(<QuoteEditorClient data={baseData({ status: 'accepted' })} />);
        await user.click(screen.getByRole('button', { name: /create invoice from quote/i }));
        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Quote not accepted'),
        );
    });

    it('exposes a link to the printable quote', () => {
        render(<QuoteEditorClient data={baseData()} />);
        expect(screen.getByRole('link', { name: /open printable quote/i })).toHaveAttribute(
            'href',
            '/quote/q1',
        );
    });
});
