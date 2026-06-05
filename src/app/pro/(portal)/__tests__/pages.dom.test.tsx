/**
 * Pro portal page (server component) state branches: signed-out redirect, the
 * no-provider empty state, the pending-claim message, and the linked render.
 * Tested by awaiting each async server component and rendering the result.
 */
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
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));
vi.mock('@/lib/providers/claimed-provider', () => ({
    getProviderState: vi.fn(async () => state.value),
}));

import ProInvoicesPage from '@/app/pro/(portal)/invoices/page';
import ProQuotesPage from '@/app/pro/(portal)/quotes/page';
import ProLeadsPage from '@/app/pro/(portal)/leads/page';

beforeEach(() => {
    vi.clearAllMocks();
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient();
    state.value = { providerId: null, pending: false };
});

describe.each([
    { name: 'invoices', Page: ProInvoicesPage, loginPath: '/pro/auth/login?next=/pro/invoices', heading: 'Invoices', table: 'invoices', empty: /no invoices yet/i },
    { name: 'quotes', Page: ProQuotesPage, loginPath: '/pro/auth/login?next=/pro/quotes', heading: 'Quotes', table: 'quotes', empty: /no quotes yet/i },
    { name: 'leads', Page: ProLeadsPage, loginPath: '/pro/auth/login?next=/pro/leads', heading: 'Leads', table: 'provider_contact_events', empty: /no leads yet/i },
])('Pro $name page', ({ Page, loginPath, heading, table, empty }) => {
    it('redirects to login when signed out', async () => {
        serverClient = mockSupabaseClient({ user: null });
        await expect(Page()).rejects.toThrow(`REDIRECT:${loginPath}`);
    });

    it('shows the claim CTA when no provider is linked', async () => {
        state.value = { providerId: null, pending: false };
        render(await Page());
        expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /claim your business/i })).toBeInTheDocument();
    });

    it('shows the pending message and hides the claim link when under review', async () => {
        state.value = { providerId: null, pending: true };
        render(await Page());
        expect(screen.getByText(/under review/i)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /claim your business/i })).not.toBeInTheDocument();
    });

    it('renders the client (empty data) when linked', async () => {
        state.value = { providerId: 'prov-1', pending: false };
        adminClient = mockSupabaseClient({ tables: { [table]: { data: [], error: null } } });
        render(await Page());
        expect(screen.getByText(empty)).toBeInTheDocument();
    });
});
