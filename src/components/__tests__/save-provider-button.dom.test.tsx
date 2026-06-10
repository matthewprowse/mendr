/**
 * Behaviour tests for `SaveProviderButton`.
 *
 * The button toggles a provider's saved state for authenticated users and
 * opens the homeowner auth dialog for logged-out users. The toggle hook and
 * auth context are mocked so we test only the button's own decisions:
 * auth-gating, the onToggled callback, disabled/loading states, and the
 * saved/unsaved aria semantics.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    useSavedProvider: vi.fn(),
    toggle: vi.fn(),
}));

vi.mock('@/context/auth-context', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/app/pro/hooks/use-saved-provider', () => ({ useSavedProvider: mocks.useSavedProvider }));
vi.mock('@/components/homeowner-auth-dialog', () => ({
    HomeownerAuthDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid="auth-dialog">auth</div> : null,
}));

import { SaveProviderButton } from '@/components/save-provider-button';

function setAuth(authenticated: boolean) {
    mocks.useAuth.mockReturnValue({
        user: authenticated ? { email: 'a@b.com' } : null,
    });
}

function setHook(state: { saved?: boolean; loading?: boolean } = {}) {
    mocks.useSavedProvider.mockReturnValue({
        saved: state.saved ?? false,
        loading: state.loading ?? false,
        toggle: mocks.toggle,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    setAuth(true);
    setHook();
    mocks.toggle.mockResolvedValue(true);
});

describe('SaveProviderButton', () => {
    it('toggles and fires onToggled with the new value when authenticated', async () => {
        const user = userEvent.setup();
        const onToggled = vi.fn();
        render(<SaveProviderButton providerId="p1" onToggled={onToggled} />);
        await user.click(screen.getByRole('button'));
        expect(mocks.toggle).toHaveBeenCalledTimes(1);
        expect(onToggled).toHaveBeenCalledWith(true);
        expect(screen.queryByTestId('auth-dialog')).not.toBeInTheDocument();
    });

    it('opens the auth dialog instead of toggling when logged out', async () => {
        const user = userEvent.setup();
        setAuth(false);
        render(<SaveProviderButton providerId="p1" />);
        await user.click(screen.getByRole('button'));
        expect(mocks.toggle).not.toHaveBeenCalled();
        expect(screen.getByTestId('auth-dialog')).toBeInTheDocument();
    });

    it('does not fire onToggled when the toggle returns null (failure)', async () => {
        const user = userEvent.setup();
        const onToggled = vi.fn();
        mocks.toggle.mockResolvedValue(null);
        render(<SaveProviderButton providerId="p1" onToggled={onToggled} />);
        await user.click(screen.getByRole('button'));
        expect(onToggled).not.toHaveBeenCalled();
    });

    it('reflects the saved state in aria-pressed and the label', () => {
        setHook({ saved: true });
        render(<SaveProviderButton providerId="p1" />);
        const btn = screen.getByRole('button');
        expect(btn).toHaveAttribute('aria-pressed', 'true');
        expect(btn).toHaveAttribute('aria-label', 'Remove from favourites');
    });

    it('uses the "Save" label when not saved', () => {
        setHook({ saved: false });
        render(<SaveProviderButton providerId="p1" />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Save to favourites');
    });

    it('is disabled while loading', () => {
        setHook({ loading: true });
        render(<SaveProviderButton providerId="p1" />);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('is disabled when there is no provider id', () => {
        render(<SaveProviderButton providerId={null} />);
        expect(screen.getByRole('button')).toBeDisabled();
    });
});
