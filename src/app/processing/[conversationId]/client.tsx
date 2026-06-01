'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { runDiagnosisProcessingPipeline, type ProcessingStepUpdate } from '@/features/diagnosis/processing-orchestrator';
import { patchConversation } from '@/lib/diagnosis/diagnoses-api';
import { useAuth } from '@/context/auth-context';
import { getPendingDiagnosisImages } from '@/lib/diagnosis/pending-diagnosis-images-cache';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { FlowTopBar } from '@/components/match/flow-shell';
import { BRAND_NAME } from '@/lib/brand-system';

const WESTERN_CAPE_ERROR = 'Please use a location in the Western Cape, South Africa.';

// How long (ms) we dwell on each "Looking at Image N" label before advancing.
// Gemini's multi-image attention takes ~2–3s per photo for the review prompt;
// 2500 ms keeps the label rotation roughly aligned with reality without
// promising more precision than we have.
const IMAGE_ROTATION_MS = 2500;

export default function ProcessingPageClient({ conversationId }: { conversationId: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const [stepIndex, setStepIndex] = useState(0);
    const [hasImage, setHasImage] = useState(false);
    const [imageCount, setImageCount] = useState(0);
    const [currentImageIdx, setCurrentImageIdx] = useState(1);
    const [fatalError, setFatalError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    const requestedLocation = searchParams.get('location')?.trim() ?? '';
    const skipReport = searchParams.get('skipReport') === 'true';
    const shouldFindContractors = Boolean(requestedLocation);

    // Step copy is title-case, no terminal ellipsis. The image step is
    // computed dynamically so the rotating "Looking at Image N" label flows
    // through the same array as the static steps.
    // Display steps with "Reading Description" inserted between save and image
    // review. The reading-description step has no backend event — it's a UX
    // gesture that the description is being parsed alongside the photos.
    const processingSteps = useMemo(
        () => [
            'Saving Request',
            'Reading Description',
            ...(hasImage ? [`Looking at Image ${currentImageIdx}`] : []),
            'Writing Diagnosis',
            ...(shouldFindContractors ? ['Finding Nearby Contractors'] : []),
        ],
        [hasImage, currentImageIdx, shouldFindContractors]
    );

    const activeStep =
        processingSteps[Math.min(stepIndex, processingSteps.length - 1)] ?? 'Processing';

    const stepKeyToIndex = useMemo(() => {
        const map = new Map<string, number>();
        // Reading Description (index 1) has no backend event — a timer advances
        // through it. The image step lands at index 2 (or skips when no image),
        // the diagnosis step shifts accordingly, and contractor matching lands
        // last.
        map.set('uploadConfirmed', 0);
        if (hasImage) map.set('imageThoughtComplete', 2);
        map.set('fullDiagnosisComplete', hasImage ? 3 : 2);
        if (shouldFindContractors) {
            const finalIdx = hasImage ? 4 : 3;
            map.set('prefetchQueued', finalIdx);
            map.set('prefetchSkipped', finalIdx);
        }
        return map;
    }, [hasImage, shouldFindContractors]);

    // Synthetic dwell on "Saving Request" → "Reading Description". Backend
    // events override this if they fire faster.
    useEffect(() => {
        if (stepIndex !== 0) return;
        const id = setTimeout(() => {
            setStepIndex((prev) => Math.max(prev, 1));
        }, 800);
        return () => clearTimeout(id);
    }, [stepIndex]);

    const geocodeInWesternCape = useCallback(async (address: string) => {
        try {
            const res = await fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, westernCapeOnly: true }),
            });
            const data = (await res.json().catch(() => null)) as {
                address?: string;
                error?: string;
            } | null;
            if (!res.ok) return { address: null, error: data?.error || WESTERN_CAPE_ERROR };
            return {
                address:
                    typeof data?.address === 'string' && data.address.trim()
                        ? data.address.trim()
                        : null,
                error: null,
            };
        } catch {
            return { address: null, error: 'Could not validate this location.' };
        }
    }, []);

    // Detect how many photos we're about to look at. Prefer the in-memory
    // cache (always complete); fall back to sessionStorage for refresh paths.
    useEffect(() => {
        try {
            const inMemory = getPendingDiagnosisImages(conversationId);
            if (inMemory.length > 0) {
                setHasImage(true);
                setImageCount(inMemory.length);
                return;
            }
            const stored = sessionStorage.getItem(`pending_diagnosis_image_urls:${conversationId}`);
            const parsed = stored ? (JSON.parse(stored) as unknown) : [];
            const arr = Array.isArray(parsed)
                ? (parsed as string[]).filter((x) => typeof x === 'string' && x.trim().length > 0)
                : [];
            if (arr.length > 0) {
                setHasImage(true);
                setImageCount(arr.length);
                return;
            }
            const single =
                sessionStorage.getItem(`pending_diagnosis_image_url:${conversationId}`) ?? '';
            if (single.trim()) {
                setHasImage(true);
                setImageCount(1);
                return;
            }
            setHasImage(false);
            setImageCount(0);
        } catch {
            setHasImage(false);
            setImageCount(0);
        }
    }, [conversationId]);

    // Rotate the "Looking at Image N" label across the photo-review step.
    // The backend signals image completion as one atomic event, so the
    // rotation is a UX gesture, not real per-image progress.
    const isOnImageStep = hasImage && stepIndex === 1;
    useEffect(() => {
        if (!isOnImageStep) {
            // Reset on entry/exit so a retry starts at Image 1.
            setCurrentImageIdx(1);
            return;
        }
        if (imageCount <= 1) return;
        const id = setInterval(() => {
            setCurrentImageIdx((prev) => Math.min(prev + 1, imageCount));
        }, IMAGE_ROTATION_MS);
        return () => clearInterval(id);
    }, [isOnImageStep, imageCount]);

    useEffect(() => {
        let cancelled = false;

        const onStep = (u: ProcessingStepUpdate) => {
            if (cancelled) return;
            if (u.status !== 'running' && u.status !== 'done') return;
            const idx = stepKeyToIndex.get(u.key);
            if (idx !== undefined) {
                setStepIndex((prev) => Math.max(prev, idx));
            }
        };

        const run = async () => {
            let imageUrl: string | null = null;
            let imageUrls: string[] = [];
            let prompt = '';
            let trade: string | null = null;
            let rawLocation = requestedLocation;

            try {
                const inMemoryImages = getPendingDiagnosisImages(conversationId);
                if (inMemoryImages.length > 0) {
                    imageUrls = inMemoryImages;
                    imageUrl = inMemoryImages[0] ?? null;
                } else {
                    imageUrl = sessionStorage.getItem(`pending_diagnosis_image_url:${conversationId}`);
                    const stored = sessionStorage.getItem(`pending_diagnosis_image_urls:${conversationId}`);
                    const parsed = stored ? (JSON.parse(stored) as unknown) : [];
                    imageUrls = Array.isArray(parsed)
                        ? (parsed as string[]).filter((x) => typeof x === 'string' && x.trim().length > 0)
                        : [];
                }
                prompt = sessionStorage.getItem(`pending_diagnosis_prompt:${conversationId}`) ?? '';
                trade = sessionStorage.getItem(`pending_diagnosis_trade:${conversationId}`);
                if (!rawLocation) {
                    rawLocation =
                        sessionStorage.getItem(`pending_diagnosis_location:${conversationId}`) ?? '';
                }
            } catch {
                // ignore storage errors
            }

            const hasImages = imageUrls.length > 0 || Boolean(imageUrl?.trim());
            if (!hasImages && prompt.trim().length < 25 && !(trade?.trim() ?? '')) {
                if (!cancelled)
                    setFatalError('Please add a photo or describe the issue before continuing.');
                return;
            }

            let resolvedAddress: string | null = null;
            if (rawLocation.trim()) {
                const geo = await geocodeInWesternCape(rawLocation.trim());
                if (geo.address) {
                    resolvedAddress = geo.address;
                }
            }

            try {
                await patchConversation(conversationId, {
                    image_url: imageUrl?.trim() || null,
                    image_urls:
                        imageUrls.length > 0
                            ? imageUrls
                            : imageUrl?.trim()
                              ? [imageUrl.trim()]
                              : [],
                    initial_image_description: prompt.trim() || null,
                    customer_address: resolvedAddress,
                    diagnosis: null,
                });
            } catch {
                // non-blocking
            }

            try {
                await runDiagnosisProcessingPipeline({
                    conversationId,
                    imageUrl: imageUrl?.trim() || null,
                    imageUrls: Array.isArray(imageUrls)
                        ? imageUrls.filter((x) => typeof x === 'string' && x.trim().length > 0)
                        : [],
                    prompt: prompt.trim(),
                    selectedService: trade?.trim() || null,
                    userId: user?.id ?? null,
                    onStep,
                });
                if (!cancelled) {
                    const qp = new URLSearchParams();
                    if (skipReport) {
                        qp.set('conversationId', conversationId);
                        if (resolvedAddress) qp.set('location', resolvedAddress);
                        router.replace(`/match?${qp.toString()}`);
                    } else {
                        if (resolvedAddress) qp.set('location', resolvedAddress);
                        const suffix = qp.toString() ? `?${qp.toString()}` : '';
                        router.replace(
                            `/diagnosis/${encodeURIComponent(conversationId)}${suffix}`
                        );
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    const message =
                        error instanceof Error ? error.message : 'Something went wrong.';
                    setFatalError(message);
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [
        conversationId,
        geocodeInWesternCape,
        requestedLocation,
        router,
        skipReport,
        stepKeyToIndex,
        user?.id,
        retryCount,
    ]);

    const handleRetry = useCallback(() => {
        setFatalError(null);
        setStepIndex(0);
        setCurrentImageIdx(1);
        setRetryCount((c) => c + 1);
    }, []);

    // Elapsed-time tracker. Resets when the user retries via setRetryCount.
    // TODO: when the pipeline starts writing per-step latencies to
    // public.ai_call_log, replace the hardcoded SECONDS_PER_STEP with a
    // rolling-average lookup served by /api/processing-averages.
    const [elapsedSec, setElapsedSec] = useState(0);
    useEffect(() => {
        setElapsedSec(0);
        const startedAt = Date.now();
        const id = setInterval(() => {
            setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        return () => clearInterval(id);
    }, [retryCount]);

    // Real averages fetched from /api/processing-averages. Falls back to
    // hardcoded values when the endpoint hasn't returned yet, when no rolling
    // data exists, or when the request fails.
    const [averagesMs, setAveragesMs] = useState<{
        classifyMs: number | null;
        proseMs: number | null;
        gateMs: number | null;
    } | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/processing-averages')
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled || !data) return;
                setAveragesMs({
                    classifyMs: data.classifyMs ?? null,
                    proseMs: data.proseMs ?? null,
                    gateMs: data.gateMs ?? null,
                });
            })
            .catch(() => {
                // Silent — fall back to hardcoded defaults.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const estimatedTotalSec = useMemo(() => {
        // Non-Gemini steps are sub-second; bake them in as constants.
        const SAVE_SEC = 1;
        const READ_SEC = 2;
        const MATCH_SEC = 8; // contractor prefetch — no Gemini call

        // Image gate runs per image, classify runs once, prose runs once.
        // Hardcoded fallbacks reflect typical observed values (rough guesses
        // until enough rolling data exists for confident averages).
        const gateSec = (averagesMs?.gateMs ?? 1500) / 1000;
        const classifySec = (averagesMs?.classifyMs ?? 3000) / 1000;
        const proseSec = (averagesMs?.proseMs ?? 22000) / 1000;

        return Math.round(
            SAVE_SEC +
                READ_SEC +
                imageCount * gateSec +
                classifySec +
                proseSec +
                (shouldFindContractors ? MATCH_SEC : 0)
        );
    }, [averagesMs, imageCount, shouldFindContractors]);

    const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec);
    const estimateLabel =
        remainingSec > 0 ? `About ${remainingSec}s Remaining` : 'Almost There';

    const handleBackToStart = useCallback(() => {
        router.push('/start');
    }, [router]);

    const header = (
        <FlowTopBar
            className="p-4"
            // Invisible spacer keeps the header row at size-10 (40px) so its
            // total height matches every other page in the flow. Without a
            // left/right slot the row would collapse since the centered title
            // is absolutely positioned.
            leftSlot={<div className="size-10" aria-hidden />}
            centerSlot={
                <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                    {BRAND_NAME}
                </p>
            }
        />
    );

    if (fatalError) {
        return (
            <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
                {header}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto">
                        <div className="flex min-h-full flex-col">
                            <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                                <div className="flex flex-col gap-8 w-full max-w-xl">
                                    <div className="flex w-full flex-col items-center gap-3 text-center">
                                        <h1 className="text-2xl font-semibold text-foreground">
                                            Something Went Wrong
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                        </p>
                                    </div>
                                    <p className="text-center text-xs text-muted-foreground">
                                        {fatalError}
                                    </p>
                                </div>
                            </div>

                            <div className="sticky bottom-0 shrink-0 bg-background p-4">
                                <div className="w-full max-w-xl mx-auto flex flex-col gap-4">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full text-muted-foreground"
                                        onClick={handleBackToStart}
                                    >
                                        New Diagnosis
                                    </Button>
                                    <div className="flex flex-col gap-2">
                                        <Button
                                            type="button"
                                            className="w-full"
                                            onClick={handleRetry}
                                        >
                                            Retry
                                        </Button>
                                        <p className="text-center text-xs text-muted-foreground">
                                            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {header}
            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                            <div className="flex flex-col gap-8 w-full max-w-xl">
                                <div className="flex w-full flex-col items-center gap-3 text-center">
                                    <h1 className="text-2xl font-semibold text-foreground">
                                        Processing
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                <div className="flex flex-col items-center gap-3">
                                    <Spinner className="size-8 text-muted-foreground" />
                                    <p className="text-sm font-medium text-foreground">
                                        {activeStep}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="sticky bottom-0 shrink-0 bg-background p-4">
                            {/* Inner h-10 mirrors the size-10 spacer in the
                                header, so chrome top + bottom are equal height. */}
                            <div className="flex h-10 items-center justify-center">
                                <p className="text-sm font-medium text-muted-foreground">
                                    {estimateLabel}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
