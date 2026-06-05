import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;
const state = vi.hoisted(() => ({ value: { providerId: null as string | null, pending: false } }));

vi.mock('next/navigation', () => ({
    redirect: vi.fn((url: string) => {
        throw new Error(`REDIRECT:${url}`);
    }),
}));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));
vi.mock('@/lib/providers/claimed-provider', () => ({
    getProviderState: vi.fn(async () => state.value),
}));

import ProHomePage from '@/app/pro/(portal)/home/page';

beforeEach(() => {
    vi.clearAllMocks();
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient();
});

describe('ProHomePage states', () => {
    it('redirects to login when signed out', async () => {
        serverClient = mockSupabaseClient({ user: null });
        await expect(ProHomePage()).rejects.toThrow('REDIRECT:/pro/auth/login?next=/pro/home');
    });

    it('shows the claim call-to-action when no provider is linked', async () => {
        state.value = { providerId: null, pending: false };
        render(await ProHomePage());
        expect(screen.getByRole('heading', { name: /welcome to mendr pro/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /claim your business/i })).toBeInTheDocument();
    });

    it('shows the pending message and hides the claim button when a claim is under review', async () => {
        state.value = { providerId: null, pending: true };
        render(await ProHomePage());
        expect(screen.getByText(/your claim is under review/i)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /claim your business/i })).not.toBeInTheDocument();
    });

    it('renders the dashboard with stats and recent enquiries when linked', async () => {
        state.value = { providerId: 'prov-1', pending: false };
        adminClient = mockSupabaseClient({
            tables: {
                provider_contact_events: {
                    data: [
                        {
                            id: 'e1',
                            created_at: '2026-05-01T00:00:00Z',
                            diagnosis_trade: 'plumbing',
                            diagnoses: { title: 'Leaking geyser', primary_trade: 'plumbing', customer_address: '1 A St, Newlands' },
                        },
                    ],
                    count: 7,
                    error: null,
                },
                provider_profile_views: { data: null, count: 12, error: null },
                providers: { data: { name: 'Acme Plumbing', rating: 4.5, rating_count: 20, mendr_rating: null, mendr_rating_count: 0 }, error: null },
                job_outcomes: { data: [], error: null },
            },
        });
        render(await ProHomePage());
        expect(screen.getByRole('heading', { name: 'Acme Plumbing' })).toBeInTheDocument();
        expect(screen.getByText('Performance')).toBeInTheDocument();
        expect(screen.getByText('Leaking geyser')).toBeInTheDocument();
    });
});
