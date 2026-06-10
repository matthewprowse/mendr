/**
 * Behavior tests for the diagnosis history list (`/diagnoses`).
 *
 * The page renders a logged-out CTA, a loading skeleton while it fetches from
 * Supabase, an empty state, and a list of rows with search + per-row actions
 * (star/pin, delete, share, download). Supabase and auth are mocked so we test
 * only the component's own rendering and state transitions. `initialRows` is
 * the prop the server uses to hydrate the list and skip the client fetch.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosisListRow } from '@/types/diagnosis';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    getSupabase: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, back: mocks.back, replace: vi.fn() }),
}));

vi.mock('@/context/auth-context', () => ({ useAuth: mocks.useAuth }));

vi.mock('@/lib/auth/supabase', () => ({ getSupabase: mocks.getSupabase }));

vi.mock('sonner', () => ({
    toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

// Header avatar + tab bar both read auth/router internals we don't exercise.
vi.mock('@/components/user-avatar', () => ({ UserAvatar: () => <div data-testid="user-avatar" /> }));
vi.mock('@/components/account-tab-bar', () => ({ AccountTabBar: () => <div data-testid="tab-bar" /> }));

const { default: DiagnosesClient } = await import('@/app/diagnoses/client');

function setLoggedIn(loggedIn: boolean) {
    mocks.useAuth.mockReturnValue({ user: loggedIn ? { email: 'a@b.com', id: 'u1' } : null });
}

/** Build a chainable Supabase stub whose terminal operations resolve to the given results. */
function makeSupabase(opts: {
    selectResult?: { data: unknown; error: unknown };
    deleteResult?: { error: unknown };
    updateResult?: { error: unknown };
} = {}) {
    const selectResult = opts.selectResult ?? { data: [], error: null };
    const deleteResult = opts.deleteResult ?? { error: null };
    const updateResult = opts.updateResult ?? { error: null };

    const from = vi.fn(() => {
        // select(...).order(...).order(...).limit(...) -> Promise
        const limit = vi.fn(async () => selectResult);
        const order2 = vi.fn(() => ({ limit }));
        const order1 = vi.fn(() => ({ order: order2 }));
        const select = vi.fn(() => ({ order: order1 }));
        // delete().eq() -> Promise
        const del = vi.fn(() => ({ eq: vi.fn(async () => deleteResult) }));
        // update().eq() -> Promise
        const update = vi.fn(() => ({ eq: vi.fn(async () => updateResult) }));
        return { select, delete: del, update };
    });
    return { from };
}

const rows: DiagnosisListRow[] = [
    {
        id: 'd1',
        title: 'Leaking geyser',
        created_at: new Date().toISOString(),
        diagnosis: { diagnosis: 'A leaking geyser', trade: 'Plumbing' },
        pinned: false,
    },
    {
        id: 'd2',
        title: 'Tripping DB board',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
        diagnosis: { diagnosis: 'Earth leakage', trade: 'Electrical' },
        pinned: true,
    },
];

beforeEach(() => {
    vi.clearAllMocks();
    setLoggedIn(true);
    mocks.getSupabase.mockReturnValue(makeSupabase());
    // jsdom doesn't implement IntersectionObserver; the page observes its H1
    // to swap the sticky-header title. A no-op stub is sufficient.
    if (typeof globalThis.IntersectionObserver === 'undefined') {
        globalThis.IntersectionObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
            takeRecords() { return []; }
            root = null;
            rootMargin = '';
            thresholds = [];
        } as unknown as typeof IntersectionObserver;
    }
});

describe('DiagnosesClient', () => {
    it('shows the logged-out CTA when there is no user', () => {
        setLoggedIn(false);
        render(<DiagnosesClient />);
        expect(screen.getByRole('heading', { name: 'Diagnosis History' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
            'href',
            '/auth/login?next=/diagnoses',
        );
    });

    it('renders each diagnosis with title and trade badge', async () => {
        render(<DiagnosesClient initialRows={rows} />);
        expect(await screen.findByText('Leaking geyser')).toBeInTheDocument();
        expect(screen.getByText('Tripping DB board')).toBeInTheDocument();
        expect(screen.getByText('Plumbing')).toBeInTheDocument();
        expect(screen.getByText('Electrical')).toBeInTheDocument();
    });

    it('shows the empty state when the list is empty', () => {
        render(<DiagnosesClient initialRows={[]} />);
        expect(screen.getByText('No diagnoses yet.')).toBeInTheDocument();
    });

    it('shows a loading skeleton while the client fetch is in flight', async () => {
        let resolveLimit: (v: unknown) => void = () => {};
        const from = vi.fn(() => ({
            select: () => ({
                order: () => ({
                    order: () => ({
                        limit: () => new Promise((res) => { resolveLimit = res; }),
                    }),
                }),
            }),
        }));
        mocks.getSupabase.mockReturnValue({ from });
        const { container } = render(<DiagnosesClient />);
        expect(container.querySelector('.animate-pulse')).toBeTruthy();
        resolveLimit({ data: [], error: null });
        await waitFor(() => expect(screen.getByText('No diagnoses yet.')).toBeInTheDocument());
    });

    it('loads rows from Supabase when no initialRows are provided', async () => {
        mocks.getSupabase.mockReturnValue(
            makeSupabase({ selectResult: { data: rows, error: null } }),
        );
        render(<DiagnosesClient />);
        expect(await screen.findByText('Leaking geyser')).toBeInTheDocument();
    });

    it('shows an error message when the Supabase fetch fails', async () => {
        mocks.getSupabase.mockReturnValue(
            makeSupabase({ selectResult: { data: null, error: { message: 'boom' } } }),
        );
        render(<DiagnosesClient />);
        expect(await screen.findByText('We could not load your diagnoses.')).toBeInTheDocument();
    });

    it('filters the list by the search query', async () => {
        const user = userEvent.setup();
        render(<DiagnosesClient initialRows={rows} />);
        await screen.findByText('Leaking geyser');
        await user.type(screen.getByPlaceholderText('Search Diagnoses'), 'geyser');
        expect(screen.getByText('Leaking geyser')).toBeInTheDocument();
        expect(screen.queryByText('Tripping DB board')).not.toBeInTheDocument();
    });

    it('shows a no-results message when the search matches nothing', async () => {
        const user = userEvent.setup();
        render(<DiagnosesClient initialRows={rows} />);
        await screen.findByText('Leaking geyser');
        await user.type(screen.getByPlaceholderText('Search Diagnoses'), 'zzzzz');
        expect(screen.getByText(/No results for/i)).toBeInTheDocument();
    });

    it('navigates to the report when a row is clicked', async () => {
        const user = userEvent.setup();
        render(<DiagnosesClient initialRows={rows} />);
        const title = await screen.findByText('Leaking geyser');
        await user.click(title);
        expect(mocks.push).toHaveBeenCalledWith('/report/d1');
    });

    it('opens the delete confirmation and deletes the row on confirm', async () => {
        const user = userEvent.setup();
        const supabase = makeSupabase({ deleteResult: { error: null } });
        mocks.getSupabase.mockReturnValue(supabase);
        render(<DiagnosesClient initialRows={rows} />);
        await screen.findByText('Leaking geyser');

        // Rows render pinned-first, so the first "More options" button belongs
        // to the pinned row (d2 — "Tripping DB board"); that is the row deleted.
        const moreButtons = screen.getAllByRole('button', { name: /more options/i });
        await user.click(moreButtons[0]);
        await user.click(await screen.findByText('Delete'));

        const dialog = await screen.findByRole('alertdialog');
        await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

        await waitFor(() =>
            expect(mocks.toastSuccess).toHaveBeenCalledWith('Diagnosis deleted.'),
        );
        await waitFor(() => expect(screen.queryByText('Tripping DB board')).not.toBeInTheDocument());
        // The other row stays.
        expect(screen.getByText('Leaking geyser')).toBeInTheDocument();
    });

    it('toggles the pin state when the star button is clicked', async () => {
        const user = userEvent.setup();
        mocks.getSupabase.mockReturnValue(makeSupabase({ updateResult: { error: null } }));
        render(<DiagnosesClient initialRows={rows} />);
        await screen.findByText('Leaking geyser');

        // d1 is unpinned, so its button is labeled exactly "Star diagnosis".
        const starButton = screen.getByRole('button', { name: 'Star diagnosis' });
        await user.click(starButton);
        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Pinned.'));
    });

    it('shows a pin error toast when the update fails', async () => {
        const user = userEvent.setup();
        mocks.getSupabase.mockReturnValue(
            makeSupabase({ updateResult: { error: { message: 'nope' } } }),
        );
        render(<DiagnosesClient initialRows={rows} />);
        await screen.findByText('Leaking geyser');
        const starButton = screen.getByRole('button', { name: 'Star diagnosis' });
        await user.click(starButton);
        await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Could not update pin.'));
    });
});
