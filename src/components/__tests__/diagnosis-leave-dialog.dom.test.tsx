/**
 * Tests for `DiagnosisLeaveDialog` — a confirm-before-discard dialog. The two
 * footer actions have distinct semantics: "Continue Diagnosis" only closes,
 * "Lose Progress" closes AND fires onLeave. Both are pinned, plus that nothing
 * renders while closed.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DiagnosisLeaveDialog } from '@/components/diagnosis-leave-dialog';

describe('DiagnosisLeaveDialog', () => {
    it('renders the title and both actions when open', () => {
        render(<DiagnosisLeaveDialog open onOpenChange={vi.fn()} onLeave={vi.fn()} />);
        expect(screen.getByRole('heading', { name: /leave diagnosis\?/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue diagnosis/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /lose progress/i })).toBeInTheDocument();
    });

    it('renders nothing when closed', () => {
        render(<DiagnosisLeaveDialog open={false} onOpenChange={vi.fn()} onLeave={vi.fn()} />);
        expect(screen.queryByRole('heading', { name: /leave diagnosis\?/i })).not.toBeInTheDocument();
    });

    it('"Continue Diagnosis" closes the dialog without leaving', async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();
        const onLeave = vi.fn();
        render(<DiagnosisLeaveDialog open onOpenChange={onOpenChange} onLeave={onLeave} />);
        await user.click(screen.getByRole('button', { name: /continue diagnosis/i }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onLeave).not.toHaveBeenCalled();
    });

    it('"Lose Progress" closes the dialog and fires onLeave', async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();
        const onLeave = vi.fn();
        render(<DiagnosisLeaveDialog open onOpenChange={onOpenChange} onLeave={onLeave} />);
        await user.click(screen.getByRole('button', { name: /lose progress/i }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onLeave).toHaveBeenCalledTimes(1);
    });
});
