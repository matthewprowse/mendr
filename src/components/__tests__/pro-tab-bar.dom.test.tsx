import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProTabBar } from '@/components/pro-tab-bar';

const path = vi.hoisted(() => ({ value: '/pro/home' }));
vi.mock('next/navigation', () => ({ usePathname: () => path.value }));

beforeEach(() => {
    vi.clearAllMocks();
    path.value = '/pro/home';
});

describe('ProTabBar', () => {
    it('renders the four primary tabs and the More control', () => {
        render(<ProTabBar />);
        expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Leads' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Customers' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Account' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
    });

    it('marks the tab matching the current path as active', () => {
        path.value = '/pro/leads';
        render(<ProTabBar />);
        expect(screen.getByRole('tab', { name: 'Leads' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'false');
    });

    it('selects no primary tab when on a More route', () => {
        path.value = '/pro/invoices';
        render(<ProTabBar />);
        expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByRole('tab', { name: 'Leads' })).toHaveAttribute('aria-selected', 'false');
    });

    it('opens the More popover to reveal overflow sections', async () => {
        const user = userEvent.setup();
        render(<ProTabBar />);
        await user.click(screen.getByRole('button', { name: 'More' }));
        await waitFor(() => expect(screen.getByRole('link', { name: 'Invoices' })).toBeInTheDocument());
        expect(screen.getByRole('link', { name: 'Quotes' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Team' })).toBeInTheDocument();
    });
});
