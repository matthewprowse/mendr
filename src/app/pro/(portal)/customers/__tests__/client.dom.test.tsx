import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import CustomersClient, { type CustomerRow } from '@/app/pro/(portal)/customers/client';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const row = (over: Partial<CustomerRow> = {}): CustomerRow => ({
    id: 'c1',
    name: 'Ada Lovelace',
    phone: '082 000 0000',
    email: 'ada@x.co',
    address: '1 Main Rd',
    created_at: '2026-05-01T00:00:00Z',
    ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('CustomersClient', () => {
    it('renders the empty state', () => {
        render(<CustomersClient customers={[]} />);
        expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
    });

    it('renders a customer with contact meta', () => {
        render(<CustomersClient customers={[row()]} />);
        expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
        expect(screen.getByText(/082 000 0000 · ada@x\.co/)).toBeInTheDocument();
    });

    it('adds a customer through the dialog and prepends it', async () => {
        server.use(
            http.post('/api/pro/customers', () =>
                HttpResponse.json({ customer: row({ id: 'c-new', name: 'Grace Hopper' }) }),
            ),
        );
        const user = userEvent.setup();
        render(<CustomersClient customers={[]} />);
        await user.click(screen.getByRole('button', { name: /^add$/i }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText(/name/i), 'Grace Hopper');
        await user.click(within(dialog).getByRole('button', { name: /add customer/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Customer added.'));
        expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    });

    it('toasts when adding a customer fails', async () => {
        server.use(http.post('/api/pro/customers', () => HttpResponse.json({ error: 'bad' }, { status: 400 })));
        const user = userEvent.setup();
        render(<CustomersClient customers={[]} />);
        await user.click(screen.getByRole('button', { name: /^add$/i }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText(/name/i), 'X');
        await user.click(within(dialog).getByRole('button', { name: /add customer/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('bad'));
    });
});
