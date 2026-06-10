/**
 * Tests for `PrintButton` — invokes window.print on click. Small, but it's the
 * only path to "Save as PDF" on public provider documents (invoice/quote).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PrintButton } from '@/components/print-button';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('PrintButton', () => {
    it('calls window.print when clicked', async () => {
        const user = userEvent.setup();
        const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
        render(<PrintButton />);
        await user.click(screen.getByRole('button', { name: /print \/ save as pdf/i }));
        expect(printSpy).toHaveBeenCalledTimes(1);
    });
});
