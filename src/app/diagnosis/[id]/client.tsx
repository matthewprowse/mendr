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
import { parseDiagnosisFromModelResponse } from '@/lib/parse-diagnosis-from-model-response';
import { enrichDiagnosisWithPartPrices } from '@/lib/parts-prices/enrich-diagnosis';
import { BetaCostEstimateCard } from '@/components/beta-cost-estimate-card';
import { getPendingDiagnosisImages } from '@/lib/pending-diagnosis-images-cache';
import { CircleNotch } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';

// ── Additional-photo helpers (mirrors /start Step 2 logic) ──────────────────

type AdditionalPhotoStatus = 'pending' | 'ready' | 'error';
type AdditionalPhoto = {
    id: string;
    file: File;
    status: AdditionalPhotoStatus;
    previewSrc: string | null;
    diagnosisSrc: string | null;
    errorMessage?: string;
};

function createPhotoId(): string {
    return `ph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isHeicLike(file: File): boolean {
    return (
        file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        /\.(heic|heif)$/i.test(file.name)
    );
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
}

async function normalizeAdditionalPhoto(file: File): Promise<AdditionalPhoto> {
    let raw = await readFileAsDataUrl(file);
    if (isHeicLike(file)) {
        const res = await fetch('/api/convert-heic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: raw }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && typeof json.dataUrl === 'string' && json.dataUrl.startsWith('data:image/')) {
            raw = json.dataUrl;
        } else {
            throw new Error('Could not convert HEIC image.');
        }
    }
    const compressed = await compressImage(raw);
    return {
        id: createPhotoId(),
        file,
        status: 'ready',
        previewSrc: compressed,
        diagnosisSrc: compressed,
    };
}

// ────────────────────────────────────────────────────────────────────────────

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
    const [additionalPhotos, setAdditionalPhotos] = useState<AdditionalPhoto[]>([]);
    const additionalPhotosInputRef = useRef<HTMLInputElement | null>(null);
    const MAX_ADDITIONAL_PHOTOS = 10;
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

    const getPendingImageAttachments = useCallback(
        (primaryImage: string): string[] => {
            const cached = getPendingDiagnosisImages(conversationId)
                .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
                .filter((x) => x !== primaryImage)
                .slice(0, 3);
            try {
                const raw = sessionStorage.getItem(`pending_diagnosis_image_urls:${conversationId}`) ?? '[]';
                const parsed = JSON.parse(raw) as unknown;
                if (!Array.isArray(parsed)) return cached;
                const fromSession = parsed
                    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
                    .filter((x) => x !== primaryImage)
                    .slice(0, 3);
                return fromSession.length > 0 ? fromSession : cached;
            } catch {
                return cached;
            }
        },
        [conversationId]
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
                const initialAttachments = getPendingImageAttachments(img);
                if (initialAttachments.length > 0) body.attachments = initialAttachments;
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
                const saved = await saveConversationDiagnosis(enriched, img, prompt);
                if (!saved) return null;
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
        [getPendingImageAttachments, saveConversationDiagnosis, serviceCatalog, supabase]
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
                        action_required: diagnosis.action_required,
                        estimated_cost: diagnosis.estimated_cost,
                    },
                };
                const cachedAttachments = getPendingImageAttachments(imageSrc);
                const userAddedAttachments = additionalPhotos
                    .filter((p) => p.status === 'ready' && p.diagnosisSrc)
                    .map((p) => p.diagnosisSrc as string);
                const allAttachments = [...cachedAttachments, ...userAddedAttachments];
                if (allAttachments.length > 0) body.attachments = allAttachments;
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
                setAdditionalPhotos([]);
                setRefineMode(false);
                const saved = await saveConversationDiagnosis(enriched, imageSrc, initialPrompt);
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
        [diagnosis, getPendingImageAttachments, imageSrc, initialPrompt, saveConversationDiagnosis, serviceCatalog, supabase]
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

    const handleAdditionalPhotosSelected = useCallback(
        async (incoming: FileList | null) => {
            if (!incoming || incoming.length === 0) return;
            const files = Array.from(incoming).filter(
                (f) => f.type.startsWith('image/') || isHeicLike(f),
            );
            if (files.length === 0) return;
            const toQueue = files.slice(0, Math.max(0, MAX_ADDITIONAL_PHOTOS - additionalPhotos.length));
            if (toQueue.length === 0) return;

            const placeholders: AdditionalPhoto[] = toQueue.map((f) => ({
                id: createPhotoId(),
                file: f,
                status: 'pending' as const,
                previewSrc: null,
                diagnosisSrc: null,
            }));
            const idByFile = new Map(placeholders.map((p) => [p.file, p.id]));
            setAdditionalPhotos((prev) => [...prev, ...placeholders]);

            for (const f of toQueue) {
                const id = idByFile.get(f);
                if (!id) continue;
                try {
                    const normalized = await normalizeAdditionalPhoto(f);
                    setAdditionalPhotos((prev) =>
                        prev.map((p) => (p.id === id ? { ...normalized, id } : p)),
                    );
                } catch {
                    setAdditionalPhotos((prev) =>
                        prev.map((p) =>
                            p.id === id
                                ? {
                                      ...p,
                                      status: 'error' as const,
                                      previewSrc: null,
                                      diagnosisSrc: null,
                                      errorMessage: isHeicLike(f)
                                          ? 'Could not convert this HEIC image.'
                                          : 'Could not process this image.',
                                  }
                                : p,
                        ),
                    );
                }
            }
        },
        [additionalPhotos.length, MAX_ADDITIONAL_PHOTOS],
    );

    const handleRemoveAdditionalPhoto = useCallback((photoId: string) => {
        setAdditionalPhotos((prev) => prev.filter((p) => p.id !== photoId));
    }, []);

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

            {diagnosis && (diagnosis.requires_clarification || diagnosis.rejected || refineMode) && (
                <footer
                    className="shrink-0 border-t border-black/[0.06] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6"
                    style={{ background: 'rgba(251,250,247,0.95)' }}
                >
                    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">

                        {/* ── Additional photos strip ── */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium text-foreground">
                                    Add photos
                                </Label>
                                {additionalPhotos.length > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                        {additionalPhotos.length}/{MAX_ADDITIONAL_PHOTOS}
                                    </span>
                                )}
                            </div>

                            {additionalPhotos.length > 0 && (
                                <div className="-mx-4 sm:-mx-6">
                                    <div className="flex gap-2 overflow-x-auto px-4 pb-1 sm:px-6">
                                        {additionalPhotos.map((photo) => (
                                            <div
                                                key={photo.id}
                                                className="relative w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-background"
                                            >
                                                {photo.status === 'ready' && photo.previewSrc ? (
                                                    <>
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={photo.previewSrc}
                                                            alt={photo.file.name}
                                                            className="h-20 w-full object-cover"
                                                        />
                                                        <Badge
                                                            onClick={() => handleRemoveAdditionalPhoto(photo.id)}
                                                            className="absolute top-1 right-1 cursor-pointer bg-background px-1.5 py-0.5 text-[10px] text-foreground"
                                                        >
                                                            ✕
                                                        </Badge>
                                                    </>
                                                ) : photo.status === 'pending' ? (
                                                    <div className="flex h-20 w-full flex-col items-center justify-center bg-secondary">
                                                        <CircleNotch className="size-4 animate-spin text-muted-foreground" />
                                                    </div>
                                                ) : (
                                                    <div className="flex h-20 w-full flex-col items-center justify-center gap-1 bg-secondary px-2 text-center">
                                                        <p className="line-clamp-2 text-[10px] text-muted-foreground">
                                                            {photo.errorMessage ?? 'Failed'}
                                                        </p>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 px-2 text-[10px]"
                                                            onClick={() => handleRemoveAdditionalPhoto(photo.id)}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <Button
                                type="button"
                                variant="secondary"
                                className="h-9 w-full text-sm"
                                onClick={() => additionalPhotosInputRef.current?.click()}
                                disabled={refining || additionalPhotos.length >= MAX_ADDITIONAL_PHOTOS}
                            >
                                {additionalPhotos.length === 0 ? 'Upload photos' : 'Add more photos'}
                            </Button>
                        </div>

                        {/* ── Text context ── */}
                        <div className="flex flex-col gap-2">
                            <Label className="text-sm font-medium text-foreground">
                                Add context <span className="font-normal text-muted-foreground">(optional)</span>
                            </Label>
                            <Textarea
                                value={refineText}
                                onChange={(e) => setRefineText(e.target.value)}
                                className="min-h-[72px] resize-none text-sm"
                                placeholder="Describe what else you're seeing or where it's located…"
                            />
                        </div>

                        {/* ── Actions ── */}
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                className="flex-1"
                                onClick={() => {
                                    setRefineMode(false);
                                    setRefineText('');
                                    setAdditionalPhotos([]);
                                }}
                                disabled={refining}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                size="lg"
                                className="flex-1"
                                onClick={() => runRefinedDiagnosis(refineText)}
                                disabled={
                                    refining ||
                                    (!refineText.trim() && additionalPhotos.filter((p) => p.status === 'ready').length === 0)
                                }
                            >
                                {refining ? 'Refining…' : 'Refine'}
                            </Button>
                        </div>

                        {/* Hidden inputs */}
                        <input
                            ref={additionalPhotosInputRef}
                            type="file"
                            accept="image/*,.heic,.heif"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                void handleAdditionalPhotosSelected(e.target.files);
                                e.currentTarget.value = '';
                            }}
                        />
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
