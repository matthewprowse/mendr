'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/analytics';
import { getScanSessionHandoff, clearScanSessionHandoff } from '@/features/diagnosis/scan-session-store';
import type { DiagnosisData } from '@/app/chat/components/types';
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
import { fetchConversationDiagnosis, patchConversation } from '@/lib/diagnoses-api';
import { writeMatchTradeContextStorage } from '@/lib/match-trade-context';

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

function parseDiagnosisFromResponse(text: string): DiagnosisData | null {
    const jsonBlockMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
    const candidate = jsonBlockMatch?.[1] ?? text;
    // Try to find the first balanced JSON object if there is surrounding text.
    const braceMatch = candidate.match(/\{[\s\S]*\}/);
    const toParse = braceMatch ? braceMatch[0] : candidate;
    try {
        const parsed = JSON.parse(toParse) as any;
        if (!parsed || typeof parsed !== 'object' || !parsed.diagnosis) return null;

        // Be defensive about unexpected key casing / missing fields coming back from the model.
        const diagnosis = typeof parsed.diagnosis === 'string' ? parsed.diagnosis.trim() : String(parsed.diagnosis ?? '');
        const trade = typeof parsed.trade === 'string' ? parsed.trade.trim() : String(parsed.trade ?? '');
        const action_required =
            typeof parsed.action_required === 'string'
                ? parsed.action_required
                : typeof parsed.actionRequired === 'string'
                  ? parsed.actionRequired
                  : '';
        const message =
            typeof parsed.message === 'string'
                ? parsed.message
                : typeof parsed.Message === 'string'
                  ? parsed.Message
                  : '';

        const estimated_cost =
            typeof parsed.estimated_cost === 'string'
                ? parsed.estimated_cost
                : typeof parsed.estimatedCost === 'string'
                  ? parsed.estimatedCost
                  : typeof parsed.estimated_diagnosis_sentence === 'string'
                    ? parsed.estimated_diagnosis_sentence
                    : '';

        const trade_detailRaw =
            typeof parsed.trade_detail === 'string'
                ? parsed.trade_detail
                : typeof parsed.tradeDetail === 'string'
                  ? parsed.tradeDetail
                  : '';
        const urgencyRaw =
            typeof parsed.urgency_key === 'string'
                ? parsed.urgency_key
                : typeof parsed.urgencyKey === 'string'
                  ? parsed.urgencyKey
                  : '';
        const urgency_key = urgencyRaw.trim().toLowerCase();

        return {
            ...(parsed as DiagnosisData),
            thinking: typeof parsed.thinking === 'string' ? parsed.thinking : '',
            diagnosis,
            trade,
            action_required,
            message: message || undefined,
            estimated_cost,
            trade_detail: trade_detailRaw.trim().length > 0 ? trade_detailRaw : trade,
            urgency_key:
                urgency_key === 'immediate' ||
                urgency_key === 'urgent' ||
                urgency_key === 'soon' ||
                urgency_key === 'planned'
                    ? urgency_key
                    : 'soon',
        };
    } catch {
        // ignore
    }
    return null;
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

    const loadConversation = useCallback(
        async (id: string): Promise<ConversationRow | null> => {
            const res = await fetchConversationDiagnosis(id);
            if (!res.ok) {
                if (process.env.NODE_ENV === 'development') {
                    // eslint-disable-next-line no-console
                    console.warn('[DiagnosisPage] loadConversation error', res.error);
                }
                return null;
            }
            const data = res.data;
            if (!data) return null;
            return {
                id: data.id,
                image_url: data.image_url ?? null,
                diagnosis: (data.diagnosis as DiagnosisData | null) ?? null,
                initial_image_description: data.initial_image_description ?? null,
            };
        },
        []
    );

    const saveConversationDiagnosis = useCallback(
        async (diag: DiagnosisData | null, img: string | null, prompt?: string): Promise<boolean> => {
            const deviceType =
                typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
                    ? 'mobile'
                    : 'desktop';
            const result = await patchConversation(conversationId, {
                title: diag?.diagnosis || 'New Diagnosis',
                image_url: img,
                diagnosis: diag,
                urgency_key: (diag?.urgency_key ?? null) as string | null,
                initial_image_description: (prompt ?? '').trim() || null,
                device: deviceType,
                user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                user_id: user?.id ?? null,
            });
            if (!result.ok) {
                toast.error(result.error || 'Could not save your report.');
                return false;
            }
            return true;
        },
        [conversationId, user?.id]
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
                const diag = parseDiagnosisFromResponse(text);
                if (!diag) {
                    toast.error('Could not understand the diagnosis response.');
                    return null;
                }
                setDiagnosis(diag);
                const saved = await saveConversationDiagnosis(diag, img, prompt);
                if (!saved) return null;
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
        [saveConversationDiagnosis, serviceCatalog, supabase]
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
                        action_required: diagnosis.action_required,
                        estimated_cost: diagnosis.estimated_cost,
                    },
                };
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
                const diag = parseDiagnosisFromResponse(text);
                if (!diag) {
                    toast.error('Could not understand the updated diagnosis.');
                    return;
                }
                setDiagnosis(diag);
                setRefineText('');
                const saved = await saveConversationDiagnosis(diag, imageSrc, initialPrompt);
                if (!saved) return;
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
        [diagnosis, imageSrc, initialPrompt, saveConversationDiagnosis, serviceCatalog, supabase]
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
                        handoff.selectedService
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
    }, [conversationId, loadConversation, router, runInitialDiagnosis]);

    const handleConfirmYes = async () => {
        if (!diagnosis) return;
        setConfirming(true);
        try {
            // Count the diagnosis as completed only when the user confirms and proceeds to match.
            trackEvent('diagnosis_complete', { diagnosis_id: conversationId });
            const saved = await saveConversationDiagnosis(diagnosis, imageSrc, initialPrompt);
            if (!saved) return;
            const key = `pending_diagnosis_image_url:${conversationId}`;
            try {
                sessionStorage.removeItem(key);
            } catch {}
            try {
                localStorage.removeItem(key);
            } catch {}
            writeMatchTradeContextStorage(
                conversationId,
                typeof diagnosis.trade === 'string' ? diagnosis.trade : '',
                typeof diagnosis.trade_detail === 'string' ? diagnosis.trade_detail : undefined
            );
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
