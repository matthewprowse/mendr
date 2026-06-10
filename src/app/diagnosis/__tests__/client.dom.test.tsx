/**
 * Behavior tests for the diagnosis report page (`DiagnosisPageClient`).
 *
 * This composition root owns the page state and wires it into extracted hooks
 * (`useDiagnosisStream`, `useClarification`, `useRefinePhotos`) and the
 * presentational `DiagnosisResultView`. Those hooks and the result view are
 * mocked so the test exercises the parent's own logic: the leave-confirmation
 * dialog, the footer-shape branching (clarification CTA vs. Add Details +
 * Find Contractors vs. service-blocked), and the navigation to /match.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    back: vi.fn(),
    searchParams: new URLSearchParams(),
    useAuth: vi.fn(),
    getSupabase: vi.fn(),
    useDiagnosisStream: vi.fn(),
    useClarification: vi.fn(),
    useRefinePhotos: vi.fn(),
    writeMatchTradeContextStorage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, back: mocks.back, replace: vi.fn() }),
    useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/context/auth-context', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/lib/auth/supabase', () => ({ getSupabase: mocks.getSupabase }));
vi.mock('@/lib/diagnosis/match-trade-context', () => ({
    writeMatchTradeContextStorage: mocks.writeMatchTradeContextStorage,
}));

vi.mock('@/app/diagnosis/use-diagnosis-stream', () => ({
    useDiagnosisStream: mocks.useDiagnosisStream,
}));
vi.mock('@/app/diagnosis/use-clarification', () => ({
    useClarification: mocks.useClarification,
}));
vi.mock('@/app/diagnosis/use-refine-photos', () => ({
    useRefinePhotos: mocks.useRefinePhotos,
}));

// Presentational children — minimal probes.
vi.mock('@/app/diagnosis/diagnosis-result-view', () => ({
    DiagnosisResultView: ({ diagnosisHeadline }: { diagnosisHeadline: string }) => (
        <div data-testid="result-view">{diagnosisHeadline}</div>
    ),
}));
vi.mock('@/app/diagnosis/add-details-overlay', () => ({
    AddDetailsOverlay: () => <div data-testid="add-details-overlay" />,
}));
vi.mock('@/app/diagnosis/clarification-drawer', () => ({
    ClarificationDrawer: ({ open }: { open: boolean }) =>
        open ? <div data-testid="clarification-drawer" /> : null,
}));
vi.mock('@/app/diagnosis/photo-viewer', () => ({
    PhotoViewer: ({ open }: { open: boolean }) => (open ? <div data-testid="photo-viewer" /> : null),
}));
vi.mock('@/components/diagnosis-leave-dialog', () => ({
    DiagnosisLeaveDialog: ({ open, onLeave }: { open: boolean; onLeave: () => void }) =>
        open ? (
            <div data-testid="leave-dialog">
                <button type="button" onClick={onLeave}>
                    Leave
                </button>
            </div>
        ) : null,
}));
vi.mock('@/components/header-auth', () => ({ HeaderAuth: () => <div data-testid="header-auth" /> }));

const { default: DiagnosisPageClient } = await import('@/app/diagnosis/client');

/** Default clarification hook: no questions, so the standard footer renders. */
function setClarification(overrides: Record<string, unknown> = {}) {
    mocks.useClarification.mockReturnValue({
        hasClarificationQuestions: false,
        clarificationQuestionList: [],
        clarificationQuestionCount: 0,
        showClarificationFooter: false,
        answerQuestionsCtaCopy: 'Answer Three Questions',
        handleClarificationBatchSubmit: vi.fn(async () => {}),
        clarificationQuestions: [],
        clarificationAllAnswered: false,
        handleClarificationChoice: vi.fn(),
        ...overrides,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.useAuth.mockReturnValue({ user: null });
    mocks.getSupabase.mockReturnValue({});
    // The real stream hook flips the page out of its loading skeleton once the
    // diagnosis stream settles. We reproduce that by calling the injected
    // setters from within the mock so the footer (gated on !showSkeleton)
    // renders.
    mocks.useDiagnosisStream.mockImplementation((args: Record<string, unknown>) => {
        const setIsPageLoading = args.setIsPageLoading as (v: boolean) => void;
        const setIsDetailStageReady = args.setIsDetailStageReady as (v: boolean) => void;
        const setDiagnosisTitle = args.setDiagnosisTitle as (v: string) => void;
        const setTradeLabel = args.setTradeLabel as (v: string) => void;
        // The real hook settles the page out of its loading skeleton once the
        // stream completes. Reproduce that in a mount effect so we don't set
        // state during render (which would loop).
        useEffect(() => {
            setIsPageLoading(false);
            setIsDetailStageReady(true);
            setDiagnosisTitle('Leaking geyser valve');
            setTradeLabel('Plumbing');
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return { runInitialDiagnosis: vi.fn(async () => {}) };
    });
    mocks.useRefinePhotos.mockReturnValue({
        handleRefineSelectPhotos: vi.fn(),
        handleRefinePhotosSelected: vi.fn(),
        handleRefineRemovePhoto: vi.fn(),
        handleRemoveExistingPhoto: vi.fn(),
        handleRescanReport: vi.fn(),
    });
    setClarification();
    try { window.sessionStorage.clear(); } catch { /* ignore */ }
});

describe('DiagnosisPageClient', () => {
    it('renders the result view headline', () => {
        render(<DiagnosisPageClient conversationId="conv1" prefetchedConversation={null} />);
        expect(screen.getByTestId('result-view')).toBeInTheDocument();
    });

    it('opens the leave-confirmation dialog when the back button is clicked', async () => {
        const user = userEvent.setup();
        render(<DiagnosisPageClient conversationId="conv1" prefetchedConversation={null} />);
        await user.click(screen.getByRole('button', { name: /go back/i }));
        expect(screen.getByTestId('leave-dialog')).toBeInTheDocument();
    });

    it('calls router.back when the leave dialog confirms leaving', async () => {
        const user = userEvent.setup();
        render(<DiagnosisPageClient conversationId="conv1" prefetchedConversation={null} />);
        await user.click(screen.getByRole('button', { name: /go back/i }));
        await user.click(screen.getByRole('button', { name: /^leave$/i }));
        expect(mocks.back).toHaveBeenCalled();
    });

    it('renders the Add Details footer button in the standard (non-clarification) state', () => {
        render(<DiagnosisPageClient conversationId="conv1" prefetchedConversation={null} />);
        expect(screen.getByRole('button', { name: /add details/i })).toBeInTheDocument();
    });

    it('opens the Add Details overlay when the footer button is clicked', async () => {
        const user = userEvent.setup();
        render(<DiagnosisPageClient conversationId="conv1" prefetchedConversation={null} />);
        await user.click(screen.getByRole('button', { name: /add details/i }));
        expect(screen.getByTestId('add-details-overlay')).toBeInTheDocument();
    });

    it('shows the clarification CTA footer when questions are pending', () => {
        setClarification({
            hasClarificationQuestions: true,
            clarificationQuestionList: [
                { id: 'q1', question: 'Which is it?', options: ['a', 'b'] },
            ],
            clarificationQuestionCount: 1,
            showClarificationFooter: true,
            answerQuestionsCtaCopy: 'Answer One Question',
        });
        render(<DiagnosisPageClient conversationId="conv1" prefetchedConversation={null} />);
        expect(screen.getByRole('button', { name: /answer one question/i })).toBeInTheDocument();
        // The standard Add Details / Find Contractors footer is not rendered.
        expect(screen.queryByRole('button', { name: /find contractors/i })).not.toBeInTheDocument();
    });

    it('opens the clarification drawer when the clarification CTA is clicked', async () => {
        const user = userEvent.setup();
        setClarification({
            hasClarificationQuestions: true,
            clarificationQuestionList: [
                { id: 'q1', question: 'Which is it?', options: ['a', 'b'] },
            ],
            clarificationQuestionCount: 1,
            showClarificationFooter: true,
            answerQuestionsCtaCopy: 'Answer One Question',
        });
        render(<DiagnosisPageClient conversationId="conv1" prefetchedConversation={null} />);
        await user.click(screen.getByRole('button', { name: /answer one question/i }));
        expect(screen.getByTestId('clarification-drawer')).toBeInTheDocument();
    });

    it('renders the clarification drawer mounted but closed when no answers are open', () => {
        render(<DiagnosisPageClient conversationId="conv1" prefetchedConversation={null} />);
        // With an empty question list the drawer is closed (returns null in our stub).
        expect(screen.queryByTestId('clarification-drawer')).not.toBeInTheDocument();
    });

    it('renders the Find Contractors button and routes to /match when confident', async () => {
        const user = userEvent.setup();
        render(<DiagnosisPageClient conversationId="conv1" prefetchedConversation={null} />);
        const findBtn = await screen.findByRole('button', { name: /find contractors/i });
        expect(findBtn).toBeEnabled();
        await user.click(findBtn);
        expect(mocks.writeMatchTradeContextStorage).toHaveBeenCalled();
        expect(mocks.push).toHaveBeenCalledWith('/match/conv1');
    });

    it('shows the result view headline from the mock-clarify dev harness', () => {
        // In a non-production env, ?mockState=clarify seeds the page with a
        // "Need More Information" headline and opens the drawer.
        mocks.searchParams = new URLSearchParams({ mockState: 'clarify' });
        setClarification({
            hasClarificationQuestions: true,
            clarificationQuestionList: [
                { id: 'q1', question: 'Which is it?', options: ['a', 'b'] },
            ],
            clarificationQuestionCount: 3,
            showClarificationFooter: true,
        });
        render(<DiagnosisPageClient conversationId="conv1" />);
        expect(screen.getByTestId('result-view')).toBeInTheDocument();
    });
});
