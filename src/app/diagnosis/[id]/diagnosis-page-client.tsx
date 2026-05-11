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
import { enrichDiagnosisWithPartPrices } from '@/lib/parts-prices/enrich-diagnosis';
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
    const [sendingChip, setSendingChip] = useState(false);
    const [selectedChip, setSelectedChip] = useState<number | null>(null);
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
                    const enriched = await enrichDiagnosisWithPartPrices(newDiag);
                    setDiagnosis(enriched);
                    await saveConversationDiagnosis(enriched, img, userWords);
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
                const enriched = await enrichDiagnosisWithPartPrices(diag);
                setDiagnosis(enriched);
                await saveConversationDiagnosis(enriched, img, prompt);
                void maybeHydrateWithProviders(enriched, img, catalog, prompt.trim());
                return enriched;
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
                    diagnosisRejected: true,
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
                const enriched = await enrichDiagnosisWithPartPrices(diag);
                setDiagnosis(enriched);
                setRefineText('');
                await saveConversationDiagnosis(enriched, imageSrc, initialPrompt);
                try {
                    sessionStorage.removeItem(providerHydrateSessionKey(conversationId));
                } catch {
                    /* ignore */
                }
                void maybeHydrateWithProviders(
                    enriched,
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
                        router.replace('/start');
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

    const hasClarificationChips =
        diagnosis?.requires_clarification &&
        Array.isArray(diagnosis?.clarification_questions) &&
        (diagnosis.clarification_questions?.length ?? 0) > 0;

    const tallStickyFooter =
        diagnosis &&
        (diagnosis.requires_clarification || diagnosis.rejected || refineMode);

    return (
        <div
            className="flex h-dvh flex-col overflow-hidden overscroll-none"
            style={{ background: '#FBFAF7' }}
        >
            <FlowStepHeader
                layout="inline"
                showScanProgress
                step={2}
                onBack={() => setLeaveDialogOpen(true)}
            />

            <DiagnosisLeaveDialog
                open={leaveDialogOpen}
                onOpenChange={setLeaveDialogOpen}
                onLeave={() => router.back()}
            />

            <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col overflow-hidden">
                <div
                    className={cn(
                        'min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 sm:px-6',
                        tallStickyFooter ? 'pb-2' : ''
                    )}
                >
                    <section className="flex flex-col gap-6">
                        <header className="flex flex-col gap-2">
                            <h1
                                className="text-2xl font-semibold leading-snug sm:text-[1.75rem]"
                                style={{ color: '#16120E' }}
                            >
                                Here&apos;s what we found.
                            </h1>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                Confirm this looks right, or add more context and we&apos;ll refine it.
                                Once you&apos;re happy we&apos;ll match you with nearby specialists.
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
                                    Please start a new diagnosis.
                                </p>
                                <Button size="sm" onClick={() => router.push('/start')}>
                                    Start new diagnosis
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
                                <div className="relative w-full overflow-hidden rounded-2xl border border-black/[0.08] bg-white/80 shadow-sm">
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
                                    <h2
                                        className="text-xl font-semibold leading-snug"
                                        style={{ color: '#16120E' }}
                                    >
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
            </main>

            {/* ── Standard footer: confident diagnosis, no refine mode ── */}
            {diagnosis && !diagnosis.requires_clarification && !diagnosis.rejected && !refineMode && (
                <footer
                    className="shrink-0 border-t border-black/[0.06] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6"
                    style={{ background: 'rgba(251,250,247,0.95)' }}
                >
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

            {/* ── Clarification footer: A / B / C / D option buttons ── */}
            {diagnosis && diagnosis.requires_clarification && !diagnosis.rejected && (
                <footer
                    className="shrink-0 border-t border-black/[0.06] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6"
                    style={{ background: 'rgba(251,250,247,0.98)' }}
                >
                    <div className="mx-auto flex w-full max-w-xl flex-col gap-1.5">

                        {/* Lettered option buttons */}
                        {hasClarificationChips &&
                            diagnosis.clarification_questions!.slice(0, 4).map((option, i) => {
                                const letter = (['A', 'B', 'C', 'D'] as const)[i]!;
                                const isSelected = selectedChip === i;
                                const isLoading = isSelected && (refining || sendingChip);
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        disabled={refining || sendingChip}
                                        onClick={async () => {
                                            setSelectedChip(i);
                                            setSendingChip(true);
                                            try {
                                                await runRefinedDiagnosis(option);
                                            } finally {
                                                setSendingChip(false);
                                                setSelectedChip(null);
                                            }
                                        }}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-all duration-150',
                                            'disabled:pointer-events-none disabled:opacity-60',
                                            isSelected
                                                ? 'border-foreground/30 bg-foreground/5'
                                                : 'border-border bg-background hover:border-foreground/20 hover:bg-accent/50 active:scale-[0.99]'
                                        )}
                                    >
                                        {/* Letter badge */}
                                        <span
                                            className={cn(
                                                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors',
                                                isSelected
                                                    ? 'border-foreground bg-foreground text-background'
                                                    : 'border-border bg-muted text-muted-foreground'
                                            )}
                                        >
                                            {isLoading ? (
                                                <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                                            ) : (
                                                letter
                                            )}
                                        </span>
                                        <span className="text-sm font-medium text-foreground">
                                            {option}
                                        </span>
                                    </button>
                                );
                            })}

                        {/* Freeform escape-hatch row */}
                        <div className="flex items-center gap-2 pt-1">
                            <input
                                type="text"
                                value={refineText}
                                onChange={(e) => setRefineText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && refineText.trim()) {
                                        e.preventDefault();
                                        const text = refineText;
                                        setRefineText('');
                                        setSendingChip(true);
                                        void runRefinedDiagnosis(text).finally(() =>
                                            setSendingChip(false)
                                        );
                                    }
                                }}
                                placeholder="Or describe it yourself…"
                                disabled={refining || sendingChip}
                                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                            />
                            {refineText.trim() ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={refining || sendingChip}
                                    onClick={() => {
                                        const text = refineText;
                                        setRefineText('');
                                        setSendingChip(true);
                                        void runRefinedDiagnosis(text).finally(() =>
                                            setSendingChip(false)
                                        );
                                    }}
                                >
                                    {refining || sendingChip ? 'Sending…' : 'Send'}
                                </Button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => refineFileInputRef.current?.click()}
                                    disabled={refining || sendingChip}
                                    aria-label="Replace photo"
                                    title="Replace photo"
                                    className="shrink-0 rounded-lg border border-border bg-background p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                                        <path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM48,48H208v77.38l-26.69-26.69a16,16,0,0,0-22.62,0L113,145,89.38,121.38a16,16,0,0,0-22.62,0L48,139.71Zm0,160V163.31l32-32,24,24,0,0L145.37,208ZM208,208H171.31l-56-56,46.35-46.35L208,186.69Z"/>
                                    </svg>
                                </button>
                            )}
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

            {/* ── Rejected / refine mode footer ── */}
            {diagnosis && (diagnosis.rejected || (!diagnosis.requires_clarification && refineMode)) && (
                <footer
                    className="shrink-0 border-t border-black/[0.06] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6"
                    style={{ background: 'rgba(251,250,247,0.95)' }}
                >
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
        </div>
    );
}
