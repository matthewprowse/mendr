/**
 * DOM tests for the invoice editor (`pro/(portal)/invoices/[id]/client.tsx`).
 *
 * This is the financial path: line items, 15% VAT, draft vs. issued (locked)
 * views, the issue confirmation dialog, and recording payments. We assert on the
 * money math (VAT = 15% of subtotal when VAT-registered) and the API calls the
 * editor makes (PATCH /api/pro/invoices/:id with item/issue/payment bodies).
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import InvoiceEditorClient, {
    type InvoiceEditorData,
} from '@/app/pro/(portal)/invoices/[id]/client';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('sonner', () => ({ toast: toastMock }));

const baseData = (over: Partial<InvoiceEditorData> = {}): InvoiceEditorData => ({
    id: 'inv1',
    number: null,
    status: 'draft',
    issued: false,
    customerName: 'Grace Hopper',
    depositPercent: '0',
    dueDate: '2026-06-30',
    terms: 'Payment within 30 days',
    total: 0,
    amountPaid: 0,
    vatRegistered: true,
    items: [{ description: 'Geyser replacement', qty: '1', unitPrice: '1000' }],
    ...over,
});

/** Strip non-digit characters so currency separators (space/comma) don't matter. */
const digitsOf = (s: string) => s.replace(/\D+/g, '');

beforeEach(() => vi.clearAllMocks());

describe('InvoiceEditorClient — draft view', () => {
    it('renders the draft heading and customer name', () => {
        render(<InvoiceEditorClient data={baseData()} />);
        expect(screen.getByRole('heading', { name: /draft invoice/i })).toBeInTheDocument();
        expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    });

    it('falls back to "No customer linked" when customer is null', () => {
        render(<InvoiceEditorClient data={baseData({ customerName: null })} />);
        expect(screen.getByText(/no customer linked/i)).toBeInTheDocument();
    });

    it('computes VAT as 15% of subtotal and adds it to the total', () => {
        render(
            <InvoiceEditorClient
                data={baseData({
                    items: [{ description: 'Work', qty: '2', unitPrice: '500' }],
                })}
            />,
        );
        // subtotal = 2 * 500 = 1000; VAT = 150; total = 1150.
        const vatRow = screen.getByText(/vat \(15%\)/i).closest('div') as HTMLElement;
        expect(digitsOf(within(vatRow).getAllByText(/R/)[0].textContent ?? '')).toContain('150');

        const totalRow = screen.getByText('Total').closest('div') as HTMLElement;
        // total cell renders 1150.00 -> "115000" after stripping separators+decimals.
        expect(digitsOf(totalRow.textContent ?? '')).toContain('115000');
    });

    it('omits the VAT row when the Pro is not VAT-registered', () => {
        render(<InvoiceEditorClient data={baseData({ vatRegistered: false })} />);
        expect(screen.queryByText(/vat \(15%\)/i)).not.toBeInTheDocument();
    });

    it('appends a new empty line item when "Add Line Item" is clicked', async () => {
        const user = userEvent.setup();
        render(<InvoiceEditorClient data={baseData()} />);
        const before = screen.getAllByPlaceholderText('Description').length;
        await user.click(screen.getByRole('button', { name: /add line item/i }));
        expect(screen.getAllByPlaceholderText('Description')).toHaveLength(before + 1);
    });

    it('removes a line item and recalculates the subtotal', async () => {
        const user = userEvent.setup();
        render(
            <InvoiceEditorClient
                data={baseData({
                    items: [
                        { description: 'A', qty: '1', unitPrice: '100' },
                        { description: 'B', qty: '1', unitPrice: '100' },
                    ],
                })}
            />,
        );
        expect(screen.getAllByPlaceholderText('Description')).toHaveLength(2);
        await user.click(screen.getAllByRole('button', { name: /^remove$/i })[0]);
        expect(screen.getAllByPlaceholderText('Description')).toHaveLength(1);
    });

    it('keeps the last line item when removing (no remove button shown for a single row)', () => {
        render(<InvoiceEditorClient data={baseData()} />);
        expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
    });

    it('saves the draft via PATCH and refreshes', async () => {
        let body: unknown = null;
        server.use(
            http.patch('/api/pro/invoices/inv1', async ({ request }) => {
                body = await request.json();
                return HttpResponse.json({ ok: true });
            }),
        );
        const user = userEvent.setup();
        render(<InvoiceEditorClient data={baseData()} />);
        await user.click(screen.getByRole('button', { name: /save draft/i }));
        await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
        expect(body).toMatchObject({ depositPercent: '0', dueDate: '2026-06-30' });
    });

    it('shows an error toast when the draft save fails', async () => {
        server.use(
            http.patch('/api/pro/invoices/inv1', () =>
                HttpResponse.json({ error: 'Could not save' }, { status: 400 }),
            ),
        );
        const user = userEvent.setup();
        render(<InvoiceEditorClient data={baseData()} />);
        await user.click(screen.getByRole('button', { name: /save draft/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Could not save'));
    });

    it('opens the issue-confirmation dialog and issues the invoice', async () => {
        const calls: string[] = [];
        server.use(
            http.patch('/api/pro/invoices/inv1', async ({ request }) => {
                const json = (await request.json()) as { action?: string };
                calls.push(json.action ?? 'save');
                return HttpResponse.json({ number: 'INV-0007' });
            }),
        );
        const user = userEvent.setup();
        render(<InvoiceEditorClient data={baseData()} />);
        await user.click(screen.getByRole('button', { name: /issue invoice/i }));
        // Dialog appears; confirm.
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: /issue invoice/i }));
        await waitFor(() =>
            expect(toastMock.success).toHaveBeenCalledWith('Invoice INV-0007 issued.'),
        );
        // First call is the implicit save, second is the issue action.
        expect(calls).toContain('issue');
    });

    it('does not issue when the pre-issue save fails', async () => {
        server.use(
            http.patch('/api/pro/invoices/inv1', () =>
                HttpResponse.json({ error: 'Save blew up' }, { status: 500 }),
            ),
        );
        const user = userEvent.setup();
        render(<InvoiceEditorClient data={baseData()} />);
        await user.click(screen.getByRole('button', { name: /issue invoice/i }));
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: /issue invoice/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Save blew up'));
        expect(toastMock.success).not.toHaveBeenCalled();
    });
});

describe('InvoiceEditorClient — issued (locked) view', () => {
    const issued = (over: Partial<InvoiceEditorData> = {}) =>
        baseData({
            issued: true,
            number: 'INV-0001',
            status: 'sent',
            total: 1150,
            amountPaid: 0,
            items: [{ description: 'Geyser replacement', qty: '1', unitPrice: '1000' }],
            ...over,
        });

    it('renders the permanent invoice number and is not editable', () => {
        render(<InvoiceEditorClient data={issued()} />);
        expect(screen.getByRole('heading', { name: 'INV-0001' })).toBeInTheDocument();
        // No editable description inputs in the locked view.
        expect(screen.queryByPlaceholderText('Description')).not.toBeInTheDocument();
    });

    it('shows the View / Print link to the printable invoice', () => {
        render(<InvoiceEditorClient data={issued()} />);
        const link = screen.getByRole('link', { name: /view \/ print/i });
        expect(link).toHaveAttribute('href', '/invoice/inv1');
    });

    it('computes the balance due as total minus amount paid', () => {
        render(<InvoiceEditorClient data={issued({ total: 1150, amountPaid: 150 })} />);
        const balanceRow = screen.getByText(/balance due/i).closest('div') as HTMLElement;
        // 1150 - 150 = 1000 -> "100000" after decimals.
        expect(digitsOf(balanceRow.textContent ?? '')).toContain('100000');
    });

    it('records a payment via the PATCH payment action', async () => {
        let body: { action?: string; amount?: number } | null = null;
        server.use(
            http.patch('/api/pro/invoices/inv1', async ({ request }) => {
                body = (await request.json()) as { action?: string; amount?: number };
                return HttpResponse.json({ ok: true });
            }),
        );
        const user = userEvent.setup();
        render(<InvoiceEditorClient data={issued()} />);
        await user.click(screen.getByRole('button', { name: /record payment/i }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText(/amount/i), '500');
        await user.click(within(dialog).getByRole('button', { name: /record payment/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Payment recorded.'));
        expect(body).toEqual({ action: 'payment', amount: 500 });
    });

    it('rejects a non-positive payment amount before calling the API', async () => {
        const user = userEvent.setup();
        render(<InvoiceEditorClient data={issued()} />);
        await user.click(screen.getByRole('button', { name: /record payment/i }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText(/amount/i), '0');
        await user.click(within(dialog).getByRole('button', { name: /record payment/i }));
        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Enter a positive amount.'),
        );
    });

    it('hides the Record Payment button when the invoice is already paid', () => {
        render(<InvoiceEditorClient data={issued({ status: 'paid' })} />);
        expect(
            screen.queryByRole('button', { name: /record payment/i }),
        ).not.toBeInTheDocument();
    });
});
