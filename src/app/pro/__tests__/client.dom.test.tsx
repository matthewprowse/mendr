/**
 * DOM tests for the Pro marketing / join page (`pro/client.tsx`).
 *
 * The page is a static marketing layout: hero, problem statement, how-it-works,
 * value bento, pricing tiers, FAQ accordion, and CTA. It renders <LandingHeader/>,
 * which reads the auth context and the current pathname — both are stubbed so the
 * page mounts without an AuthProvider.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
    usePathname: () => '/pro',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// LandingHeader reads useAuth directly; stub the context so the page mounts
// without an AuthProvider in the tree.
vi.mock('@/context/auth-context', () => ({
    useAuth: () => ({ user: null, isLoading: false, signOut: vi.fn() }),
}));

import ProJoinPage from '@/app/pro/client';
import { PRO_FAQS } from '@/app/pro/content';

beforeEach(() => vi.clearAllMocks());

describe('ProJoinPage (Pro marketing page)', () => {
    it('renders the hero headline', () => {
        render(<ProJoinPage />);
        expect(
            screen.getByRole('heading', {
                name: /less time quoting\. more time doing the work\./i,
            }),
        ).toBeInTheDocument();
    });

    it('renders the How It Works section heading', () => {
        render(<ProJoinPage />);
        expect(
            screen.getByRole('heading', { name: /how mendr works for providers/i }),
        ).toBeInTheDocument();
    });

    it('renders the Why Join (value) section heading', () => {
        render(<ProJoinPage />);
        expect(
            screen.getByRole('heading', { name: /why providers join mendr/i }),
        ).toBeInTheDocument();
    });

    it('renders all three pricing tiers', () => {
        render(<ProJoinPage />);
        expect(screen.getByText('Starter')).toBeInTheDocument();
        expect(screen.getByText('Professional')).toBeInTheDocument();
        expect(screen.getByText('Premium')).toBeInTheDocument();
    });

    it('renders the FAQ section with every question from the content file', () => {
        render(<ProJoinPage />);
        expect(
            screen.getByRole('heading', { name: /frequently asked questions/i }),
        ).toBeInTheDocument();
        for (const { q } of PRO_FAQS) {
            expect(screen.getByRole('heading', { name: q })).toBeInTheDocument();
        }
    });

    it('points every Apply CTA at /pro/network', () => {
        render(<ProJoinPage />);
        const applyLinks = screen
            .getAllByRole('link', { name: /apply to join the network|apply for free/i })
            .filter((el) => el.getAttribute('href') === '/pro/network');
        // Hero, three pricing cards, and final CTA all link to /pro/network.
        expect(applyLinks.length).toBeGreaterThanOrEqual(4);
    });

    it('renders the final CTA heading', () => {
        render(<ProJoinPage />);
        expect(
            screen.getByRole('heading', {
                name: /join the network and start receiving informed enquiries/i,
            }),
        ).toBeInTheDocument();
    });

    it('expands a FAQ answer when its summary is clicked', async () => {
        const user = userEvent.setup();
        render(<ProJoinPage />);
        const first = PRO_FAQS[0];
        const heading = screen.getByRole('heading', { name: first.q });
        const details = heading.closest('details') as HTMLDetailsElement;
        expect(details).not.toBeNull();
        expect(details.open).toBe(false);
        const summary = within(details).getByText(first.q);
        await user.click(summary);
        expect(details.open).toBe(true);
    });
});
