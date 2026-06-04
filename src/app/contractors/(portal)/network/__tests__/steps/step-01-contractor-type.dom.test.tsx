/**
 * Step 1 — Contractor Type
 *
 * Behavior checks:
 *   • Initial render shows the three options with no selection.
 *   • Clicking an option marks it selected (aria-checked="true").
 *   • Selecting a new option swaps the active selection.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@googlemaps/js-api-loader', () => ({ importLibrary: vi.fn(async () => ({})) }));
vi.mock('@/lib/google-maps-js-loader', () => ({ ensureGoogleMapsLoaderOptions: vi.fn() }));
vi.mock('@/lib/auth/supabase', () => ({
    getSupabase: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
                }),
            }),
        }),
    }),
}));
vi.mock('@/features/match/api/client', () => ({ geocodeApi: vi.fn(async () => ({ ok: false })) }));
vi.mock('@/lib/client-random-id', () => ({ createClientId: () => 'cid_test' }));

const { StepContractorType } = await import('@/app/contractors/(portal)/network/steps/step-01-contractor-type');
const { renderWithWizard } = await import('./test-utils');

describe('StepContractorType', () => {
    beforeEach(() => {
        window.sessionStorage.clear();
    });

    it('renders the three contractor type options', async () => {
        renderWithWizard(<StepContractorType />);
        await screen.findByRole('heading', { name: /how do you work\?/i });
        expect(screen.getByRole('radio', { name: /^individual/i })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /^team/i })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /^enterprise/i })).toBeInTheDocument();
    });

    it('marks the option that was just clicked as selected', async () => {
        const user = userEvent.setup();
        renderWithWizard(<StepContractorType />);
        await screen.findByRole('heading', { name: /how do you work\?/i });

        const teamBtn = screen.getByRole('radio', { name: /^team/i });
        expect(teamBtn).toHaveAttribute('aria-checked', 'false');
        await user.click(teamBtn);
        expect(teamBtn).toHaveAttribute('aria-checked', 'true');
    });

    it('swaps the selection when another option is clicked', async () => {
        const user = userEvent.setup();
        renderWithWizard(<StepContractorType />);
        await screen.findByRole('heading', { name: /how do you work\?/i });

        await user.click(screen.getByRole('radio', { name: /^individual/i }));
        await user.click(screen.getByRole('radio', { name: /^enterprise/i }));

        const ind = screen.getByRole('radio', { name: /^individual/i });
        const ent = screen.getByRole('radio', { name: /^enterprise/i });
        expect(ind).toHaveAttribute('aria-checked', 'false');
        expect(ent).toHaveAttribute('aria-checked', 'true');
    });
});
