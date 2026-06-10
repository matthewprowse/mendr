import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import TeamClient, { type TeamMember } from '@/app/pro/(portal)/team/client';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const owner: TeamMember = { id: 'm-owner', role: 'owner', status: 'active', isYou: true, name: 'You', email: null };
const mate: TeamMember = { id: 'm-2', role: 'member', status: 'active', isYou: false, name: 'Pat', email: 'pat@x.co' };

beforeEach(() => vi.clearAllMocks());

describe('TeamClient', () => {
    it('renders the roster with role labels', () => {
        render(<TeamClient members={[owner, mate]} role="owner" />);
        expect(screen.getByText(/You \(You\)/)).toBeInTheDocument();
        expect(screen.getByText('Pat')).toBeInTheDocument();
    });

    it('hides the Invite button for plain members', () => {
        render(<TeamClient members={[owner, mate]} role="member" />);
        expect(screen.queryByRole('button', { name: /^invite$/i })).not.toBeInTheDocument();
    });

    it('invites a teammate and appends the row', async () => {
        server.use(
            http.post('/api/pro/members', () => HttpResponse.json({ member: { id: 'm-3', status: 'invited' }, linked: false })),
        );
        const user = userEvent.setup();
        render(<TeamClient members={[owner]} role="owner" />);
        await user.click(screen.getByRole('button', { name: /^invite$/i }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText(/email/i), 'new@x.co');
        await user.click(within(dialog).getByRole('button', { name: /send invite/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Invite sent.'));
        expect(screen.getByText('new@x.co')).toBeInTheDocument();
    });

    it('surfaces an invite error as a toast', async () => {
        server.use(
            http.post('/api/pro/members', () => HttpResponse.json({ error: 'Seat limit reached.' }, { status: 409 })),
        );
        const user = userEvent.setup();
        render(<TeamClient members={[owner]} role="owner" />);
        await user.click(screen.getByRole('button', { name: /^invite$/i }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText(/email/i), 'new@x.co');
        await user.click(within(dialog).getByRole('button', { name: /send invite/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Seat limit reached.'));
    });

    it('removes a teammate', async () => {
        server.use(http.delete('/api/pro/members/m-2', () => HttpResponse.json({ ok: true })));
        const user = userEvent.setup();
        render(<TeamClient members={[owner, mate]} role="owner" />);
        await user.click(screen.getByRole('button', { name: /remove/i }));
        await waitFor(() => expect(screen.queryByText('Pat')).not.toBeInTheDocument());
        expect(toastMock.success).toHaveBeenCalledWith('Teammate removed.');
    });
});
