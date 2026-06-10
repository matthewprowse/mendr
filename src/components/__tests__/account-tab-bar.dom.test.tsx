/**
 * Tests for `AccountTabBar` active-tab resolution. Longest-prefix matching
 * means a nested route like /settings/profile lights up Settings, and an
 * unmatched route falls back to Home. usePathname is mocked.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const path = vi.hoisted(() => ({ value: '/home' }));
vi.mock('next/navigation', () => ({ usePathname: () => path.value }));

import { AccountTabBar } from '@/components/account-tab-bar';

function activeTabName(): string | undefined {
    return screen
        .getAllByRole('tab')
        .find((t) => t.getAttribute('aria-selected') === 'true')
        ?.textContent ?? undefined;
}

beforeEach(() => {
    path.value = '/home';
});

describe('AccountTabBar', () => {
    it('renders the four nav tabs plus the start-diagnosis action', () => {
        render(<AccountTabBar />);
        for (const label of ['Home', 'History', 'Favourites', 'Settings']) {
            expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
        }
        expect(screen.getByRole('link', { name: 'Start a diagnosis' })).toHaveAttribute(
            'href',
            '/start',
        );
    });

    it('marks Home active on /home', () => {
        path.value = '/home';
        render(<AccountTabBar />);
        expect(activeTabName()).toBe('Home');
    });

    it('marks History active on /diagnoses', () => {
        path.value = '/diagnoses';
        render(<AccountTabBar />);
        expect(activeTabName()).toBe('History');
    });

    it('lights up Settings on a nested /settings/profile route (longest prefix wins)', () => {
        path.value = '/settings/profile';
        render(<AccountTabBar />);
        expect(activeTabName()).toBe('Settings');
    });

    it('falls back to Home when nothing matches', () => {
        path.value = '/some/unrelated/page';
        render(<AccountTabBar />);
        expect(activeTabName()).toBe('Home');
    });
});
