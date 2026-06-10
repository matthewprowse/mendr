/**
 * Behavior tests for `AppHeader` — the sticky header used across the diagnosis
 * flow (description, location, processing, diagnosis report pages).
 *
 * Pinned behaviors:
 *   - Always renders the Mendr logo link.
 *   - showBack=true renders a "Go back" button that calls router.back().
 *   - showBack=false (default) hides the back button.
 *   - imageSrc + showViewImage renders "View Image" button that opens a new tab.
 *   - imageSrc without showViewImage hides the view-image button.
 *   - showNewScan renders a "New Scan" button that calls onNewScanClick.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backMock = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: backMock, push: vi.fn() }),
}));

// next/image renders an <img> in tests
vi.mock('next/image', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default: (props: any) => <img {...props} />,
}));

const { AppHeader } = await import('@/components/app-header');

describe('AppHeader', () => {
    beforeEach(() => {
        backMock.mockReset();
    });

    it('renders the Mendr logo link', () => {
        render(<AppHeader />);
        const link = screen.getByRole('link', { name: /mendr/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/');
    });

    it('does not show the back button by default (showBack=false)', () => {
        render(<AppHeader />);
        expect(screen.queryByRole('button', { name: /go back/i })).not.toBeInTheDocument();
    });

    it('shows the back button when showBack=true', () => {
        render(<AppHeader showBack />);
        expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    });

    it('calls router.back() when the back button is clicked', async () => {
        const user = userEvent.setup();
        render(<AppHeader showBack />);
        await user.click(screen.getByRole('button', { name: /go back/i }));
        expect(backMock).toHaveBeenCalledTimes(1);
    });

    it('shows "View Image" button when imageSrc is provided and showViewImage is true', () => {
        render(<AppHeader imageSrc="https://example.com/photo.jpg" showViewImage />);
        expect(screen.getByRole('button', { name: /view image/i })).toBeInTheDocument();
    });

    it('hides "View Image" button when showViewImage is false', () => {
        render(<AppHeader imageSrc="https://example.com/photo.jpg" showViewImage={false} />);
        expect(screen.queryByRole('button', { name: /view image/i })).not.toBeInTheDocument();
    });

    it('hides "View Image" button when imageSrc is null', () => {
        render(<AppHeader imageSrc={null} showViewImage />);
        expect(screen.queryByRole('button', { name: /view image/i })).not.toBeInTheDocument();
    });

    it('shows "New Scan" button when showNewScan=true', () => {
        render(<AppHeader showNewScan onNewScanClick={vi.fn()} />);
        expect(screen.getByRole('button', { name: /new scan/i })).toBeInTheDocument();
    });

    it('calls onNewScanClick when "New Scan" button is clicked', async () => {
        const user = userEvent.setup();
        const onNewScan = vi.fn();
        render(<AppHeader showNewScan onNewScanClick={onNewScan} />);
        await user.click(screen.getByRole('button', { name: /new scan/i }));
        expect(onNewScan).toHaveBeenCalledTimes(1);
    });

    it('does not show "New Scan" button by default', () => {
        render(<AppHeader />);
        expect(screen.queryByRole('button', { name: /new scan/i })).not.toBeInTheDocument();
    });
});
