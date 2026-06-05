import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import JobsClient, { type JobRow } from '@/app/pro/(portal)/jobs/client';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const row = (over: Partial<JobRow> = {}): JobRow => ({
    id: 'j1',
    title: 'Fix tap',
    siteAddress: 'Sea Point',
    status: 'scheduled',
    scheduledFor: null,
    customerName: 'Ada',
    ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('JobsClient', () => {
    it('renders the empty state', () => {
        render(<JobsClient rows={[]} />);
        expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument();
    });

    it('renders a job with status label', () => {
        render(<JobsClient rows={[row({ status: 'in_progress' })]} />);
        expect(screen.getByText('Fix tap')).toBeInTheDocument();
        expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('adds a job through the dialog and prepends it', async () => {
        server.use(
            http.post('/api/pro/jobs', () =>
                HttpResponse.json({ job: { id: 'j-new', title: 'New job', site_address: null, status: 'scheduled', scheduled_for: null } }),
            ),
        );
        const user = userEvent.setup();
        render(<JobsClient rows={[]} />);
        await user.click(screen.getByRole('button', { name: /^add$/i }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText(/title/i), 'New job');
        await user.click(within(dialog).getByRole('button', { name: /add job/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Job created.'));
        expect(screen.getByText('New job')).toBeInTheDocument();
    });

    it('toasts when adding a job fails', async () => {
        server.use(http.post('/api/pro/jobs', () => HttpResponse.json({ error: 'bad' }, { status: 400 })));
        const user = userEvent.setup();
        render(<JobsClient rows={[]} />);
        await user.click(screen.getByRole('button', { name: /^add$/i }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText(/title/i), 'X');
        await user.click(within(dialog).getByRole('button', { name: /add job/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('bad'));
    });
});
