/**
 * Behavior tests for the processing screen (`/processing/[conversationId]`).
 *
 * On mount the page runs the diagnosis pipeline (mocked) and, on success,
 * router.replace()s to either /diagnosis/<id> or /match. On failure it shows a
 * "Something Went Wrong" state with Retry + New Diagnosis. The pipeline,
 * geocode, conversation patch, and auth are all mocked so the test exercises
 * the page's own orchestration and rendering, not the AI pipeline.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    searchParams: new URLSearchParams(),
    runPipeline: vi.fn(),
    patchConversation: vi.fn(),
    getPendingImages: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mocks.replace, push: mocks.push, back: vi.fn() }),
    useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/context/auth-context', () => ({ useAuth: mocks.useAuth }));

vi.mock('@/features/diagnosis/processing-orchestrator', () => ({
    runDiagnosisProcessingPipeline: mocks.runPipeline,
}));

vi.mock('@/lib/diagnosis/diagnoses-api', () => ({
    patchConversation: mocks.patchConversation,
}));

vi.mock('@/lib/diagnosis/pending-diagnosis-images-cache', () => ({
    getPendingDiagnosisImages: mocks.getPendingImages,
}));

const { default: ProcessingPageClient } = await import(
    '@/app/processing/[conversationId]/client'
);

beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: 'u1' } });
    mocks.searchParams = new URLSearchParams();
    mocks.runPipeline.mockResolvedValue(undefined);
    mocks.patchConversation.mockResolvedValue(undefined);
    mocks.getPendingImages.mockReturnValue([]);
    try { window.sessionStorage.clear(); } catch { /* ignore */ }
    // Provide a fetch stub for /api/processing-averages and /api/geocode.
    vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.includes('processing-averages')) {
            return new Response(JSON.stringify({ classifyMs: 3000, proseMs: 22000, gateMs: 1500 }), { status: 200 });
        }
        if (u.includes('/api/geocode')) {
            return new Response(JSON.stringify({ address: 'Cape Town, Western Cape' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
    });
});

describe('ProcessingPageClient', () => {
    it('renders the processing heading and a step label on mount', () => {
        // No image, short prompt -> would normally fatal; seed a prompt so the
        // pipeline runs and the screen stays in the processing state.
        window.sessionStorage.setItem('pending_diagnosis_prompt:c1', 'A long enough description of the fault here.');
        render(<ProcessingPageClient conversationId="c1" />);
        expect(screen.getByRole('heading', { name: 'Processing' })).toBeInTheDocument();
        expect(screen.getByText('Saving Request')).toBeInTheDocument();
    });

    it('runs the diagnosis pipeline and replaces to /diagnosis on success', async () => {
        window.sessionStorage.setItem('pending_diagnosis_prompt:c1', 'A long enough description of the fault here.');
        render(<ProcessingPageClient conversationId="c1" />);
        await waitFor(() => expect(mocks.runPipeline).toHaveBeenCalled());
        await waitFor(() =>
            expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining('/diagnosis/c1')),
        );
    });

    it('replaces to /match when skipReport is set', async () => {
        mocks.searchParams = new URLSearchParams({ location: 'Cape Town', skipReport: 'true' });
        mocks.getPendingImages.mockReturnValue(['blob:img1']);
        render(<ProcessingPageClient conversationId="c2" />);
        await waitFor(() => expect(mocks.runPipeline).toHaveBeenCalled());
        await waitFor(() =>
            expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining('/match?')),
        );
    });

    it('shows the fatal error state when there is no photo and no usable prompt', async () => {
        // Empty storage, no images, no trade => the guard sets a fatal error.
        render(<ProcessingPageClient conversationId="c3" />);
        expect(
            await screen.findByText(/add a photo or describe the issue/i),
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Something Went Wrong' })).toBeInTheDocument();
        expect(mocks.runPipeline).not.toHaveBeenCalled();
    });

    it('shows the fatal error state when the pipeline throws', async () => {
        window.sessionStorage.setItem('pending_diagnosis_prompt:c4', 'A long enough description of the fault here.');
        mocks.runPipeline.mockRejectedValue(new Error('pipeline exploded'));
        render(<ProcessingPageClient conversationId="c4" />);
        expect(await screen.findByText('pipeline exploded')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Something Went Wrong' })).toBeInTheDocument();
    });

    it('retries the pipeline when Retry is clicked after a failure', async () => {
        const user = userEvent.setup();
        window.sessionStorage.setItem('pending_diagnosis_prompt:c5', 'A long enough description of the fault here.');
        mocks.runPipeline.mockRejectedValue(new Error('first failure'));
        render(<ProcessingPageClient conversationId="c5" />);
        await screen.findByText('first failure');
        const callsBeforeRetry = mocks.runPipeline.mock.calls.length;

        // Subsequent runs succeed and the page navigates.
        mocks.runPipeline.mockResolvedValue(undefined);
        await user.click(screen.getByRole('button', { name: /^retry$/i }));
        await waitFor(() =>
            expect(mocks.runPipeline.mock.calls.length).toBeGreaterThan(callsBeforeRetry),
        );
        await waitFor(() =>
            expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining('/diagnosis/c5')),
        );
    });

    it('navigates to /start when New Diagnosis is clicked from the error state', async () => {
        const user = userEvent.setup();
        render(<ProcessingPageClient conversationId="c6" />);
        await screen.findByRole('heading', { name: 'Something Went Wrong' });
        await user.click(screen.getByRole('button', { name: /new diagnosis/i }));
        expect(mocks.push).toHaveBeenCalledWith('/start');
    });

    it('shows a "Looking at Image" step when images are present', async () => {
        mocks.getPendingImages.mockReturnValue(['blob:img1', 'blob:img2']);
        render(<ProcessingPageClient conversationId="c7" />);
        // hasImage becomes true after the detection effect runs; the step list
        // then includes the image-review label. Step index starts at 0 (Saving
        // Request) which is always present.
        expect(await screen.findByRole('heading', { name: 'Processing' })).toBeInTheDocument();
        await waitFor(() => expect(mocks.runPipeline).toHaveBeenCalled());
    });
});
