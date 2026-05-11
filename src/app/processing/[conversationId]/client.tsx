'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { runDiagnosisProcessingPipeline, type ProcessingStepUpdate } from '@/features/diagnosis/processing-orchestrator';
import { patchConversation } from '@/lib/diagnoses-api';
import { useAuth } from '@/context/auth-context';
import { getPendingDiagnosisImages } from '@/lib/pending-diagnosis-images-cache';

const BASE_PROCESSING_STEPS = ['Saving Request', 'Generating Diagnosis'];
const WESTERN_CAPE_ERROR = 'Please use a location in the Western Cape, South Africa.';

export default function ProcessingPageClient({ conversationId }: { conversationId: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const [stepIndex, setStepIndex] = useState(0);
    const [hasImage, setHasImage] = useState(false);
    const [fatalError, setFatalError] = useState<string | null>(null);

    const requestedLocation = searchParams.get('location')?.trim() ?? '';
    const shouldFindContractors = Boolean(requestedLocation);
    const processingSteps = [
        ...BASE_PROCESSING_STEPS.slice(0, 1),
        ...(hasImage ? ['Reviewing Photo Evidence'] : []),
        ...BASE_PROCESSING_STEPS.slice(1),
        ...(shouldFindContractors ? ['Preparing Nearby Contractor Matches'] : []),
    ];

    const activeStep = processingSteps[Math.min(stepIndex, processingSteps.length - 1)] ?? 'Processing Diagnosis';

    const stepKeyToIndex = useMemo(() => {
        const map = new Map<string, number>();
        let idx = 0;
        map.set('uploadConfirmed', idx++);
        if (hasImage) map.set('imageThoughtComplete', idx++);
        map.set('fullDiagnosisComplete', idx++);
        if (shouldFindContractors) {
            map.set('prefetchQueued', idx);
            map.set('prefetchSkipped', idx);
        }
        return map;
    }, [hasImage, shouldFindContractors]);

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

    useEffect(() => {
        try {
            const imageUrl = sessionStorage.getItem(`pending_diagnosis_image_url:${conversationId}`) ?? '';
            setHasImage(Boolean(imageUrl.trim()));
        } catch {
            setHasImage(false);
        }
    }, [conversationId]);

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
                imageUrl = sessionStorage.getItem(`pending_diagnosis_image_url:${conversationId}`);
                imageUrls = JSON.parse(
                    sessionStorage.getItem(`pending_diagnosis_image_urls:${conversationId}`) ?? '[]'
                ) as string[];
                if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
                    imageUrls = getPendingDiagnosisImages(conversationId);
                }
                prompt = sessionStorage.getItem(`pending_diagnosis_prompt:${conversationId}`) ?? '';
                trade = sessionStorage.getItem(`pending_diagnosis_trade:${conversationId}`);
                if (!rawLocation) {
                    rawLocation = sessionStorage.getItem(`pending_diagnosis_location:${conversationId}`) ?? '';
                }
            } catch {
                // ignore storage errors
            }

            if (prompt.trim().length < 25 && !(trade?.trim() ?? '')) {
                if (!cancelled) setFatalError('Please describe the issue or select a service before continuing.');
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
                    initial_image_description: prompt.trim() || null,
                    customer_address: resolvedAddress,
                    diagnosis: null,
                });
            } catch {
                // Non-blocking; pipeline can still proceed and persist diagnosis.
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
                    if (resolvedAddress) qp.set('location', resolvedAddress);
                    const suffix = qp.toString() ? `?${qp.toString()}` : '';
                    router.replace(`/diagnosis/${encodeURIComponent(conversationId)}${suffix}`);
                }
            } catch (error) {
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : 'Something went wrong.';
                    setFatalError(message);
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [conversationId, geocodeInWesternCape, requestedLocation, router, stepKeyToIndex, user?.id]);

    return (
        <div className="flex h-dvh flex-col overflow-hidden">
            <main className="flex-1 p-6">
                <div className="flex flex-col gap-6 h-full w-full max-w-sm mx-auto justify-center">
                    <div className="flex flex-col gap-3 text-center w-full">
                        <h1 className="text-2xl text-foreground font-semibold">Processing</h1>
                        <p className="text-sm text-muted-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc quis arcu at velit cursus mollis.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 items-center">
                        <div className="h-2 w-full rounded-sm bg-secondary overflow-hidden">
                            <motion.div
                                className="h-full rounded-sm bg-foreground"
                                initial={{ width: '0%' }}
                                animate={{ width: `${((stepIndex + 1) / processingSteps.length) * 100}%` }}
                                transition={{ duration: 0.45, ease: 'easeOut' }}
                            />
                        </div>
                        <p className="text-sm text-foreground font-medium">{activeStep}</p>
                        {fatalError ? (
                            <p className="text-xs text-destructive text-center">{fatalError}</p>
                        ) : null}
                    </div>
                </div>
            </main>
        </div>
    );
}
