'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/analytics';
import { getScanSessionHandoff, clearScanSessionHandoff } from '@/features/diagnosis/scan-session-store';
import type { DiagnosisData, Provider } from '@/app/chat/components/types';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FlowStepHeader } from '@/components/flow-header';
import { toast } from 'sonner';
import { compressImage } from '@/lib/image-compression';
import { cn, sanitizeAiContent } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { DiagnosisMetaPanel } from '@/components/diagnosis-meta-panel';
import { DiagnosisLeaveDialog } from '@/components/diagnosis-leave-dialog';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/context/auth-context';
import { parseDiagnosisFromModelResponse } from '@/lib/parse-diagnosis-from-model-response';
import { BetaCostEstimateCard } from '@/components/beta-cost-estimate-card';

type DiagnosisPageClientProps = {
    conversationId: string;
};

type ConversationRow = {
    id: string;
    image_url: string | null;
    diagnosis: DiagnosisData | null;
    initial_image_description: string | null;
};

const URGENCY_LABELS: Record<string, string> = {
    immediate: 'Immediate',
    urgent: 'Urgent',
    soon: 'Soon',
    planned: 'Planned',
};

function providerHydrateSessionKey(id: string): string {
    return `scandio_provider_hydrate_done:${id}`;
}

export function DiagnosisPageClient({ conversationId }: DiagnosisPageClientProps) {
    const router = useRouter();
    const supabase = getSupabase();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
    const [serviceType, setServiceType] = useState<string | null>(null);
    const [initialPrompt, setInitialPrompt] = useState<string>('');
    const [serviceCatalog, setServiceCatalog] = useState<string[]>([]);
    const [refineText, setRefineText] = useState('');
    const [refineMode, setRefineMode] = useState(false);
    const [refining, setRefining] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const refineFileInputRef = useRef<HTMLInputElement | null>(null);
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
    const providersForDiagnoseRef = useRef<Provider[]>([]);

    const loadConversation = useCallback(
        async (id: string): Promise<ConversationRow | null> => {
            const { data, error } = await supabase
                .from('diagnoses')
                .select('id,image_url,diagnosis,initial_image_description')
                .eq('id', id)
                .maybeSingle();
            if (error) {
                if (process.env.NODE_ENV === 'development') {
                    // eslint-disable-next-line no-console
                    console.warn('[DiagnosisPage] loadConversation error', error);
                }
                return null;
            }
            if (!data) return null;
            return {
                id: data.id,
                image_url: (data as any).image_url ?? null,
                diagnosis: (data as any).diagnosis ?? null,
                initial_image_description: (data as any).initial_image_description ?? null,
            };
        },
        [supabase]
    );

    const saveConversationDiagnosis = useCallback(
        async (diag: DiagnosisData | null, img: string | null, prompt?: string) => {
            const deviceType =
                typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
                    ? 'mobile'
                    : 'desktop';
            try {
                await supabase
                    .from('diagnoses')
                    .upsert({
                        id: conversationId,
                        title: diag?.diagnosis || 'New Diagnosis',
                        image_url: img,
                        diagnosis: diag,
                        urgency_key: (diag?.urgency_key ?? null) as string | null,
                        initial_image_description: (prompt ?? '').trim() || null,
                        device: deviceType,
                        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                        // Needed for RLS isolation while using guest (anonymous) sessions.
                        user_id: user?.id ?? null,
                    })
                    .select('id')
                    .single();
            } catch {
                // Swallow persistence errors here; the user can still see the diagnosis.
            }
        },
        [conversationId, supabase, user?.id]
    );

    const maybeHydrateWithProviders = useCallback(
        async (diag: DiagnosisData, img: string, catalogIn: string[], userWords: string) => {
            const trade = diag.trade?.trim();
            if (!trade || trade === 'N/A') return;
            if (diag.requires_clarification || diag.rejected || diag.unserviced) return;
            try {
                if (sessionStorage.getItem(providerHydrateSessionKey(conversationId)) === '1') return;
            } catch {
                /* private mode */
            }
            let catalog = catalogIn;
            if (catalog.length === 0) {
                const { data } = await supabase
                    .from('services')
                    .select('label')
                    .eq('active', true)
                    .order('sort_order', { ascending: true });
                catalog = Array.isArray(data)
                    ? data
                          .map((r: { label?: unknown }) => String(r?.label ?? '').trim())
                          .filter((x: string) => x.length > 0)
                    : [];
            }
            if (catalog.length === 0) return;

            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 15000,
                        maximumAge: 300_000,
                    });
                });
                const { latitude: lat, longitude: lng } = pos.coords;
                const geocodeRes = await fetch('/api/geocode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat, lng }),
                });
                if (!geocodeRes.ok) return;

                const radius = 25_000;
                const provRes = await fetch('/api/providers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lat,
                        lng,
                        trade,
                        radius,
                    }),
                });
                const provData = await provRes.json().catch(() => ({}));
                if (!provRes.ok) return;
                const list = Array.isArray(provData.providers) ? (provData.providers as Provider[]) : [];
                if (list.length === 0) return;

                providersForDiagnoseRef.current = list;

                const res = await fetch('/api/diagnose', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image: img,
                        serviceCatalog: catalog,
                        providerHydration: true,
                        providers: list,
                        textQuery: userWords.trim() || undefined,
                        previousDiagnosis: {
                            diagnosis: diag.diagnosis,
                            trade: diag.trade,
                            trade_detail: diag.trade_detail ?? '',
                            message: diag.message ?? '',
                            action_required: diag.action_required ?? '',
                            estimated_cost: diag.estimated_cost ?? '',
                        },
                    }),
                });
                const text = await res.text();
                if (!res.ok) return;
                const newDiag = parseDiagnosisFromModelResponse(text);
                if (newDiag) {
                    setDiagnosis(newDiag);
                    await saveConversationDiagnosis(newDiag, img, userWords);
                }
                try {
                    sessionStorage.setItem(providerHydrateSessionKey(conversationId), '1');
                } catch {
                    /* ignore */
                }
            } catch {
                /* geolocation denied, network, or hydrate failed — keep original diagnosis */
            }
        },
        [conversationId, saveConversationDiagnosis, supabase]
    );

    const runInitialDiagnosis = useCallback(
        async (img: string, prompt: string, selectedService: string | null) => {
            try {
                let catalog = serviceCatalog;
                if (catalog.length === 0) {
                    const { data } = await supabase
                        .from('services')
                        .select('label')
                        .eq('active', true)
                        .order('sort_order', { ascending: true });
                    catalog = Array.isArray(data)
                        ? data
                              .map((r: any) => String(r?.label ?? '').trim())
                              .filter((x: string) => x.length > 0)
                        : [];
                    if (catalog.length > 0) setServiceCatalog(catalog);
                }
                if (catalog.length === 0) {
                    toast.error('Could not load services catalog.');
                    return null;
                }

                const body: Record<string, unknown> = {
                    image: img,
                    serviceCatalog: catalog,
                };
                if (prompt.trim()) body.textQuery = prompt.trim();
                if (selectedService) {
                    body.userSelectedTrade = {
                        trade: selectedService,
                        diagnosis: `${selectedService} services`,
                    };
                }
                const res = await fetch('/api/diagnose', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const text = await res.text();
                if (!res.ok) {
                    let errMsg = 'Failed to start analysis';
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed?.error) errMsg = parsed.error;
                    } catch {
                        // ignore
                    }
                    toast.error(errMsg);
                    return null;
                }
                const diag = parseDiagnosisFromModelResponse(text);
                if (!diag) {
                    toast.error('Could not understand the diagnosis response.');
                    return null;
                }
                setDiagnosis(diag);
                await saveConversationDiagnosis(diag, img, prompt);
                void maybeHydrateWithProviders(diag, img, catalog, prompt.trim());
                return diag;
            } catch (e) {
                if (process.env.NODE_ENV === 'development') {
                    // eslint-disable-next-line no-console
                    console.error('[DiagnosisPage] runInitialDiagnosis error', e);
                }
                toast.error("We couldn't start the diagnosis. Please try again.");
                return null;
            }
        },
        [maybeHydrateWithProviders, saveConversationDiagnosis, serviceCatalog, supabase]
    );

    const runRefinedDiagnosis = useCallback(
        async (extraText: string) => {
            if (!diagnosis || !imageSrc) return;
            setRefining(true);
            try {
                let catalog = serviceCatalog;
                if (catalog.length === 0) {
                    const { data } = await supabase
                        .from('services')
                        .select('label')
                        .eq('active', true)
                        .order('sort_order', { ascending: true });
                    catalog = Array.isArray(data)
                        ? data
                              .map((r: any) => String(r?.label ?? '').trim())
                              .filter((x: string) => x.length > 0)
                        : [];
                    if (catalog.length > 0) setServiceCatalog(catalog);
                }
                if (catalog.length === 0) {
                    toast.error('Could not load services catalog.');
                    return;
                }

                const body: Record<string, unknown> = {
                    image: imageSrc,
                    textQuery: [initialPrompt, extraText].filter(Boolean).join('\n\n'),
                    serviceCatalog: catalog,
                    previousDiagnosis: {
                        diagnosis: diagnosis.diagnosis,
                        trade: diagnosis.trade,
                        trade_detail: diagnosis.trade_detail,
                        message: diagnosis.message ?? '',
                        action_required: diagnosis.action_required,
                        estimated_cost: diagnosis.estimated_cost,
                    },
                };
                if (providersForDiagnoseRef.current.length > 0) {
                    body.providers = providersForDiagnoseRef.current;
                }
                const res = await fetch('/api/diagnose', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const text = await res.text();
                if (!res.ok) {
                    let errMsg = 'Failed to refine diagnosis';
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed?.error) errMsg = parsed.error;
                    } catch {
                        // ignore
                    }
                    toast.error(errMsg);
                    return;
                }
                const diag = parseDiagnosisFromModelResponse(text);
                if (!diag) {
                    toast.error('Could not understand the updated diagnosis.');
                    return;
                }
                setDiagnosis(diag);
                setRefineText('');
                await saveConversationDiagnosis(diag, imageSrc, initialPrompt);
                try {
                    sessionStorage.removeItem(providerHydrateSessionKey(conversationId));
                } catch {
                    /* ignore */
                }
                void maybeHydrateWithProviders(
                    diag,
                    imageSrc,
                    catalog,
                    [initialPrompt, extraText].filter(Boolean).join('\n\n').trim()
                );
            } catch (e) {
                if (process.env.NODE_ENV === 'development') {
                    // eslint-disable-next-line no-console
                    console.error('[DiagnosisPage] runRefinedDiagnosis error', e);
                }
                toast.error("We couldn't update the diagnosis. Please try again.");
            } finally {
                setRefining(false);
            }
        },
        [
            conversationId,
            diagnosis,
            imageSrc,
            initialPrompt,
            maybeHydrateWithProviders,
            saveConversationDiagnosis,
            serviceCatalog,
            supabase,
        ]
    );

    useEffect(() => {
        let cancelled = false;
        const loadServices = async () => {
            const { data } = await supabase
                .from('services')
                .select('label')
                .eq('active', true)
                .order('sort_order', { ascending: true });
            if (cancelled) return;
            const labels = Array.isArray(data)
                ? data
                      .map((r: any) => String(r?.label ?? '').trim())
                      .filter((x: string) => x.length > 0)
                : [];
            setServiceCatalog(labels);
        };
        void loadServices();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    const handleRefineUpload = useCallback(
        async (file: File) => {
            if (!file) return;
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            if (!isImage && !isVideo) return;
            try {
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64 = reader.result as string;
                    const finalDataUrl = isImage ? await compressImage(base64) : base64;
                    setImageSrc(finalDataUrl);
                };
                reader.readAsDataURL(file);
            } catch {
                toast.error('Could not process that file. Please try another photo or video.');
            }
        },
        []
    );

    useEffect(() => {
        let cancelled = false;
        const bootstrap = async () => {
            setLoading(true);
            try {
                const handoff = getScanSessionHandoff();
                if (
                    handoff &&
                    handoff.conversationId === conversationId &&
                    handoff.primaryAssetDataUrl
                ) {
                    clearScanSessionHandoff();
                    if (cancelled) return;
                    setImageSrc(handoff.primaryAssetDataUrl);
                    setInitialPrompt(handoff.initialPrompt ?? '');
                    setServiceType(handoff.selectedService ?? null);
                    const diag = await runInitialDiagnosis(
                        handoff.primaryAssetDataUrl,
                        handoff.initialPrompt ?? '',
                        handoff.selectedService ?? null
                    );
                    if (!cancelled && !diag) {
                        // If diagnosis failed, send back to welcome so they can retry.
                        router.replace('/welcome');
                        return;
                    }
                    return;
                }

                // No handoff: try to load an existing conversation.
                const existing = await loadConversation(conversationId);
                if (cancelled) return;
                if (existing) {
                    setImageSrc(existing.image_url);
                    if (existing.initial_image_description) {
                        setInitialPrompt(existing.initial_image_description);
                    }
                    if (existing.diagnosis) {
                        const diag = {
                            ...existing.diagnosis,
                            urgency_key:
                                (existing.diagnosis.urgency_key ?? 'soon') as string,
                        };
                        setDiagnosis(diag);
                        setServiceType(diag.trade ?? null);
                        if (existing.image_url) {
                            const { data } = await supabase
                                .from('services')
                                .select('label')
                                .eq('active', true)
                                .order('sort_order', { ascending: true });
                            const labels = Array.isArray(data)
                                ? data
                                      .map((r: { label?: unknown }) =>
                                          String(r?.label ?? '').trim()
                                      )
                                      .filter((x: string) => x.length > 0)
                                : [];
                            if (!cancelled && labels.length > 0) {
                                void maybeHydrateWithProviders(
                                    diag,
                                    existing.image_url,
                                    labels,
                                    existing.initial_image_description ?? ''
                                );
                            }
                        }
                    } else if (existing.image_url) {
                        await runInitialDiagnosis(
                            existing.image_url,
                            existing.initial_image_description ?? '',
                            null
                        );
                    }
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void bootstrap();
        return () => {
            cancelled = true;
        };
    }, [conversationId, loadConversation, maybeHydrateWithProviders, router, runInitialDiagnosis, supabase]);

    const handleConfirmYes = async () => {
        if (!diagnosis) return;
        setConfirming(true);
        try {
            // Count the diagnosis as completed only when the user confirms and proceeds to match.
            trackEvent('diagnosis_complete', { diagnosis_id: conversationId });
            await saveConversationDiagnosis(diagnosis, imageSrc, initialPrompt);
            const key = `pending_diagnosis_image_url:${conversationId}`;
            try {
                sessionStorage.removeItem(key);
            } catch {}
            try {
                localStorage.removeItem(key);
            } catch {}
            router.push(`/match/${encodeURIComponent(conversationId)}`);
        } finally {
            setConfirming(false);
        }
    };

    const guidanceText = (() => {
        if (!diagnosis) return '';
        const cleanedMessage = sanitizeAiContent(diagnosis.message ?? '').trim();
        if (diagnosis.requires_clarification || diagnosis.rejected) {
            if (cleanedMessage) return cleanedMessage;
            return `To refine this diagnosis, add more detail below and, if possible, upload clearer photos showing the full context of the issue.`;
        }
        return diagnosis.thinking || cleanedMessage || '';
    })();

    const tallStickyFooter =
        diagnosis &&
        (diagnosis.requires_clarification || diagnosis.rejected || refineMode);

    return (
        <main className="flex min-h-screen flex-col bg-background">
            <FlowStepHeader step={2} onBack={() => setLeaveDialogOpen(true)} />

            <DiagnosisLeaveDialog
                open={leaveDialogOpen}
                onOpenChange={setLeaveDialogOpen}
                onLeave={() => router.back()}
            />

            <div
                className={cn(
                    'mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-24 sm:px-6',
                    tallStickyFooter
                        ? 'pb-[calc(15rem+env(safe-area-inset-bottom))]'
                        : 'pb-[calc(7rem+env(safe-area-inset-bottom))]'
                )}
            >
                <section className="flex flex-1 flex-col gap-6">
                    <header className="flex flex-col gap-2">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            Here&apos;s what we found.
                        </h1>
                        <p className="text-base text-muted-foreground">
                            Confirm this looks right, or add more context and we&apos;ll refine it. Once you&apos;re happy we&apos;ll match you with nearby specialists.
                        </p>
                    </header>

                    {loading && !diagnosis && (
                        <div className="mt-4 flex flex-1 items-center justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                <p className="text-sm text-muted-foreground">
                                    Analysing Home Maintenance Issue...
                                </p>
                            </div>
                        </div>
                    )}

                    {!loading && !imageSrc && !diagnosis && (
                        <div className="mt-4 flex flex-1 items-center justify-center">
                            <div className="space-y-3 text-center">
                                <p className="text-sm font-medium text-foreground">
                                    We couldn&apos;t find this diagnosis.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Please start again from the welcome step.
                                </p>
                                <Button size="sm" onClick={() => router.push('/welcome')}>
                                    Back to welcome
                                </Button>
                            </div>
                        </div>
                    )}

                    {(imageSrc || diagnosis) && (
                        <section aria-label="Photo and diagnosis" className="space-y-3">
                            <div className="space-y-3">
                                <DiagnosisMetaPanel
                                    trade={serviceType ?? diagnosis?.trade ?? 'Not specified'}
                                    tradeDetail={diagnosis?.trade_detail}
                                    urgencyKey={String(diagnosis?.urgency_key ?? 'soon')}
                                    urgencyLabel={
                                        URGENCY_LABELS[String(diagnosis?.urgency_key ?? 'soon')] ?? 'Soon'
                                    }
                                />
                                <p className="text-sm text-foreground -mt-1">
                                    {initialPrompt.trim() ? initialPrompt.trim() : ''}
                                </p>
                            </div>
                            {imageSrc && (
                                <div className="relative w-full overflow-hidden rounded-lg border border-input/50 bg-background">
                                    <div className="aspect-[4/5] w-full">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={imageSrc}
                                            className="h-full w-full rounded-lg object-cover"
                                        />
                                    </div>
                                </div>
                            )}
                            {guidanceText && (
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        {guidanceText}
                                    </p>

                                </div>
                            )}
                            {diagnosis && (
                                <div>
                                    <h2 className="text-xl font-semibold">
                                        {diagnosis.diagnosis || 'Estimated Diagnosis'}
                                    </h2>
                                    {diagnosis.action_required && (
                                        <p className="text-sm text-foreground mt-2">
                                            {diagnosis.action_required}
                                        </p>
                                    )}
                                    {!diagnosis.requires_clarification &&
                                    !diagnosis.rejected &&
                                    !diagnosis.unserviced ? (
                                        <div className="mt-4">
                                            <BetaCostEstimateCard diagnosis={diagnosis} />
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </section>
                    )}

                    {/* refine input is handled in the sticky footer when refine mode is active */}
                </section>
            </div>

            {diagnosis && !diagnosis.requires_clarification && !diagnosis.rejected && !refineMode && (
                <footer className="fixed inset-x-0 bottom-0 z-40 bg-background/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
                    <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                className="flex-1"
                                onClick={() => setRefineMode(true)}
                            >
                                Refine
                            </Button>
                            <Button
                                type="button"
                                size="lg"
                                className="flex-1"
                                onClick={handleConfirmYes}
                                disabled={confirming}
                            >
                                {confirming ? 'Saving…' : 'Continue'}
                            </Button>
                        </div>
                    </div>
                </footer>
            )}

            {diagnosis && (diagnosis.requires_clarification || diagnosis.rejected || refineMode) && (
                <footer className="fixed inset-x-0 bottom-0 z-40 bg-background/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
                    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
                        <Label className="text-sm font-medium text-foreground">
                            Add more context
                        </Label>
                        <Textarea
                            value={refineText}
                            onChange={(e) => setRefineText(e.target.value)}
                            className="min-h-[80px] resize-none text-sm"
                            placeholder="Describe what else you're seeing or where it's located…"
                        />
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                className="flex-1"
                                onClick={() => {
                                    setRefineMode(false);
                                    setRefineText('');
                                }}
                                disabled={refining}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => refineFileInputRef.current?.click()}
                                disabled={refining}
                            >
                                Replace photo
                            </Button>
                            <Button
                                type="button"
                                size="lg"
                                className="flex-1"
                                onClick={() => runRefinedDiagnosis(refineText)}
                                disabled={refining || !refineText.trim()}
                            >
                                {refining ? 'Refining…' : 'Refine'}
                            </Button>
                        </div>
                        <input
                            ref={refineFileInputRef}
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleRefineUpload(file);
                                e.target.value = '';
                            }}
                        />
                    </div>
                </footer>
            )}
        </main>
    );
}
