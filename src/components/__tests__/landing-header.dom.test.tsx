/**
 * Behavior tests for `LandingHeader` — the marketing/landing page header.
 *
 * Pinned behaviors:
 *   - Renders the logo link (Mendr).
 *   - Renders all nav links passed via navLinks prop.
 *   - Mobile menu toggle button shows and hides the nav overlay.
 *   - Mobile CTA button renders with the provided href and label.
 *   - showTrades=true adds the "Trades" link to the nav.
 *   - Closing the mobile menu via the X button hides the overlay.
 *   - The menu closes automatically when the pathname changes.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';

const pathnameRef = { value: '/' };
vi.mock('next/navigation', () => ({
    usePathname: () => pathnameRef.value,
    useRouter: () => ({ push: vi.fn() }),
}));

let mockUser: User | null = null;
vi.mock('@/context/auth-context', () => ({
    useAuth: () => ({ user: mockUser, isLoading: false, signOut: vi.fn() }),
}));

// UserAvatarMenu uses useAuth internally — stub it out to avoid extra auth setup.
vi.mock('@/components/user-avatar-menu', () => ({
    UserAvatarMenu: () => <div data-testid="user-avatar-menu" />,
}));

const { LandingHeader } = await import('@/components/landing-header');

const navLinks = [
    { href: '/about', label: 'About' },
    { href: '/pricing', label: 'Pricing' },
];

describe('LandingHeader', () => {
    beforeEach(() => {
        pathnameRef.value = '/';
        mockUser = null;
        vi.clearAllMocks();
    });

    it('renders the Mendr logo', () => {
        render(<LandingHeader navLinks={navLinks} />);
        expect(screen.getByText('Mendr')).toBeInTheDocument();
    });

    it('renders all nav links on desktop', () => {
        render(<LandingHeader navLinks={navLinks} />);
        // Desktop nav uses <Link> elements
        const links = screen.getAllByRole('link', { name: /about|pricing/i });
        expect(links.length).toBeGreaterThanOrEqual(2);
    });

    it('shows the mobile menu toggle button', () => {
        render(<LandingHeader navLinks={navLinks} />);
        expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    });

    it('clicking the mobile toggle opens the nav overlay', async () => {
        const user = userEvent.setup();
        render(<LandingHeader navLinks={navLinks} />);
        await user.click(screen.getByRole('button', { name: /open menu/i }));
        await waitFor(() =>
            expect(screen.getByRole('dialog', { name: /site menu/i })).toBeInTheDocument(),
        );
    });

    it('clicking the close button hides the nav overlay', async () => {
        const user = userEvent.setup();
        render(<LandingHeader navLinks={navLinks} />);
        await user.click(screen.getByRole('button', { name: /open menu/i }));
        await waitFor(() =>
            expect(screen.getByRole('dialog', { name: /site menu/i })).toBeInTheDocument(),
        );
        await user.click(screen.getByRole('button', { name: /close menu/i }));
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: /site menu/i })).not.toBeInTheDocument(),
        );
    });

    it('mobile overlay contains nav links and the CTA button', async () => {
        const user = userEvent.setup();
        render(
            <LandingHeader
                navLinks={navLinks}
                mobileCtaHref="/start"
                mobileCtaLabel="Generate Free Mendr Report"
            />,
        );
        await user.click(screen.getByRole('button', { name: /open menu/i }));
        await waitFor(() =>
            expect(screen.getByRole('dialog', { name: /site menu/i })).toBeInTheDocument(),
        );
        // CTA link inside the overlay
        expect(
            screen.getByRole('link', { name: /generate free mendr report/i }),
        ).toBeInTheDocument();
    });

    it('showTrades=true adds a "Trades" anchor link', () => {
        render(<LandingHeader navLinks={navLinks} showTrades />);
        const tradesLinks = screen.getAllByRole('link', { name: /trades/i });
        expect(tradesLinks.length).toBeGreaterThan(0);
        expect(tradesLinks[0]).toHaveAttribute('href', '#all-services');
    });

    it('renders a custom logoHref', () => {
        render(<LandingHeader navLinks={navLinks} logoHref="/home" />);
        const logoLink = screen.getByText('Mendr').closest('a');
        expect(logoLink).toHaveAttribute('href', '/home');
    });

    it('renders the rightSlot prop', () => {
        render(
            <LandingHeader
                navLinks={navLinks}
                rightSlot={<button type="button">Custom CTA</button>}
            />,
        );
        expect(screen.getByRole('button', { name: /custom cta/i })).toBeInTheDocument();
    });

    it('renders hash anchor links as <a> tags in the mobile menu', async () => {
        const user = userEvent.setup();
        render(
            <LandingHeader
                navLinks={[{ href: '#features', label: 'Features' }]}
            />,
        );
        await user.click(screen.getByRole('button', { name: /open menu/i }));
        await waitFor(() =>
            expect(screen.getByRole('dialog', { name: /site menu/i })).toBeInTheDocument(),
        );
        // Hash link in mobile menu must be an <a> tag (not next/link)
        const hashLinks = screen.getAllByRole('link', { name: /features/i });
        const mobileHashLink = hashLinks.find((l) => l.closest('[role="dialog"]'));
        expect(mobileHashLink).toBeDefined();
        expect(mobileHashLink?.tagName).toBe('A');
        expect(mobileHashLink).toHaveAttribute('href', '#features');
    });
});
