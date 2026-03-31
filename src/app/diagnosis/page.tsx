/**
 * Route: /welcome
 * First step in the scan flow. User uploads an image/video, then we continue to /diagnosis/[id].
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/image-compression';
import { setImageData } from '@/lib/image-store';
import { getSupabase } from '@/lib/supabase';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DiagnosisMetaPanel } from '@/components/diagnosis-meta-panel';
import type { DiagnosisData } from '@/app/chat/_components/types';
import { FlowStepHeader } from '@/components/flow-header';
import { DiagnosisLeaveDialog } from '@/components/diagnosis-leave-dialog';
import { cleanThoughtSentenceStarts, splitDetailAndHazard } from '@/lib/diagnosis-display';
import { createClientId } from '@/lib/client-random-id';

const URGENCY_LABELS: Record<string, string> = {
    immediate: 'Immediate',
    urgent: 'Urgent',
    soon: 'Soon',
    planned: 'Planned',
};

const DIAGNOSIS_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function WelcomePage({ conversationId }: { conversationId?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const trade = searchParams.get('trade') || '';
    const supabase = getSupabase();

    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isAddingInfo, setIsAddingInfo] = useState(false);
    const [infoText, setInfoText] = useState('');
    const infoTextareaRef = useRef<HTMLTextAreaElement>(null);
    // Avoid showing placeholder "Estimated Diagnosis" once we reach the /diagnosis/[id] route.
    const [diagnosisTitle, setDiagnosisTitle] = useState('Diagnosing…');
    const [customerInfoItems, setCustomerInfoItems] = useState<string[]>([]);
    const [thoughtText, setThoughtText] = useState('');
    const [diagnosisDetailText, setDiagnosisDetailText] = useState('');
    const [hazardText, setHazardText] = useState('');
    const [tradeLabel, setTradeLabel] = useState('');
    const [tradeDetailLabel, setTradeDetailLabel] = useState('');
    const [urgencyKey, setUrgencyKey] = useState<'immediate' | 'urgent' | 'soon' | 'planned'>('soon');
    const [requiresClarification, setRequiresClarification] = useState(false);
    const [actionRequiredRaw, setActionRequiredRaw] = useState('');
    const [serviceCatalog, setServiceCatalog] = useState<string[]>([]);
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [isDiagnosingRetrying, setIsDiagnosingRetrying] = useState(false);
    const [diagnosisFailureMessage, setDiagnosisFailureMessage] = useState<string | null>(null);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const didRunDiagnosisRef = useRef<string | null>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

    const parseDiagnosisFromResponse = (text: string): DiagnosisData | null => {
        const jsonBlockMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
        const candidate = jsonBlockMatch?.[1] ?? text;
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
                // Preserve all other fields, but ensure the required strings exist.
                ...(parsed as DiagnosisData),
                thinking: typeof parsed.thinking === 'string' ? parsed.thinking : '',
                diagnosis,
                trade,
                action_required,
                // If the model omitted action_required, we still allow message to render in the report.
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
    };

    const parseThoughtFromResponse = (text: string): string => {
        // Accept all known thought wrappers produced by the model.
        const tagged =
            text.match(/<(?:thought|thinking|thought_process)\s*>([\s\S]*?)<\/(?:thought|thinking|thought_process)\s*>/i)?.[1] ??
            text.match(/```(?:thought|thinking)\s*([\s\S]*?)```/i)?.[1] ??
            '';
        if (tagged.trim()) return tagged.trim();

        // Fallback: if model emits plain text before JSON, treat it as thought.
        const jsonStart = text.search(/<json\s*>|\{[\s\n]*"[^"]*"\s*:\s*"/i);
        if (jsonStart > 0) {
            const beforeJson = text.slice(0, jsonStart).trim();
            const cleaned = beforeJson
                .replace(/^<(?:thought|thinking|thought_process)[^>]*>/i, '')
                .replace(/<\/?(?:thought|thinking|thought_process)\s*>/gi, '')
                .trim();
            if (cleaned.length > 0) return cleaned;
        }
        return '';
    };

    const runInitialDiagnosis = useCallback(
        async (img: string, prompt: string, selectedService: string | null) => {
            const cid = conversationId ?? null;
            // Prevent duplicate in-flight calls (Next dev Strict Mode can double-invoke effects).
            if (!cid) return null;
            if (didRunDiagnosisRef.current === cid) return null;
            didRunDiagnosisRef.current = cid;
            setIsDiagnosing(true);
            setIsDiagnosingRetrying(false);
            setDiagnosisFailureMessage(null);
            try {
                for (let attempt = 1; attempt <= DIAGNOSIS_MAX_RETRIES; attempt += 1) {
                    setIsDiagnosingRetrying(attempt > 1);
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
                        if (attempt < DIAGNOSIS_MAX_RETRIES) {
                            await sleep(500 * attempt);
                            continue;
                        }
                        setDiagnosisFailureMessage(
                            'We could not load the service list for your Scandio Report. Please retry now.'
                        );
                        return null;
                    }

                    const res = await fetch('/api/diagnose', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image: img,
                            serviceCatalog: catalog,
                            ...(prompt.trim() ? { textQuery: prompt.trim() } : {}),
                            ...(selectedService
                                ? {
                                      userSelectedTrade: {
                                          trade: selectedService,
                                          diagnosis: `${selectedService} services`,
                                      },
                                  }
                                : {}),
                        }),
                    });

                    const text = await res.text();
                    if (!res.ok) {
                        // Quota/rate-limit should surface immediately; retries won't help.
                        if (res.status === 429) {
                            try {
                                const parsed = JSON.parse(text);
                                setDiagnosisFailureMessage(
                                    String(
                                        parsed?.message ||
                                            parsed?.error ||
                                            'Scandio is busy right now. Please try again shortly.'
                                    )
                                );
                            } catch {
                                setDiagnosisFailureMessage(
                                    'Scandio is busy right now. Please try again shortly.'
                                );
                            }
                            return null;
                        }
                        if (attempt < DIAGNOSIS_MAX_RETRIES) {
                            await sleep(700 * attempt);
                            continue;
                        }
                        setDiagnosisFailureMessage(
                            'We could not finish your Scandio Report automatically. Please retry now.'
                        );
                        return null;
                    }

                    const diag = parseDiagnosisFromResponse(text);
                    if (!diag) {
                        if (attempt < DIAGNOSIS_MAX_RETRIES) {
                            await sleep(700 * attempt);
                            continue;
                        }
                        setDiagnosisFailureMessage(
                            'We could not read that response correctly. Please retry now.'
                        );
                        return null;
                    }

                    const thoughtFromJson =
                        Array.isArray((diag as any)?.image_descriptions) &&
                        typeof (diag as any).image_descriptions[0] === 'string'
                            ? String((diag as any).image_descriptions[0]).trim()
                            : '';
                    const thought =
                        parseThoughtFromResponse(text) ||
                        (diag.thinking ?? '').trim() ||
                        thoughtFromJson;
                    setThoughtText(cleanThoughtSentenceStarts(thought));
                    const diagWithThought: DiagnosisData = { ...diag, thinking: thought };
                    const detail =
                        (diagWithThought.action_required ?? '').trim() ||
                        (diagWithThought.message ?? '').trim() ||
                        '';
                    const split = splitDetailAndHazard(detail);
                    setDiagnosisDetailText(split.detail);
                    setHazardText(split.hazard);
                    setTradeLabel((diagWithThought.trade ?? '').trim());
                    setTradeDetailLabel((diagWithThought.trade_detail ?? '').trim());
                    setUrgencyKey((diagWithThought.urgency_key as any) ?? 'soon');
                    setRequiresClarification(Boolean((diagWithThought as DiagnosisData).requires_clarification));
                    setActionRequiredRaw((diagWithThought.action_required ?? '').trim());
                    setDiagnosisTitle(diagWithThought.diagnosis);
                    setDiagnosisFailureMessage(null);

                    try {
                        const deviceType =
                            typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
                                ? 'mobile'
                                : 'desktop';
                        await supabase
                            .from('conversations')
                            .upsert({
                                id: conversationId,
                                title: diagWithThought.diagnosis || 'New Diagnosis',
                                image_url: img,
                                diagnosis: diagWithThought,
                                urgency_key: diagWithThought.urgency_key ?? null,
                                initial_image_description: (prompt ?? '').trim() || null,
                                device: deviceType,
                                user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                            })
                            .select('id')
                            .single();
                    } catch {
                        // Non-fatal: still show diagnosis even if persistence fails.
                    }

                    return diagWithThought;
                }
                setDiagnosisFailureMessage(
                    'We could not complete your Scandio Report right now. Please retry now.'
                );
                return null;
            } finally {
                setIsDiagnosing(false);
                setIsDiagnosingRetrying(false);
            }
        },
        [conversationId, serviceCatalog, supabase]
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

    useEffect(() => {
        let cancelled = false;
        const bootstrap = async () => {
            if (!conversationId) return;
            // Reset guard when the route id changes.
            didRunDiagnosisRef.current = null;
            setDiagnosisTitle('Diagnosing…');
            // Show uploaded image immediately while conversation row is loading.
            try {
                const immediateImageUrl = sessionStorage.getItem(
                    `pending_diagnosis_image_url:${conversationId}`
                );
                if (immediateImageUrl) setImageSrc(immediateImageUrl);
            } catch {
                // Ignore session storage issues.
            }

            const { data } = await supabase
                .from('conversations')
                .select('id,image_url,diagnosis,initial_image_description')
                .eq('id', conversationId)
                .maybeSingle();

            if (cancelled) return;
            const img = (data as any)?.image_url as string | null;
            setImageSrc(img);
            const prompt = ((data as any)?.initial_image_description as string | null) ?? '';
            const customerInfo = prompt.trim();
            setCustomerInfoItems(customerInfo ? [customerInfo] : []);
            const existingDiagnosis = (data as any)?.diagnosis as DiagnosisData | null;

            if (existingDiagnosis?.diagnosis) {
                setDiagnosisTitle(existingDiagnosis.diagnosis);
                setRequiresClarification(Boolean(existingDiagnosis.requires_clarification));
                setActionRequiredRaw((existingDiagnosis.action_required ?? '').trim());
                const persistedThinking = (existingDiagnosis.thinking ?? '').trim();
                const persistedImageDescriptions =
                    Array.isArray((existingDiagnosis as any)?.image_descriptions) &&
                    typeof (existingDiagnosis as any).image_descriptions[0] === 'string'
                        ? String((existingDiagnosis as any).image_descriptions[0]).trim()
                        : '';
                setThoughtText(
                    cleanThoughtSentenceStarts(persistedThinking || persistedImageDescriptions)
                );
                const persistedSplit = splitDetailAndHazard(
                    (existingDiagnosis.action_required ?? '').trim() ||
                        (existingDiagnosis.message ?? '').trim() ||
                        ''
                );
                setDiagnosisDetailText(persistedSplit.detail);
                setHazardText(persistedSplit.hazard);
                setTradeLabel((existingDiagnosis.trade ?? '').trim());
                setTradeDetailLabel((existingDiagnosis.trade_detail ?? '').trim());
                setUrgencyKey(((existingDiagnosis.urgency_key as any) ?? 'soon') as any);
                return;
            }

            if (!img) {
                setDiagnosisFailureMessage(
                    'No uploaded photo was found for this report. Please choose a new photo.'
                );
                return;
            }
            const selectedService = trade.trim() || null;
            await runInitialDiagnosis(img, prompt, selectedService);
        };

        void bootstrap().finally(() => {
            if (!cancelled) setIsPageLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [conversationId, runInitialDiagnosis, supabase, trade]);

    const processFile = useCallback(
        async (file: File) => {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            if (!isImage && !isVideo) return;

            setIsUploading(true);
            try {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const finalDataUrl = isImage ? await compressImage(dataUrl) : dataUrl;
                const conversationId = createClientId();
                setImageData(conversationId, finalDataUrl, file.name);

                const qp = new URLSearchParams();
                if (trade) qp.set('trade', trade);
                const suffix = qp.toString() ? `?${qp.toString()}` : '';

                router.push(`/diagnosis/${conversationId}${suffix}`);
            } finally {
                setIsUploading(false);
            }
        },
        [router, trade]
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void processFile(file);
        e.target.value = '';
    };

    const showSkeleton = isPageLoading || isDiagnosing;
    const hasDiagnosisFailure = !showSkeleton && Boolean(diagnosisFailureMessage);
    const fullDiagnosisContext = `${diagnosisTitle}\n${diagnosisDetailText}\n${thoughtText}`;
    const mentionsNonHomePhoto =
        /not related to home maintenance|does not appear related to a home maintenance|photo not related to home|photo does not appear related/i.test(
            fullDiagnosisContext
        );
    const isUnrelatedDiagnosis =
        diagnosisTitle.toLowerCase().includes('not related to home maintenance') ||
        /\bphoto not related\b/i.test(diagnosisTitle) ||
        mentionsNonHomePhoto;
    const isUnsupportedDiagnosis =
        tradeLabel.trim().toLowerCase() === 'n/a' ||
        diagnosisTitle.toLowerCase().includes('not currently supported') ||
        diagnosisTitle.toLowerCase().includes('not on scandio');
    /** Off-topic or non-home photo: show unrelated UX even if the model labelled it “unsupported”. */
    const isUnsupportedOnly = isUnsupportedDiagnosis && !isUnrelatedDiagnosis;
    const isServiceBlocked = isUnsupportedDiagnosis || isUnrelatedDiagnosis;

    const scanForMatchEligibility = `${diagnosisTitle}\n${thoughtText}\n${diagnosisDetailText}\n${hazardText}`.toLowerCase();
    const suggestsNoClearRepair =
        /\bappears functional\b|\bno (visible |clear )?fault\b|\bno (specific |obvious )?fault\b|\bgood condition\b|\bin good (working )?order\b|\boperating normally\b|\bno repair (needed|required)\b|\bnothing (seems |looks )?wrong\b|\bunable to (identify|see) (a |any )?(fault|problem|damage)\b|\bdoes not (appear |seem )?to (need|require) (repair|work)\b|\b(system|equipment|unit|motor) appears (fine|okay|ok|normal)\b/i.test(
            scanForMatchEligibility
        ) &&
        !/\b(non-functional|not functional|faulty|broken|damaged|leaking|tripping|failed|error|fault code)\b/i.test(
            scanForMatchEligibility
        );

    const actionRequiredIsPlaceholder = /^n\/a$/i.test(actionRequiredRaw.trim());

    const isMatchBlocked =
        isServiceBlocked ||
        hasDiagnosisFailure ||
        requiresClarification ||
        actionRequiredIsPlaceholder ||
        suggestsNoClearRepair;

    const needsMoreBeforeMatch = isMatchBlocked && !isServiceBlocked;

    const canContinueToMatch =
        !showSkeleton &&
        !isMatchBlocked &&
        diagnosisTitle.trim().length > 0 &&
        !diagnosisTitle.toLowerCase().includes('diagnosing');
    const fallbackUnsupportedDetail =
        serviceCatalog.length > 0
            ? `This job does not look like a service Scandio supports yet. Right now we support: ${serviceCatalog.join(', ')}. If that seems wrong, add more detail below and we will take another look.`
            : 'This job does not look like a service Scandio supports yet. If that seems wrong, add more detail below and we will take another look.';
    const fallbackUnrelatedDetail =
        'This photo does not look like a home repair or maintenance issue. Share a photo of the actual problem, or tell us what is wrong below, and we will try again.';
    /** Model sometimes returns “unsupported” boilerplate for off-topic photos; don’t show that next to ironing, etc. */
    const unrelatedOverridesConflictingApiCopy =
        isUnrelatedDiagnosis &&
        (mentionsNonHomePhoto ||
            diagnosisTitle.toLowerCase().includes('service not currently supported'));
    const resolvedDetailText = unrelatedOverridesConflictingApiCopy
        ? fallbackUnrelatedDetail
        : isUnrelatedDiagnosis
          ? diagnosisDetailText || fallbackUnrelatedDetail
          : diagnosisDetailText || (isUnsupportedOnly ? fallbackUnsupportedDetail : '');

    const diagnosisHeadline = isUnsupportedOnly
        ? 'This Type of Job Is Not on Scandio Yet'
        : diagnosisTitle;

    const welcomeHref = trade.trim()
        ? `/welcome?trade=${encodeURIComponent(trade.trim())}`
        : '/welcome';

    return (
        <main className="flex min-h-screen flex-col bg-background">
            <FlowStepHeader step={2} onBack={() => setLeaveDialogOpen(true)} />

            <DiagnosisLeaveDialog
                open={leaveDialogOpen}
                onOpenChange={setLeaveDialogOpen}
                onLeave={() => router.back()}
            />

            <div
                className={`flex flex-1 justify-center px-4 pt-20 sm:px-6 ${
                    isAddingInfo
                        ? 'pb-[calc(13rem+env(safe-area-inset-bottom))]'
                        : 'pb-[calc(7rem+env(safe-area-inset-bottom))]'
                }`}
            >
            <div className="flex w-full max-w-xl flex-col gap-6">

            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                    {isMatchBlocked && !showSkeleton ? (
                        isUnrelatedDiagnosis ? (
                            <>This Photo Does Not Show a Home Repair Issue</>
                        ) : (
                            <>Your Scandio Report Needs a Bit More Detail</>
                        )
                    ) : (
                        <>Your Scandio Report</>
                    )}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {hasDiagnosisFailure ? (
                        <>We could not finish your report this time, but you can retry now.</>
                    ) : isMatchBlocked && !showSkeleton ? (
                        isUnrelatedDiagnosis ? (
                            <>
                                Scandio can only help with home maintenance faults. Share a clearer photo of the
                                issue, or describe what is wrong below.
                            </>
                        ) : (
                            <>
                                We could not confidently match this to a trade yet. Add a bit more detail below, or
                                go back and choose a new photo.
                            </>
                        )
                    ) : (
                        <>
                            Here is what we found from your photo and notes. You know your home best, so tell us if
                            anything looks off.
                        </>
                    )}
                </p>
            </div>

            {customerInfoItems.length > 0 ? (
                <div className="flex flex-col items-start gap-2">
                    {customerInfoItems.map((item, idx) => (
                        <div
                            key={`${idx}-${item.slice(0, 20)}`}
                            className="text-xs text-foreground bg-secondary rounded-md px-3 py-2"
                        >
                            {item}
                        </div>
                    ))}
                </div>
            ) : null}

            <div className="flex flex-col gap-3">
                {showSkeleton ? (
                    <Skeleton className="h-7 w-1/2" />
                ) : isUnrelatedDiagnosis ? null : (
                    <h2 className="text-lg text-foreground font-bold">{diagnosisHeadline}</h2>
                )}
                <div className="overflow-hidden rounded-lg border border-input bg-secondary">
                    {imageSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={imageSrc}
                            alt={
                                showSkeleton
                                    ? 'Photo you shared for this diagnosis'
                                    : isUnrelatedDiagnosis
                                      ? 'Photo you shared'
                                      : diagnosisHeadline
                            }
                            className="h-56 w-full object-cover"
                            loading="eager"
                            fetchPriority="high"
                        />
                    ) : (
                        <div className="h-56 w-full" />
                    )}
                </div>
                {showSkeleton ? (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-11/12" />
                        <Skeleton className="h-4 w-4/5" />
                        {isDiagnosingRetrying ? (
                            <p className="text-xs text-muted-foreground">
                                We are retrying automatically...
                            </p>
                        ) : null}
                    </div>
                ) : isUnrelatedDiagnosis ? null : (
                    <p className="text-xs text-muted-foreground">{thoughtText || ''}</p>
                )}
            </div>

            {showSkeleton ? (
                <>
                    <div className="flex flex-col gap-5 sm:flex-row sm:justify-between">
                        <div className="flex flex-1 flex-col gap-2">
                            <Skeleton className="h-3 w-14" />
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="h-4 w-full" />
                        </div>
                        <div className="flex flex-col gap-2 sm:items-end">
                            <Skeleton className="h-3 w-16 sm:ml-auto" />
                            <Skeleton className="h-8 w-24 rounded-full" />
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col gap-3">
                    {!isMatchBlocked ? (
                        <DiagnosisMetaPanel
                            trade={tradeLabel || 'Not specified'}
                            tradeDetail={tradeDetailLabel}
                            urgencyKey={urgencyKey}
                            urgencyLabel={URGENCY_LABELS[urgencyKey] ?? 'Soon'}
                        />
                    ) : null}

                    {hasDiagnosisFailure ? (
                        <p className="text-sm text-foreground">{diagnosisFailureMessage}</p>
                    ) : !isUnrelatedDiagnosis ? (
                        <p className="text-sm text-foreground">{resolvedDetailText}</p>
                    ) : null}
                    {isUnsupportedOnly && serviceCatalog.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Supported services on Scandio: {serviceCatalog.join(', ')}.
                        </p>
                    ) : null}
                    {hazardText ? <p className="text-sm text-foreground">{hazardText}</p> : null}
                </div>
            )}

            </div>
            </div>

            {!isAddingInfo ? (
                <div className="fixed inset-x-0 bottom-0 z-40 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
                    <div
                        className={`mx-auto flex w-full max-w-xl ${
                            isMatchBlocked && !showSkeleton ? 'flex-col gap-3' : 'flex-col gap-3'
                        }`}
                    >
                        {isMatchBlocked && !showSkeleton ? (
                            <>
                                {!isUnrelatedDiagnosis && !hasDiagnosisFailure ? (
                                    <p className="text-center text-xs leading-relaxed text-muted-foreground">
                                        We can match you to a contractor once this lines up with a supported trade.
                                        Add more detail if we misunderstood, or start over with a new photo.
                                    </p>
                                ) : null}
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        className="flex-1 h-10"
                                        onClick={() => router.push(welcomeHref)}
                                    >
                                        Choose New Photo
                                    </Button>
                                    <Button
                                        variant="default"
                                        className="flex-1 h-10"
                                        disabled={showSkeleton}
                                        onClick={async () => {
                                            if (hasDiagnosisFailure) {
                                                if (!imageSrc) return;
                                                didRunDiagnosisRef.current = null;
                                                setDiagnosisTitle('Diagnosing…');
                                                await runInitialDiagnosis(
                                                    imageSrc,
                                                    customerInfoItems.join('\n\n').trim(),
                                                    trade.trim() || null
                                                );
                                                return;
                                            }
                                            setIsAddingInfo(true);
                                            setTimeout(() => infoTextareaRef.current?.focus(), 0);
                                        }}
                                    >
                                        {hasDiagnosisFailure ? 'Retry Report' : 'Add More Detail'}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="diagnosis-refine-text" className="text-sm font-medium text-foreground">
                                        Add More Detail (optional)
                                    </Label>
                                    <Textarea
                                        id="diagnosis-refine-text"
                                        ref={infoTextareaRef}
                                        value={infoText}
                                        onChange={(e) => setInfoText(e.target.value)}
                                        disabled={showSkeleton || isDiagnosing}
                                        className="text-sm resize-none"
                                        rows={3}
                                        placeholder="Example: The leak only starts when we run hot water."
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="secondary"
                                        className="flex-1 h-10"
                                        disabled={!infoText.trim() || isDiagnosing || showSkeleton}
                                        onClick={async () => {
                                            const trimmed = infoText.trim();
                                            if (!trimmed) return;
                                            const nextItems = [...customerInfoItems, trimmed];
                                            const joinedInfo = nextItems.join('\n\n').trim();
                                            setCustomerInfoItems(nextItems);
                                            setInfoText('');
                                            if (conversationId) {
                                                try {
                                                    await supabase
                                                        .from('conversations')
                                                        .upsert({
                                                            id: conversationId,
                                                            initial_image_description: joinedInfo || null,
                                                        })
                                                        .select('id')
                                                        .single();
                                                } catch {
                                                    // Non-fatal.
                                                }
                                            }
                                            if (imageSrc) {
                                                didRunDiagnosisRef.current = null;
                                                setDiagnosisTitle('Diagnosing…');
                                                await runInitialDiagnosis(imageSrc, joinedInfo, trade.trim() || null);
                                            }
                                        }}
                                    >
                                        {isDiagnosing ? 'Updating Report...' : 'Update Report'}
                                    </Button>
                                    <Button
                                        variant="default"
                                        className="flex-1 h-10"
                                        disabled={!canContinueToMatch || isDiagnosing}
                                        onClick={() => {
                                            if (!conversationId) return;
                                            const key = `pending_diagnosis_image_url:${conversationId}`;
                                            try { sessionStorage.removeItem(key); } catch {}
                                            try { localStorage.removeItem(key); } catch {}
                                            router.push(`/match/${encodeURIComponent(conversationId)}`);
                                        }}
                                    >
                                        Find a Contractor
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="fixed inset-x-0 bottom-0 z-40 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
                    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
                        <Label htmlFor="diagnosis-info-text" className="text-sm font-medium text-foreground">
                            Add More Detail
                        </Label>
                        <Textarea
                            id="diagnosis-info-text"
                            ref={infoTextareaRef}
                            value={infoText}
                            onChange={(e) => setInfoText(e.target.value)}
                            disabled={showSkeleton}
                            className="text-sm resize-none"
                            rows={3}
                        />
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                className="flex-1 h-10"
                                disabled={showSkeleton}
                                onClick={() => {
                                    setIsAddingInfo(false);
                                    setInfoText('');
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="default"
                                className="flex-1 h-10"
                                disabled={!infoText.trim() || isDiagnosing || showSkeleton}
                                onClick={async () => {
                                    const trimmed = infoText.trim();
                                    if (!trimmed) return;
                                    const nextItems = [...customerInfoItems, trimmed];
                                    const joinedInfo = nextItems.join('\n\n').trim();
                                    setCustomerInfoItems(nextItems);
                                    setIsAddingInfo(false);
                                    setInfoText('');
                                    if (conversationId) {
                                        try {
                                            await supabase
                                                .from('conversations')
                                                .upsert({
                                                    id: conversationId,
                                                    initial_image_description: joinedInfo || null,
                                                })
                                                .select('id')
                                                .single();
                                        } catch {
                                            // Non-fatal.
                                        }
                                    }
                                    if (imageSrc) {
                                        didRunDiagnosisRef.current = null;
                                        setDiagnosisTitle('Diagnosing…');
                                        await runInitialDiagnosis(imageSrc, joinedInfo, trade.trim() || null);
                                    }
                                }}
                            >
                                {isDiagnosing ? 'Updating Report...' : 'Update Report'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

