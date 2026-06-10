/**
 * DOM tests for the job detail page (`pro/(portal)/jobs/[id]/client.tsx`).
 *
 * Renders an editable job: title, site address, scheduled date, and a status
 * select. Saving PATCHes /api/pro/jobs/:id with snake_case fields; status changes
 * PATCH with `{ status }` and optimistically roll back on failure. A link back to
 * the originating lead is shown when one is linked.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import JobDetailClient, { type JobDetail } from '@/app/pro/(portal)/jobs/[id]/client';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const detail = (over: Partial<JobDetail> = {}): JobDetail => ({
    id: 'job1',
    title: 'Geyser install',
    siteAddress: '12 Main Rd, Claremont',
    status: 'scheduled',
    scheduledDate: '2026-06-15',
    customerName: 'Alan Turing',
    contactEventId: 'lead9',
    ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('JobDetailClient', () => {
    it('renders the job title and customer name', () => {
        render(<JobDetailClient detail={detail()} />);
        expect(screen.getByRole('heading', { name: /geyser install/i })).toBeInTheDocument();
        expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    });

    it('falls back to "Job" when the title is empty', () => {
        render(<JobDetailClient detail={detail({ title: '' })} />);
        expect(screen.getByRole('heading', { name: /^job$/i })).toBeInTheDocument();
    });

    it('pre-fills the title and site-address fields', () => {
        render(<JobDetailClient detail={detail()} />);
        expect(screen.getByLabelText(/^title$/i)).toHaveValue('Geyser install');
        expect(screen.getByLabelText(/site address/i)).toHaveValue('12 Main Rd, Claremont');
    });

    it('disables Save until a field is edited', () => {
        render(<JobDetailClient detail={detail()} />);
        expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    });

    it('saves edited fields via PATCH using snake_case keys', async () => {
        let body: Record<string, unknown> | null = null;
        server.use(
            http.patch('/api/pro/jobs/job1', async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ ok: true });
            }),
        );
        const user = userEvent.setup();
        render(<JobDetailClient detail={detail()} />);
        const title = screen.getByLabelText(/^title$/i);
        await user.clear(title);
        await user.type(title, 'Geyser install (rev 2)');
        await user.click(screen.getByRole('button', { name: /^save$/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Job saved.'));
        expect(body).toMatchObject({
            title: 'Geyser install (rev 2)',
            site_address: '12 Main Rd, Claremont',
            scheduled_for: '2026-06-15',
        });
    });

    it('shows an error toast when the save fails', async () => {
        server.use(
            http.patch('/api/pro/jobs/job1', () => HttpResponse.json({}, { status: 500 })),
        );
        const user = userEvent.setup();
        render(<JobDetailClient detail={detail()} />);
        const addr = screen.getByLabelText(/site address/i);
        await user.type(addr, ' Unit 4');
        await user.click(screen.getByRole('button', { name: /^save$/i }));
        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Could not save. Please try again.'),
        );
    });

    it('updates the status via a PATCH with the status field', async () => {
        let body: { status?: string } | null = null;
        server.use(
            http.patch('/api/pro/jobs/job1', async ({ request }) => {
                body = (await request.json()) as { status?: string };
                return HttpResponse.json({ ok: true });
            }),
        );
        const user = userEvent.setup();
        render(<JobDetailClient detail={detail()} />);
        await user.click(screen.getByLabelText(/^status$/i));
        await user.click(await screen.findByRole('option', { name: /completed/i }));
        await waitFor(() => expect(body?.status).toBe('completed'));
    });

    it('rolls back the status and toasts when the status update fails', async () => {
        server.use(
            http.patch('/api/pro/jobs/job1', () => HttpResponse.json({}, { status: 500 })),
        );
        const user = userEvent.setup();
        render(<JobDetailClient detail={detail()} />);
        await user.click(screen.getByLabelText(/^status$/i));
        await user.click(await screen.findByRole('option', { name: /in progress/i }));
        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Could not update status.'),
        );
    });

    it('links back to the original lead when one is linked', () => {
        render(<JobDetailClient detail={detail()} />);
        expect(screen.getByRole('link', { name: /view original lead/i })).toHaveAttribute(
            'href',
            '/pro/leads/lead9',
        );
    });

    it('omits the original-lead link when no lead is linked', () => {
        render(<JobDetailClient detail={detail({ contactEventId: null })} />);
        expect(
            screen.queryByRole('link', { name: /view original lead/i }),
        ).not.toBeInTheDocument();
    });
});
