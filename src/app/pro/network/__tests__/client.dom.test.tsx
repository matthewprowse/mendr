/**
 * Behavior tests for the contractor application multi-step form (Pro onboarding).
 *
 * The full form is 10 steps and depends on Supabase, Google Maps, file uploads,
 * and toast notifications. We don't try to drive the whole flow end-to-end here —
 * that belongs in Phase 6 (Playwright E2E). Instead this suite pins:
 *
 *   • Initial render lands on Step 1 (Contractor Type) and shows the three
 *     options.
 *   • The footer "Continue" button is disabled until a contractor type is
 *     selected — this is the validation gate the step depends on.
 *   • Selecting an option enables Continue, and clicking Continue advances to
 *     Step 2 (Company Search).
 *   • The "Back" header control returns to Step 1 from Step 2 with the
 *     selection retained.
 *
 * These four behaviors verify the core multi-step machinery: step state +
 * validation gating + back-nav. Later steps (file uploads, Google Maps,
 * service area maps, KYC) need real DOM APIs that jsdom doesn't reasonably
 * provide and are deferred to E2E.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock external integrations the page touches at mount time. Even though we
// don't drive Steps 3+, the imports run when the module evaluates.
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@googlemaps/js-api-loader', () => ({
    importLibrary: vi.fn(async () => ({})),
}));

vi.mock('@/lib/google-maps-js-loader', () => ({
    ensureGoogleMapsLoaderOptions: vi.fn(),
}));

// The header renders <ProAccountMenu/>, which reads the auth context. The test
// doesn't mount an AuthProvider, so stub it out to a no-op.
vi.mock('@/components/pro-account-menu', () => ({
    ProAccountMenu: () => null,
}));

vi.mock('@/lib/auth/supabase', () => ({
    getSupabase: () => ({
        auth: {
            getUser: async () => ({ data: { user: null }, error: null }),
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                    order: () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }),
                }),
                order: () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }),
            }),
        }),
    }),
}));

vi.mock('@/features/match/api/client', () => ({
    geocodeApi: vi.fn(async () => ({ ok: false })),
}));

// `createClientId` returns a stable id we don't care about.
vi.mock('@/lib/client-random-id', () => ({
    createClientId: () => 'cid_test',
}));

// Pull the page after mocks so it captures them.
const { default: ProOnboardPage } = await import(
    '@/app/pro/network/client'
);

describe('ProOnboardPage — multi-step contractor application', () => {
    beforeEach(() => {
        // The page persists progress into sessionStorage; clear between tests
        // so each starts at Step 1 with an empty form.
        try {
            window.sessionStorage.clear();
        } catch {
            /* ignore */
        }
    });

    it('renders Step 1 (Contractor Type) with the three options', async () => {
        render(<ProOnboardPage />);
        // Wait for the session-load effect to settle.
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: /how do you work\?/i })).toBeInTheDocument(),
        );
        expect(screen.getByRole('radio', { name: /^individual/i })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /^team/i })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /^enterprise/i })).toBeInTheDocument();
    });

    it('gates the Continue button until a contractor type is selected', async () => {
        const user = userEvent.setup();
        render(<ProOnboardPage />);
        await screen.findByRole('heading', { name: /how do you work\?/i });

        const continueBtn = screen.getByRole('button', { name: /continue/i });
        expect(continueBtn).toBeDisabled();

        await user.click(screen.getByRole('radio', { name: /^individual/i }));
        expect(continueBtn).toBeEnabled();
    });

    it('advances to Step 2 (Company Search) on Continue', async () => {
        const user = userEvent.setup();
        render(<ProOnboardPage />);
        await screen.findByRole('heading', { name: /how do you work\?/i });

        await user.click(screen.getByRole('radio', { name: /^team/i }));
        await user.click(screen.getByRole('button', { name: /continue/i }));

        // After contractor type, Step 2 is Company Search ("Find your business").
        expect(
            await screen.findByRole('heading', { name: /find your business/i }),
        ).toBeInTheDocument();
    });

    it('Back from Step 2 returns to Step 1 with the selection preserved', async () => {
        const user = userEvent.setup();
        render(<ProOnboardPage />);
        await screen.findByRole('heading', { name: /how do you work\?/i });

        await user.click(screen.getByRole('radio', { name: /^enterprise/i }));
        await user.click(screen.getByRole('button', { name: /continue/i }));
        await screen.findByRole('heading', { name: /find your business/i });

        // The back button in FlowTopBar is an icon-only button labeled "Go back".
        const backBtn = screen.getByRole('button', { name: /go back/i });
        await user.click(backBtn);

        // We're back at Step 1; the Enterprise card is in the selected/visual state.
        const stepOneHeading = await screen.findByRole('heading', { name: /how do you work\?/i });
        const stepOne = stepOneHeading.closest('div')!;
        const enterprise = within(stepOne.parentElement!).getByRole('radio', { name: /^enterprise/i });
        // Selection is expressed via aria-checked on the option radio.
        expect(enterprise).toHaveAttribute('aria-checked', 'true');
    });
});
