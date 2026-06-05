import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import LeadsClient, { type LeadRow } from '@/app/pro/(portal)/leads/client';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const row = (over: Partial<LeadRow> = {}): LeadRow => ({
    id: 'l1',
    createdAt: '2026-05-01T00:00:00Z',
    channel: 'whatsapp',
    trade: 'plumbing',
    title: 'Leaking geyser',
    suburb: 'Newlands',
    status: 'new',
    contact: '082 000 0000',
    ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('LeadsClient', () => {
    it('renders the empty state', () => {
        render(<LeadsClient rows={[]} />);
        expect(screen.getByText(/no leads yet/i)).toBeInTheDocument();
    });

    it('renders a lead with its title and meta', () => {
        render(<LeadsClient rows={[row()]} />);
        expect(screen.getByText('Leaking geyser')).toBeInTheDocument();
        expect(screen.getByText(/Plumbing · Newlands · WhatsApp/)).toBeInTheDocument();
    });

    it('updates the status optimistically via the select', async () => {
        server.use(http.patch('/api/pro/leads/l1', () => HttpResponse.json({ ok: true, status: 'won' })));
        const user = userEvent.setup();
        render(<LeadsClient rows={[row()]} />);
        await user.click(screen.getByRole('combobox'));
        await user.click(await screen.findByRole('option', { name: 'Won' }));
        await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Won'));
        expect(toastMock.error).not.toHaveBeenCalled();
    });

    it('rolls back and toasts when the update fails', async () => {
        server.use(http.patch('/api/pro/leads/l1', () => HttpResponse.json({ error: 'x' }, { status: 500 })));
        const user = userEvent.setup();
        render(<LeadsClient rows={[row({ status: 'new' })]} />);
        await user.click(screen.getByRole('combobox'));
        await user.click(await screen.findByRole('option', { name: 'Lost' }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
        expect(screen.getByRole('combobox')).toHaveTextContent('New');
    });
});
