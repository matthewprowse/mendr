import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactConsentDialog } from '@/components/contact-consent-dialog';

beforeEach(() => vi.clearAllMocks());

function setup(props: Partial<React.ComponentProps<typeof ContactConsentDialog>> = {}) {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
        <ContactConsentDialog
            open
            onOpenChange={onOpenChange}
            onConfirm={onConfirm}
            businessName="Acme Plumbing"
            {...props}
        />,
    );
    return { onOpenChange, onConfirm };
}

describe('ContactConsentDialog', () => {
    it('names the specialist in the POPIA disclosure', () => {
        setup();
        expect(screen.getByText(/Share your details with Acme Plumbing\?/)).toBeInTheDocument();
        expect(screen.getByText(/name, mobile number, and enquiry details/i)).toBeInTheDocument();
    });

    it('cancels without confirming', async () => {
        const user = userEvent.setup();
        const { onOpenChange, onConfirm } = setup();
        await user.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('confirms with dontAskAgain=false by default', async () => {
        const user = userEvent.setup();
        const { onConfirm } = setup();
        await user.click(screen.getByRole('button', { name: /continue/i }));
        expect(onConfirm).toHaveBeenCalledWith(false);
    });

    it('passes dontAskAgain=true when the checkbox is ticked', async () => {
        const user = userEvent.setup();
        const { onConfirm } = setup();
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: /continue/i }));
        expect(onConfirm).toHaveBeenCalledWith(true);
    });

    it('disables the actions while busy', () => {
        setup({ busy: true });
        expect(screen.getByRole('button', { name: /sharing/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
});
