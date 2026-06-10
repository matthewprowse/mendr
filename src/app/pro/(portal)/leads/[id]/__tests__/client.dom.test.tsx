/**
 * DOM tests for the lead (enquiry) detail page
 * (`pro/(portal)/leads/[id]/client.tsx`).
 *
 * Renders the homeowner enquiry: title, trade/suburb meta, contact actions,
 * photos, diagnosis text, private notes, and outcome controls. Status changes and
 * note saves PATCH /api/pro/leads/:id; "Create Quote" POSTs /api/pro/quotes and
 * navigates to the new quote.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import EnquiryDetailClient, {
    type EnquiryDetail,
} from '@/app/pro/(portal)/leads/[id]/client';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('sonner', () => ({ toast: toastMock }));

const detail = (over: Partial<EnquiryDetail> = {}): EnquiryDetail => ({
    id: 'lead1',
    createdAt: '2026-06-01T00:00:00Z',
    channel: 'whatsapp',
    status: 'new',
    notes: 'Initial notes',
    contactNumber: '+27 82 555 1234',
    whatsappNumber: '+27 82 555 1234',
    title: 'Burst geyser in ceiling',
    trade: 'plumbing',
    suburb: 'Claremont',
    urgency: 'urgent',
    diagnosisText: 'The geyser thermostat has failed and is leaking.',
    actionRequired: 'Replace the geyser within 24 hours.',
    estimatedCost: 'R8,000 – R12,000',
    images: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
    ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('EnquiryDetailClient (lead detail)', () => {
    it('renders the enquiry title and trade/suburb/urgency meta', () => {
        render(<EnquiryDetailClient detail={detail()} />);
        expect(
            screen.getByRole('heading', { name: /burst geyser in ceiling/i }),
        ).toBeInTheDocument();
        expect(screen.getByText(/plumbing · claremont · urgent/i)).toBeInTheDocument();
    });

    it('renders the diagnosis summary, recommended action and estimated cost', () => {
        render(<EnquiryDetailClient detail={detail()} />);
        expect(screen.getByText(/the geyser thermostat has failed/i)).toBeInTheDocument();
        expect(screen.getByText(/replace the geyser within 24 hours/i)).toBeInTheDocument();
        expect(screen.getByText(/R8,000 – R12,000/)).toBeInTheDocument();
    });

    it('renders WhatsApp and Call links when a contact number is present', () => {
        render(<EnquiryDetailClient detail={detail()} />);
        const wa = screen.getByRole('link', { name: /whatsapp/i });
        expect(wa.getAttribute('href')).toContain('https://wa.me/2782555');
        const call = screen.getByRole('link', { name: /call/i });
        expect(call.getAttribute('href')).toContain('tel:+27825551234');
    });

    it('shows the hidden-contact message when no contact number is present', () => {
        render(<EnquiryDetailClient detail={detail({ contactNumber: null })} />);
        expect(screen.getByText(/contact details are hidden/i)).toBeInTheDocument();
    });

    it('renders one image per provided URL', () => {
        render(<EnquiryDetailClient detail={detail()} />);
        const imgs = screen.getAllByAltText(/homeowner enquiry/i);
        expect(imgs).toHaveLength(2);
    });

    it('shows the no-diagnosis fallback when diagnosis text is null', () => {
        render(<EnquiryDetailClient detail={detail({ diagnosisText: null })} />);
        expect(screen.getByText(/no diagnosis text/i)).toBeInTheDocument();
    });

    it('saves edited private notes via PATCH', async () => {
        const captured: { body: { notes?: string } | null } = { body: null };
        server.use(
            http.patch('/api/pro/leads/lead1', async ({ request }) => {
                captured.body = (await request.json()) as { notes?: string };
                return HttpResponse.json({ ok: true });
            }),
        );
        const user = userEvent.setup();
        render(<EnquiryDetailClient detail={detail()} />);
        const notes = screen.getByPlaceholderText(/only you can see these notes/i);
        await user.type(notes, ' updated');
        await user.click(screen.getByRole('button', { name: /save notes/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Notes saved.'));
        expect(captured.body?.notes).toBe('Initial notes updated');
    });

    it('disables Save Notes until the notes change', () => {
        render(<EnquiryDetailClient detail={detail()} />);
        expect(screen.getByRole('button', { name: /save notes/i })).toBeDisabled();
    });

    it('shows an error toast when saving notes fails', async () => {
        server.use(
            http.patch('/api/pro/leads/lead1', () => HttpResponse.json({}, { status: 500 })),
        );
        const user = userEvent.setup();
        render(<EnquiryDetailClient detail={detail()} />);
        await user.type(
            screen.getByPlaceholderText(/only you can see these notes/i),
            ' more',
        );
        await user.click(screen.getByRole('button', { name: /save notes/i }));
        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Could not save notes.'),
        );
    });

    it('marks the lead as won via PATCH', async () => {
        let body: { status?: string } | null = null;
        server.use(
            http.patch('/api/pro/leads/lead1', async ({ request }) => {
                body = (await request.json()) as { status?: string };
                return HttpResponse.json({ ok: true });
            }),
        );
        const user = userEvent.setup();
        render(<EnquiryDetailClient detail={detail()} />);
        await user.click(screen.getByRole('button', { name: /mark won/i }));
        await waitFor(() => expect(body?.status).toBe('won'));
    });

    it('reverts the status and toasts on a failed status update', async () => {
        server.use(
            http.patch('/api/pro/leads/lead1', () => HttpResponse.json({}, { status: 500 })),
        );
        const user = userEvent.setup();
        render(<EnquiryDetailClient detail={detail()} />);
        await user.click(screen.getByRole('button', { name: /mark lost/i }));
        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Could not update status.'),
        );
    });

    it('creates a quote from the lead and navigates to it', async () => {
        let body: { contactEventId?: string } | null = null;
        server.use(
            http.post('/api/pro/quotes', async ({ request }) => {
                body = (await request.json()) as { contactEventId?: string };
                return HttpResponse.json({ id: 'q-new' });
            }),
        );
        const user = userEvent.setup();
        render(<EnquiryDetailClient detail={detail()} />);
        await user.click(screen.getByRole('button', { name: /create quote/i }));
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/pro/quotes/q-new'));
        expect(body).toEqual({ contactEventId: 'lead1' });
    });

    it('shows an error toast when quote creation fails', async () => {
        server.use(
            http.post('/api/pro/quotes', () =>
                HttpResponse.json({ error: 'Lead already quoted' }, { status: 409 }),
            ),
        );
        const user = userEvent.setup();
        render(<EnquiryDetailClient detail={detail()} />);
        await user.click(screen.getByRole('button', { name: /create quote/i }));
        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Lead already quoted'),
        );
    });
});
