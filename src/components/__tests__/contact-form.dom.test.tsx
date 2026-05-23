/**
 * Behavior tests for `ContactForm` — the shared form rendered on the public
 * `/contact` page and inside the contractor support flow.
 *
 * Pinned behaviors:
 *  • Submit button stays disabled while required fields are blank.
 *  • Successful POST to `/api/contact` swaps the form for the success state.
 *  • Server-side `error` payloads bubble up to a visible message.
 *  • Network/500 failures render the generic "Something went wrong" copy.
 *  • The form does NOT enforce email format client-side (HTML5 + server-side
 *    only) — this is documented as a known UX gap, not a bug.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, it, expect } from 'vitest';

import { ContactForm } from '@/components/contact-form';
import { server } from '@/__tests__/msw/server';

describe('ContactForm', () => {
    it('keeps submit disabled until name, email and message are populated', async () => {
        const user = userEvent.setup();
        render(<ContactForm subjectMode="input" />);

        const submit = screen.getByRole('button', { name: /send message/i });
        expect(submit).toBeDisabled();

        await user.type(screen.getByLabelText(/name/i), 'Ada');
        expect(submit).toBeDisabled();

        await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
        expect(submit).toBeDisabled();

        await user.type(screen.getByLabelText(/message/i), 'Hello there');
        expect(submit).toBeEnabled();
    });

    it('renders the success state after a 200 response', async () => {
        const user = userEvent.setup();

        let posted: unknown = null;
        server.use(
            http.post('/api/contact', async ({ request }) => {
                posted = await request.json();
                return HttpResponse.json({ ok: true }, { status: 200 });
            }),
        );

        render(<ContactForm subjectMode="input" />);
        await user.type(screen.getByLabelText(/name/i), 'Ada Lovelace');
        await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
        await user.type(screen.getByLabelText(/subject/i), 'General question');
        await user.type(screen.getByLabelText(/message/i), 'A diagnosis question.');

        await user.click(screen.getByRole('button', { name: /send message/i }));

        await waitFor(() => {
            expect(screen.getByText(/message sent!/i)).toBeInTheDocument();
        });
        expect(posted).toMatchObject({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            subject: 'General question',
            message: 'A diagnosis question.',
        });
    });

    it('surfaces a server `error` message verbatim', async () => {
        const user = userEvent.setup();
        server.use(
            http.post('/api/contact', () =>
                HttpResponse.json({ error: 'Please slow down — try again in a minute.' }, { status: 429 }),
            ),
        );

        render(<ContactForm subjectMode="input" />);
        await user.type(screen.getByLabelText(/name/i), 'Ada');
        await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
        await user.type(screen.getByLabelText(/subject/i), 'Tech');
        await user.type(screen.getByLabelText(/message/i), 'Help');
        await user.click(screen.getByRole('button', { name: /send message/i }));

        expect(
            await screen.findByText(/please slow down — try again in a minute\./i),
        ).toBeInTheDocument();
        // Form stays — not swapped to success.
        expect(screen.queryByText(/message sent!/i)).not.toBeInTheDocument();
    });

    it('renders generic error copy on a 500 with no body', async () => {
        const user = userEvent.setup();
        server.use(
            http.post('/api/contact', () => new HttpResponse('', { status: 500 })),
        );

        render(<ContactForm subjectMode="input" />);
        await user.type(screen.getByLabelText(/name/i), 'Ada');
        await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
        await user.type(screen.getByLabelText(/subject/i), 'Tech');
        await user.type(screen.getByLabelText(/message/i), 'Help');
        await user.click(screen.getByRole('button', { name: /send message/i }));

        expect(
            await screen.findByText(/something went wrong\. please try again\./i),
        ).toBeInTheDocument();
    });

    it('clears all fields when "Send another message" is clicked', async () => {
        const user = userEvent.setup();
        render(<ContactForm subjectMode="input" />);

        await user.type(screen.getByLabelText(/name/i), 'Ada');
        await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
        await user.type(screen.getByLabelText(/subject/i), 'Tech');
        await user.type(screen.getByLabelText(/message/i), 'Help');
        await user.click(screen.getByRole('button', { name: /send message/i }));

        await screen.findByText(/message sent!/i);
        await user.click(screen.getByRole('button', { name: /send another message/i }));

        const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
        expect(nameInput.value).toBe('');
        expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe('');
        expect((screen.getByLabelText(/message/i) as HTMLTextAreaElement).value).toBe('');
    });
});
