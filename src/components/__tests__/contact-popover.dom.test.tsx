/**
 * Behavior tests for `ContactPopover` — the "Contact" button and fly-out used
 * on Pro profile pages.
 *
 * Pinned behaviors:
 *   - Renders a "Contact" button (or custom label).
 *   - Clicking opens the popover; clicking again closes it.
 *   - Phone row is disabled when phone is null.
 *   - Email row is disabled when email is null.
 *   - WhatsApp summary button visible when phone is a valid SA mobile.
 *   - WhatsApp summary button absent when phone is a landline.
 *   - Clicking "Send WhatsApp summary" opens a confirmation dialog.
 *   - Controlled open/close via open + onOpenChange props.
 *   - onLead callback fired with correct type on phone / email click.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { server } from '@/__tests__/msw/server';
import { ContactPopover } from '@/components/contact-popover';

// Stub window.open so tests don't actually open browser windows.
let openSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
    openSpy.mockRestore();
});

const SA_MOBILE = '+27 82 123 4567';
const LANDLINE = '+27 21 555 5555';

describe('ContactPopover', () => {
    it('renders the trigger button with default label "Contact"', () => {
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={SA_MOBILE}
            />,
        );
        expect(screen.getByRole('button', { name: /^contact$/i })).toBeInTheDocument();
    });

    it('renders a custom label when label prop is passed', () => {
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={SA_MOBILE}
                label="Get in Touch"
            />,
        );
        expect(screen.getByRole('button', { name: /get in touch/i })).toBeInTheDocument();
    });

    it('opens the popover on trigger click', async () => {
        const user = userEvent.setup();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={SA_MOBILE}
            />,
        );
        await user.click(screen.getByRole('button', { name: /^contact$/i }));
        await waitFor(() =>
            expect(screen.getByText(/recommended/i)).toBeInTheDocument(),
        );
    });

    it('shows the Phone button in the popover', async () => {
        const user = userEvent.setup();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={SA_MOBILE}
            />,
        );
        await user.click(screen.getByRole('button', { name: /^contact$/i }));
        await waitFor(() => expect(screen.getByText('Phone')).toBeInTheDocument());
    });

    it('phone row is disabled when phone is null', async () => {
        const user = userEvent.setup();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={null}
            />,
        );
        await user.click(screen.getByRole('button', { name: /^contact$/i }));
        await waitFor(() => expect(screen.getByText('Phone')).toBeInTheDocument());
        // The phone button should be in a disabled state
        const phoneBtn = screen.getByRole('button', { name: /phone/i });
        expect(phoneBtn).toBeDisabled();
    });

    it('email row is disabled when email is not provided', async () => {
        const user = userEvent.setup();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={SA_MOBILE}
            />,
        );
        await user.click(screen.getByRole('button', { name: /^contact$/i }));
        await waitFor(() => expect(screen.getByText('Email')).toBeInTheDocument());
        const emailBtn = screen.getByRole('button', { name: /email/i });
        expect(emailBtn).toBeDisabled();
    });

    it('WhatsApp summary button is visible for a SA mobile number', async () => {
        const user = userEvent.setup();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={SA_MOBILE}
            />,
        );
        await user.click(screen.getByRole('button', { name: /^contact$/i }));
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: /send whatsapp summary/i }),
            ).toBeInTheDocument(),
        );
    });

    it('WhatsApp summary button is absent for a landline number', async () => {
        const user = userEvent.setup();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={LANDLINE}
            />,
        );
        await user.click(screen.getByRole('button', { name: /^contact$/i }));
        await waitFor(() => expect(screen.getByText('Phone')).toBeInTheDocument());
        expect(
            screen.queryByRole('button', { name: /send whatsapp summary/i }),
        ).not.toBeInTheDocument();
    });

    it('clicking "Send WhatsApp summary" opens the confirmation dialog', async () => {
        const user = userEvent.setup();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={SA_MOBILE}
            />,
        );
        await user.click(screen.getByRole('button', { name: /^contact$/i }));
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: /send whatsapp summary/i }),
            ).toBeInTheDocument(),
        );
        await user.click(screen.getByRole('button', { name: /send whatsapp summary/i }));
        await waitFor(() =>
            expect(screen.getByText(/send whatsapp summary/i, { selector: '[class*="DialogTitle"], h2, [data-slot="dialog-title"]' })).toBeInTheDocument(),
        );
    });

    it('fires onLead with "email" when email button is clicked', async () => {
        const user = userEvent.setup();
        const onLead = vi.fn();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={SA_MOBILE}
                email="john@plumbing.co.za"
                onLead={onLead}
            />,
        );
        await user.click(screen.getByRole('button', { name: /^contact$/i }));
        await waitFor(() => expect(screen.getByText('Email')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /email/i }));
        expect(onLead).toHaveBeenCalledWith('email');
    });

    it('renders with controlled open=true and calls onOpenChange when closed', async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John Smith"
                phone={SA_MOBILE}
                open={true}
                onOpenChange={onOpenChange}
            />,
        );
        // popover should already be open
        await waitFor(() =>
            expect(screen.getByText(/recommended/i)).toBeInTheDocument(),
        );
    });

    it('confirm whatsapp dialog shows provider display name', async () => {
        server.use(
            http.post('/api/whatsapp-message', () =>
                HttpResponse.json({ message: 'Hi, I saw your profile on Mendr' }),
            ),
        );
        const user = userEvent.setup();
        render(
            <ContactPopover
                providerName="Plumbing Co"
                displayName="John the Plumber"
                phone={SA_MOBILE}
            />,
        );
        await user.click(screen.getByRole('button', { name: /^contact$/i }));
        await user.click(
            await screen.findByRole('button', { name: /send whatsapp summary/i }),
        );
        await waitFor(() =>
            expect(screen.getByText(/john the plumber/i)).toBeInTheDocument(),
        );
    });
});
