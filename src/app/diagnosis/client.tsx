/**
 * Route: /diagnosis/[id]
 * Diagnosis step in the scan flow.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
// heic2any is loaded lazily on first HEIC conversion — keeps it out of the initial bundle.
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getSupabase } from '@/lib/auth/supabase';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { DiagnosisData } from '@/features/diagnosis/types';
import type { Provider } from '@/lib/providers/types';
import { DiagnosisLeaveDialog } from '@/components/diagnosis-leave-dialog';
import { cleanThoughtSentenceStarts, splitDetailAndHazard } from '@/lib/diagnosis/diagnosis-display';
import { parseDiagnosisFromModelResponse } from '@/lib/diagnosis/parse-diagnosis-from-model-response';
import {
    consumeDiagnoseNdjsonStream,
    DiagnoseStreamHttpError,
    responseLooksLikeDiagnoseNdjson,
} from '@/lib/diagnosis/diagnose-ndjson-stream';
import { writeMatchTradeContextStorage } from '@/lib/diagnosis/match-trade-context';
import { prewarmProvidersApi } from '@/features/match/api/client';
import { fetchActiveServiceCatalogClient } from '@/lib/services-catalog';
import {
    fetchConversationDiagnosis,
    invalidateConversationDiagnosisCache,
    patchConversation,
    type ConversationDiagnosisRow,
} from '@/lib/diagnosis/diagnoses-api';
import {
    isDiagnosisAccurateForPrefetch,
    prefetchProvidersIntoMatchCache,
    shouldSkipDiagnosisPipeline,
} from '@/features/diagnosis/processing-orchestrator';
import { getPendingDiagnosisImages } from '@/lib/diagnosis/pending-diagnosis-images-cache';
import { useAuth } from '@/context/auth-context';
import { ShareNetwork, ArrowLeft } from '@phosphor-icons/react';
import { trackEvent } from '@/lib/analytics';
import { StepHeading } from '@/components/match/flow-shell';

const DIAGNOSIS_MAX_RETRIES = 3;
/** Inline header region (~pt-5 + h-11 + pb-2) for sticky title swap. */
const HEADER_HEIGHT_PX = 72;
const MIN_DESCRIPTION_CHARS = 25;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_MATCH_RADIUS_METERS = 10_000;
function providerHydrateSessionKey(id: string): string {
    return `scandio_provider_hydrate_done:${id}`;
}

/** Single UX for unsupported trade and unrelated / non-maintenance photos (see `isServiceBlocked`). */
const DIAGNOSIS_REJECT_HEADLINE = "We Can't Match This Job on Mendr Yet";
const DIAGNOSIS_REJECT_DETAIL =
    "Either this does not look like a home repair or maintenance issue we can assess from your photo, or it is not a service on Mendr's list yet. Add a clearer photo or a few words about the job below, then tap Re-Scan Report. If we still cannot match you, you will need to reach a specialist outside Mendr.";

function isLikelyRenderableImageSource(value: string | null | undefined): boolean {
    const src = (value ?? '').trim();
    if (!src) return false;
    if (src.startsWith('data:image/')) return true;
    if (src.startsWith('blob:')) return true;
    if (/^https?:\/\//i.test(src)) {
        // Signed/public image URLs often include extension or image-transform path segments.
        return !/\/(start|processing|diagnosis|match|chat|report)(\/|$)/i.test(src);
    }
    return false;
}

function isHeicLikeDataUrl(value: string): boolean {
    return /^data:image\/hei[cf];/i.test(value.trim());
}

async function readBlobAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
            }
            reject(new Error('Could not read converted image.'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('Could not read converted image.'));
        reader.readAsDataURL(blob);
    });
}

async function convertHeicBlobToJpegDataUrl(blob: Blob): Promise<string> {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({
        blob,
        toType: 'image/jpeg',
        quality: 0.9,
    });
    const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
    if (!(convertedBlob instanceof Blob)) {
        throw new Error('Could not convert HEIC image.');
    }
    return readBlobAsDataUrl(convertedBlob);
}

async function ensureRenderableImageSource(value: string | null): Promise<string | null> {
    const src = (value ?? '').trim();
    if (!src) return null;
    if (src.startsWith('blob:')) return src;
    if (!isHeicLikeDataUrl(src)) return src;
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        return await convertHeicBlobToJpegDataUrl(blob);
    } catch {
        return src;
    }
}

export default function DiagnosisPageClient({
    conversationId,
    prefetchedConversation,
}: {
    conversationId?: string;
    /** When set (including `null`), skips the client GET for this row on first load. */
    prefetchedConversation?: ConversationDiagnosisRow | null;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const tradeFromQuery = searchParams.get('trade') || '';
    const locationFromQuery = searchParams.get('location') || '';
    const supabase = getSupabase();

    const [infoText, setInfoText] = useState('');
    const [showAddInfoScreen, setShowAddInfoScreen] = useState(false);
    // Avoid showing placeholder "Estimated Diagnosis" once we reach the /diagnosis/[id] route.
    const [diagnosisTitle, setDiagnosisTitle] = useState('Diagnosing…');
    const [customerInfoItems, setCustomerInfoItems] = useState<string[]>([]);
    const [thoughtText, setThoughtText] = useState('');
    const [imageThoughtBreakdown, setImageThoughtBreakdown] = useState<string[]>([]);
    const [showDetailedThinking, setShowDetailedThinking] = useState(false);
    const [fullscreenImageIndex, setFullscreenImageIndex] = useState<number | null>(null);
    const fullscreenTouchStartXRef = useRef<number | null>(null);
    const [diagnosisDetailText, setDiagnosisDetailText] = useState('');
    const [hazardText, setHazardText] = useState('');
    const [tradeLabel, setTradeLabel] = useState('');
    const [tradeDetailLabel, setTradeDetailLabel] = useState('');
    const [requiresClarification, setRequiresClarification] = useState(false);
    const [isRejectedDiagnosis, setIsRejectedDiagnosis] = useState(false);
    const [isUnservicedDiagnosis, setIsUnservicedDiagnosis] = useState(false);
    const [actionRequiredRaw, setActionRequiredRaw] = useState('');
    const [serviceCatalog, setServiceCatalog] = useState<string[]>([]);
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [isImageAnalysing, setIsImageAnalysing] = useState(false);
    const [isDiagnosingRetrying, setIsDiagnosingRetrying] = useState(false);
    const [isDetailStageReady, setIsDetailStageReady] = useState(false);
    const [diagnosisFailureMessage, setDiagnosisFailureMessage] = useState<string | null>(null);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const didRunDiagnosisRef = useRef<string | null>(null);
    const thoughtStreamGenRef = useRef(0);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [uploadedImageSources, setUploadedImageSources] = useState<string[]>([]);
    const uploadedImageSourcesRef = useRef<string[]>([]);
    const [customerAddress, setCustomerAddress] = useState<string>('');
    const [selectedTradeHint, setSelectedTradeHint] = useState<string>('');
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
    const [currentDiagnosis, setCurrentDiagnosis] = useState<DiagnosisData | null>(null);
    const currentDiagnosisRef = useRef<DiagnosisData | null>(null);
    const footerRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const headerTitleAnchorRef = useRef<HTMLHeadingElement | null>(null);
    const [useStickyHeaderName, setUseStickyHeaderName] = useState(false);

    const savedCustomerCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
    const providersForDiagnoseRef = useRef<Provider[]>([]);
    const customerInfoItemsRef = useRef<string[]>([]);
    const [clarificationSubmitLoading, setClarificationSubmitLoading] = useState(false);
    const [clarificationCustomText, setClarificationCustomText] = useState('');


    useEffect(() => {
        currentDiagnosisRef.current = currentDiagnosis;
    }, [currentDiagnosis]);

    const getPersistedCustomerInfoItems = useCallback(
        (data: ConversationDiagnosisRow | null, fallbackPrompt: string): string[] => {
            const raw =
                data &&
                typeof (data as any)?.diagnosis === 'object' &&
                (data as any)?.diagnosis !== null &&
                Array.isArray(((data as any).diagnosis as any).customer_info_items)
                    ? (((data as any).diagnosis as any).customer_info_items as unknown[])
                    : null;
            const fromDiagnosis = raw
                ? raw
                      .map((x) => (typeof x === 'string' ? x.trim() : ''))
                      .filter((x) => x.length > 0)
                : [];
            if (fromDiagnosis.length > 0) return fromDiagnosis;

            const fallback = fallbackPrompt.trim();
            return fallback ? [fallback] : [];
        },
        []
    );

    const prewarmProvidersForConversation = useCallback(
        (conversation: ConversationDiagnosisRow | null | undefined, diagnosisData: DiagnosisData) => {
            const lat = conversation?.customer_lat;
            const lng = conversation?.customer_lng;
            const tradeRaw = (diagnosisData.trade ?? '').trim();
            const tradeDetailRaw = (diagnosisData.trade_detail ?? '').trim();
            if (
                typeof lat !== 'number' ||
                typeof lng !== 'number' ||
                !Number.isFinite(lat) ||
                !Number.isFinite(lng) ||
                !tradeRaw ||
                tradeRaw.toLowerCase() === 'n/a'
            ) {
                return;
            }
            void prewarmProvidersApi({
                lat,
                lng,
                trade: tradeRaw,
                ...(tradeDetailRaw ? { tradeDetail: tradeDetailRaw } : {}),
                radius: DEFAULT_MATCH_RADIUS_METERS,
            });
        },
        []
    );

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

    const buildPromptWithContext = useCallback((prompt: string): string => {
        const parts: string[] = [];
        const loc = customerAddress.trim() || locationFromQuery.trim();
        const base = prompt.trim();
        if (loc) {
            parts.push(`Location context: ${loc}`);
        }
        if (base) {
            parts.push(base);
        }
        return parts.join('\n\n');
    }, [customerAddress, locationFromQuery]);

    const parseServiceCatalogOrFail = useCallback(async (): Promise<string[] | null> => {
        let catalog = serviceCatalog;
        if (catalog.length === 0) {
            catalog = await fetchActiveServiceCatalogClient(supabase as any);
            if (catalog.length > 0) setServiceCatalog(catalog);
        }
        if (catalog.length === 0) {
            setDiagnosisFailureMessage(
                'We could not load the service list for your Mendr Report. Please retry now.'
            );
            return null;
        }
        return catalog;
    }, [serviceCatalog, supabase]);

    const buildSelectedTradePayload = (selectedService: string | null) =>
        selectedService
            ? {
                  userSelectedTrade: {
                      trade: selectedService,
                      diagnosis: `${selectedService} services`,
                  },
              }
            : {};

    const buildCustomerInfoItemsForPersistence = useCallback((prompt: string): string[] => {
        const trimmedPrompt = prompt.trim();
        const items = customerInfoItemsRef.current
            .map((x) => x.trim())
            .filter((x) => x.length > 0);
        if (!trimmedPrompt) return items;
        if (items.some((x) => x === trimmedPrompt)) return items;
        return [trimmedPrompt, ...items];
    }, []);

    const maybeHydrateWithProviders = useCallback(
        async (diag: DiagnosisData, img: string, catalogIn: string[], userWords: string) => {
            const cid = conversationId ?? null;
            if (!cid) return;
            const trade = diag.trade?.trim();
            if (!trade || trade === 'N/A') return;
            if (diag.requires_clarification || diag.rejected || diag.unserviced) return;
            try {
                if (sessionStorage.getItem(providerHydrateSessionKey(cid)) === '1') return;
            } catch {
                /* private mode */
            }

            let catalog = catalogIn;
            if (catalog.length === 0) {
                catalog = await fetchActiveServiceCatalogClient(supabase as any);
            }
            if (catalog.length === 0) return;

            try {
                let lat: number;
                let lng: number;
                const saved = savedCustomerCoordsRef.current;
                if (
                    saved &&
                    typeof saved.lat === 'number' &&
                    typeof saved.lng === 'number' &&
                    Number.isFinite(saved.lat) &&
                    Number.isFinite(saved.lng)
                ) {
                    lat = saved.lat;
                    lng = saved.lng;
                } else {
                    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            timeout: 15000,
                            maximumAge: 300_000,
                        });
                    });
                    lat = pos.coords.latitude;
                    lng = pos.coords.longitude;
                }

                const geocodeRes = await fetch('/api/geocode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat, lng }),
                });
                if (!geocodeRes.ok) return;

                const provRes = await fetch('/api/providers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lat,
                        lng,
                        trade,
                        radius: 25_000,
                    }),
                });
                const provData = await provRes.json().catch(() => ({}));
                if (!provRes.ok) return;
                const list = Array.isArray(provData.providers) ? (provData.providers as Provider[]) : [];
                if (list.length === 0) return;

                providersForDiagnoseRef.current = list;
                // All uploaded images sent with equal weight for provider hydration.
                const hydrationImages = uploadedImageSourcesRef.current.length > 0
                    ? uploadedImageSourcesRef.current
                    : [img];

                const res = await fetch('/api/diagnose', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageUrls: hydrationImages,
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
                        },
                    }),
                });
                const text = await res.text();
                if (!res.ok) return;
                const parsed = parseDiagnosisFromModelResponse(text);
                if (!parsed) return;

                const thoughtFromJson =
                    Array.isArray((parsed as any)?.image_descriptions) &&
                    typeof (parsed as any).image_descriptions[0] === 'string'
                        ? String((parsed as any).image_descriptions[0]).trim()
                        : '';
                const thought =
                    parseThoughtFromResponse(text) ||
                    (parsed.thinking ?? '').trim() ||
                    thoughtFromJson;
                const diagWithThought: DiagnosisData = { ...parsed, thinking: thought };
                const toSave = diagWithThought;
                const detail =
                    (toSave.action_required ?? '').trim() ||
                    (toSave.message ?? '').trim() ||
                    '';
                const split = splitDetailAndHazard(detail);
                setDiagnosisDetailText(split.detail);
                setHazardText(split.hazard);
                setTradeLabel((toSave.trade ?? '').trim());
                setTradeDetailLabel((toSave.trade_detail ?? '').trim());
                setRequiresClarification(Boolean(toSave.requires_clarification));
                setIsRejectedDiagnosis(Boolean((toSave as any).rejected));
                setIsUnservicedDiagnosis(Boolean((toSave as any).unserviced));
                setActionRequiredRaw((toSave.action_required ?? '').trim());
                setDiagnosisTitle(toSave.diagnosis);
                setCurrentDiagnosis(toSave);
                const finalThoughtRaw = (thought || '').trim();
                setThoughtText(
                    finalThoughtRaw ? cleanThoughtSentenceStarts(finalThoughtRaw) : ''
                );

                const deviceType =
                    typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
                        ? 'mobile'
                        : 'desktop';
                const persistImageUrls =
                    uploadedImageSourcesRef.current.length > 0
                        ? uploadedImageSourcesRef.current.slice(0, 4)
                        : [img];
                const saveResult = await patchConversation(cid, {
                    title: toSave.diagnosis || 'New Diagnosis',
                    image_url: persistImageUrls[0] ?? img,
                    image_urls: persistImageUrls,
                    diagnosis: toSave as unknown,
                    device: deviceType,
                    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                    user_id: user?.id ?? null,
                });
                if (saveResult.ok) {
                    try {
                        sessionStorage.setItem(providerHydrateSessionKey(cid), '1');
                    } catch {
                        /* ignore */
                    }
                }
            } catch {
                /* geolocation, network, or hydrate failed */
            }
        },
        [conversationId, supabase, user?.id]
    );

    useEffect(() => {
        return () => {
            thoughtStreamGenRef.current += 1;
        };
    }, []);

    const runInitialDiagnosis = useCallback(
        async (
            img: string,
            prompt: string,
            selectedService: string | null,
            imageSourcesOverride?: string[]
        ) => {
            const cid = conversationId ?? null;
            // Prevent duplicate in-flight calls (Next dev Strict Mode can double-invoke effects).
            if (!cid) return null;
            if (didRunDiagnosisRef.current === cid) return null;
            didRunDiagnosisRef.current = cid;
            thoughtStreamGenRef.current += 1;
            setThoughtText('');
            setImageThoughtBreakdown([]);
            setShowDetailedThinking(false);
            setIsDiagnosing(true);
            setIsImageAnalysing(true);
            setIsDiagnosingRetrying(false);
            setIsDetailStageReady(false);
            setDiagnosisFailureMessage(null);
            try {
                const fetchDiagnoseScan = async (
                    payload: Record<string, unknown>,
                    onThought: (t: string) => void,
                    gen: number
                ): Promise<string> => {
                    const res = await fetch('/api/diagnose', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...payload, stream: true }),
                    });
                    if (!res.ok) {
                        const t = await res.text();
                        throw new DiagnoseStreamHttpError(res.status, t);
                    }
                    const routeThought = (txt: string) => {
                        if (thoughtStreamGenRef.current !== gen) return;
                        onThought(txt);
                    };
                    if (responseLooksLikeDiagnoseNdjson(res)) {
                        return consumeDiagnoseNdjsonStream(res, { onThought: routeThought });
                    }
                    const full = await res.text();
                    const extracted = parseThoughtFromResponse(full).trim();
                    if (extracted) routeThought(extracted);
                    return full;
                };

                const applyRateLimitOrQuotaMessage = (bodyText: string) => {
                    try {
                        const parsed = JSON.parse(bodyText);
                        const retryAfterSeconds = Number(parsed?.retryAfterSeconds);
                        const waitMinutes = Number.isFinite(retryAfterSeconds)
                            ? Math.max(1, Math.ceil(retryAfterSeconds / 60))
                            : null;
                        const waitText = waitMinutes
                            ? `${waitMinutes} minute${waitMinutes === 1 ? '' : 's'}`
                            : 'a few minutes';
                        const isRateLimited = String(parsed?.error || '').toLowerCase() === 'rate_limited';
                        const isQuotaExceeded = String(parsed?.error || '').toLowerCase() === 'quota_exceeded';
                        setDiagnosisFailureMessage(
                            isRateLimited
                                ? `You are sending requests too quickly. Please wait about ${waitText}, then tap Retry Report.`
                                : isQuotaExceeded
                                  ? String(parsed?.message || 'You have reached your diagnosis limit for now.')
                                  : String(
                                        parsed?.message ||
                                            parsed?.error ||
                                            'Mendr is busy right now. Please try again shortly.'
                                    )
                        );
                    } catch {
                        setDiagnosisFailureMessage('Mendr is busy right now. Please try again shortly.');
                    }
                };

                for (let attempt = 1; attempt <= DIAGNOSIS_MAX_RETRIES; attempt += 1) {
                    setIsDiagnosingRetrying(attempt > 1);
                    const catalog = await parseServiceCatalogOrFail();
                    if (!catalog) {
                        if (attempt < DIAGNOSIS_MAX_RETRIES) {
                            await sleep(500 * attempt);
                            continue;
                        }
                        return null;
                    }

                    const analysisSources = Array.from(
                        new Set(
                            [
                                ...(Array.isArray(imageSourcesOverride) ? imageSourcesOverride : []),
                                img,
                            ].filter((src) => isLikelyRenderableImageSource(src))
                        )
                    );
                    if (analysisSources.length === 0) analysisSources.push(img);
                    // All images are sent with equal weight — no primary/attachment distinction.
                    thoughtStreamGenRef.current += 1;
                    const genFull = thoughtStreamGenRef.current;
                    let text: string;
                    let gotStreamThought = false;
                    try {
                        const latestDiagnosis = currentDiagnosisRef.current;
                        const ar = (latestDiagnosis?.action_required ?? '').trim();
                        const hasRejectablePrior =
                            Boolean(latestDiagnosis?.diagnosis?.trim()) &&
                            ar.length > 0 &&
                            !/^n\/a$/i.test(ar);
                        const previousDiagnosisPayload = hasRejectablePrior
                            ? {
                                  diagnosis: latestDiagnosis!.diagnosis,
                                  trade: latestDiagnosis!.trade,
                                  trade_detail: latestDiagnosis!.trade_detail ?? '',
                                  message: latestDiagnosis!.message ?? '',
                                  action_required: latestDiagnosis!.action_required ?? '',
                              }
                            : null;
                        text = await fetchDiagnoseScan(
                            {
                                imageUrls: analysisSources,
                                serviceCatalog: catalog,
                                ...(buildPromptWithContext(prompt).trim()
                                    ? { textQuery: buildPromptWithContext(prompt).trim() }
                                    : {}),
                                ...buildSelectedTradePayload(selectedService),
                                ...(previousDiagnosisPayload
                                    ? {
                                          diagnosisRejected: true,
                                          previousDiagnosis: previousDiagnosisPayload,
                                      }
                                    : {}),
                                ...(providersForDiagnoseRef.current.length > 0
                                    ? { providers: providersForDiagnoseRef.current }
                                    : {}),
                            },
                            (t) => {
                                if (thoughtStreamGenRef.current !== genFull) return;
                                if (!gotStreamThought) {
                                    gotStreamThought = true;
                                    setIsImageAnalysing(false);
                                }
                                setThoughtText(t);
                            },
                            genFull
                        );
                    } catch (e) {
                        if (e instanceof DiagnoseStreamHttpError) {
                            if (e.status === 429) {
                                applyRateLimitOrQuotaMessage(e.bodyText);
                                return null;
                            }
                            if (attempt < DIAGNOSIS_MAX_RETRIES) {
                                await sleep(700 * attempt);
                                continue;
                            }
                            setDiagnosisFailureMessage(
                                'We could not finish your Mendr Report automatically. Please retry now.'
                            );
                            return null;
                        }
                        throw e;
                    }

                    if (!gotStreamThought) {
                        setIsImageAnalysing(false);
                    }

                    const diag = parseDiagnosisFromModelResponse(text);
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
                    const breakdownFromDiag =
                        Array.isArray((diag as any)?.image_thought_breakdown) &&
                        (diag as any).image_thought_breakdown.every((x: unknown) => typeof x === 'string')
                            ? ((diag as any).image_thought_breakdown as string[])
                            : Array.isArray((diag as any)?.image_descriptions)
                              ? ((diag as any).image_descriptions as unknown[])
                                    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
                              : []
                            ;
                    const finalThoughtRaw = thought.trim();
                    const diagWithThought: DiagnosisData = {
                        ...diag,
                        thinking: thought,
                        ...(breakdownFromDiag.length > 0
                            ? { image_thought_breakdown: breakdownFromDiag }
                            : {}),
                        // Persist user clarification history so page refresh restores message chips/list.
                        customer_info_items: buildCustomerInfoItemsForPersistence(prompt),
                    } as DiagnosisData;
                    const toSave = diagWithThought;
                    const detail =
                        (toSave.action_required ?? '').trim() ||
                        (toSave.message ?? '').trim() ||
                        '';
                    const split = splitDetailAndHazard(detail);
                    setDiagnosisDetailText(split.detail);
                    setHazardText(split.hazard);
                    setTradeLabel((toSave.trade ?? '').trim());
                    setTradeDetailLabel((toSave.trade_detail ?? '').trim());
                    setRequiresClarification(Boolean((toSave as DiagnosisData).requires_clarification));
                    setIsRejectedDiagnosis(Boolean((toSave as any).rejected));
                    setIsUnservicedDiagnosis(Boolean((toSave as any).unserviced));
                    setActionRequiredRaw((toSave.action_required ?? '').trim());
                    setDiagnosisTitle(toSave.diagnosis);
                    setCurrentDiagnosis(toSave);
                    setDiagnosisFailureMessage(null);
                    setIsDetailStageReady(true);
                    setThoughtText(
                        finalThoughtRaw ? cleanThoughtSentenceStarts(finalThoughtRaw) : ''
                    );
                    setImageThoughtBreakdown(breakdownFromDiag);

                    const deviceType =
                        typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
                            ? 'mobile'
                            : 'desktop';
                    const persistImageUrls =
                        uploadedImageSourcesRef.current.length > 0
                            ? uploadedImageSourcesRef.current.slice(0, 4)
                            : [img];
                    const saveResult = await patchConversation(cid, {
                        title: toSave.diagnosis || 'New Diagnosis',
                        image_url: persistImageUrls[0] ?? img,
                        image_urls: persistImageUrls,
                        diagnosis: toSave as unknown,
                        initial_image_description: (prompt ?? '').trim() || null,
                        device: deviceType,
                        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                        user_id: user?.id ?? null,
                    });
                    if (!saveResult.ok) {
                        setDiagnosisFailureMessage(
                            saveResult.error ||
                                'We could not save your Mendr Report. Please check your connection and try again.'
                        );
                        return null;
                    }

                    const latestConv = await fetchConversationDiagnosis(cid);
                    if (latestConv.ok) {
                        prewarmProvidersForConversation(latestConv.data, toSave);
                        const eligible = isDiagnosisAccurateForPrefetch(toSave);
                        if (eligible.eligible) {
                            trackEvent('prefetch_attempted', { diagnosis_id: cid });
                            void prefetchProvidersIntoMatchCache(cid, latestConv.data, toSave)
                                .then(() => {
                                    trackEvent('prefetch_succeeded', { diagnosis_id: cid });
                                })
                                .catch(() => {
                                    trackEvent('prefetch_skipped', {
                                        diagnosis_id: cid,
                                        reason: 'prefetch_error',
                                    });
                                });
                        } else {
                            trackEvent('prefetch_skipped', {
                                diagnosis_id: cid,
                                reason: eligible.reason || 'not_eligible',
                            });
                        }
                    }

                    void maybeHydrateWithProviders(
                        toSave,
                        img,
                        catalog,
                        buildPromptWithContext(prompt).trim()
                    );

                    return toSave;
                }
                setDiagnosisFailureMessage(
                    'We could not complete your Mendr Report right now. Please retry now.'
                );
                return null;
            } finally {
                setIsDiagnosing(false);
                setIsImageAnalysing(false);
                setIsDiagnosingRetrying(false);
            }
        },
        [
            buildPromptWithContext,
            buildCustomerInfoItemsForPersistence,
            conversationId,
            customerAddress,
            maybeHydrateWithProviders,
            parseServiceCatalogOrFail,
            prewarmProvidersForConversation,
            user?.id,
        ]
    );

    useEffect(() => {
        customerInfoItemsRef.current = customerInfoItems;
    }, [customerInfoItems]);

    useEffect(() => {
        uploadedImageSourcesRef.current = uploadedImageSources;
    }, [uploadedImageSources]);

    useEffect(() => {
        let cancelled = false;
        void fetchActiveServiceCatalogClient(supabase as any).then((labels) => {
            if (cancelled) return;
            setServiceCatalog(labels);
        });
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
            setCurrentDiagnosis(null);
            setDiagnosisTitle('Diagnosing…');
            // URL saved on /welcome after a successful upload — used if the client cannot read
            // the conversation row yet (slow network) or RLS hides rows created via the admin API.
            let pendingImageUrl: string | null = null;
            let pendingImageUrls: string[] = [];
            let pendingPromptFromWelcome: string | null = null;
            let pendingTradeFromWelcome: string | null = null;
            try {
                pendingImageUrl = sessionStorage.getItem(
                    `pending_diagnosis_image_url:${conversationId}`
                );
                const pendingImageUrlsRaw = sessionStorage.getItem(
                    `pending_diagnosis_image_urls:${conversationId}`
                );
                if (pendingImageUrlsRaw) {
                    const parsed = JSON.parse(pendingImageUrlsRaw) as unknown;
                    if (Array.isArray(parsed)) {
                        pendingImageUrls = parsed
                            .map((value) => (typeof value === 'string' ? value.trim() : ''))
                            .filter((value) => value.length > 0);
                    }
                }
                if (pendingImageUrls.length === 0) {
                    pendingImageUrls = getPendingDiagnosisImages(conversationId);
                }
                if (pendingImageUrl) setImageSrc(pendingImageUrl);
                pendingPromptFromWelcome = sessionStorage.getItem(
                    `pending_diagnosis_prompt:${conversationId}`
                );
                pendingTradeFromWelcome = sessionStorage.getItem(
                    `pending_diagnosis_trade:${conversationId}`
                );
            } catch {
                // Ignore session storage issues.
            }

            const conv =
                prefetchedConversation !== undefined
                    ? { ok: true as const, data: prefetchedConversation }
                    : await fetchConversationDiagnosis(conversationId);
            const data = conv.ok ? conv.data : null;

            if (cancelled) return;
            const clat = data != null ? (data as ConversationDiagnosisRow).customer_lat : null;
            const clng = data != null ? (data as ConversationDiagnosisRow).customer_lng : null;
            if (
                typeof clat === 'number' &&
                typeof clng === 'number' &&
                Number.isFinite(clat) &&
                Number.isFinite(clng)
            ) {
                savedCustomerCoordsRef.current = { lat: clat, lng: clng };
            } else {
                savedCustomerCoordsRef.current = null;
            }

            // Prefer the persisted `imageUrls` array (multi-image migration) and fall back
            // to the legacy single `image_url` for older rows.
            const persistedImageUrlsRaw = (() => {
                const a = (data as any)?.imageUrls;
                if (Array.isArray(a)) return a as unknown[];
                const b = (data as any)?.image_urls;
                if (Array.isArray(b)) return b as unknown[];
                return [];
            })();
            const persistedImageUrls = persistedImageUrlsRaw
                .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
                .map((u) => u.trim());
            const img = (data as any)?.image_url as string | null;
            const candidateImageUrl =
                (persistedImageUrls[0] && persistedImageUrls[0]) ||
                (img && String(img).trim()) ||
                pendingImageUrl ||
                null;
            const normalizedImageUrl = await ensureRenderableImageSource(candidateImageUrl);
            const imageUrlForDiagnosis = isLikelyRenderableImageSource(normalizedImageUrl)
                ? normalizedImageUrl
                : null;
            setImageSrc(imageUrlForDiagnosis);
            const normalizedPendingImageUrls = (
                await Promise.all(pendingImageUrls.map((src) => ensureRenderableImageSource(src)))
            ).filter((src): src is string => isLikelyRenderableImageSource(src));
            const normalizedPersistedImageUrls = (
                await Promise.all(persistedImageUrls.map((src) => ensureRenderableImageSource(src)))
            ).filter((src): src is string => isLikelyRenderableImageSource(src));
            // Preference order: persisted JSONB array > pending session storage > legacy single image_url.
            const baseSources =
                normalizedPersistedImageUrls.length > 0
                    ? normalizedPersistedImageUrls
                    : normalizedPendingImageUrls;
            const imageSourcesForDisplay = [
                ...baseSources,
                ...(imageUrlForDiagnosis && !baseSources.includes(imageUrlForDiagnosis)
                    ? [imageUrlForDiagnosis]
                    : []),
            ].slice(0, 4);
            setUploadedImageSources(imageSourcesForDisplay);
            const promptFromDb = ((data as any)?.initial_image_description as string | null) ?? '';
            const prompt = promptFromDb.trim() || (pendingPromptFromWelcome ?? '').trim();
            const persistedCustomerInfoItems = getPersistedCustomerInfoItems(data, prompt);
            setCustomerInfoItems(persistedCustomerInfoItems);
            setCustomerAddress(String((data as any)?.customer_address ?? '').trim());
            const persistedTradeHint =
                data &&
                typeof (data as any)?.diagnosis === 'object' &&
                (data as any)?.diagnosis !== null &&
                typeof ((data as any).diagnosis as any).selected_trade_hint === 'string'
                    ? String(((data as any).diagnosis as any).selected_trade_hint).trim()
                    : '';
            setSelectedTradeHint(
                persistedTradeHint || (pendingTradeFromWelcome ?? '').trim() || tradeFromQuery.trim()
            );
            const existingDiagnosis = (data as any)?.diagnosis as DiagnosisData | null;

            if (existingDiagnosis && shouldSkipDiagnosisPipeline(existingDiagnosis)) {
                setDiagnosisTitle(existingDiagnosis.diagnosis);
                setIsDetailStageReady(true);
                setRequiresClarification(Boolean(existingDiagnosis.requires_clarification));
                setIsRejectedDiagnosis(Boolean((existingDiagnosis as any).rejected));
                setIsUnservicedDiagnosis(Boolean((existingDiagnosis as any).unserviced));
                setActionRequiredRaw((existingDiagnosis.action_required ?? '').trim());
                const persistedThinking = (existingDiagnosis.thinking ?? '').trim();
                const persistedImageDescriptions =
                    Array.isArray((existingDiagnosis as any)?.image_descriptions) &&
                    typeof (existingDiagnosis as any).image_descriptions[0] === 'string'
                        ? String((existingDiagnosis as any).image_descriptions[0]).trim()
                        : '';
                const persistedImageThoughtBreakdown = Array.isArray(
                    (existingDiagnosis as any)?.image_thought_breakdown
                )
                    ? ((existingDiagnosis as any).image_thought_breakdown as unknown[])
                          .filter((value): value is string => typeof value === 'string')
                          .map((value) => value.trim())
                          .filter(Boolean)
                    : [];
                setThoughtText(
                    cleanThoughtSentenceStarts(persistedThinking || persistedImageDescriptions)
                );
                setImageThoughtBreakdown(persistedImageThoughtBreakdown);
                const persistedSplit = splitDetailAndHazard(
                    (existingDiagnosis.action_required ?? '').trim() ||
                        (existingDiagnosis.message ?? '').trim() ||
                        ''
                );
                setDiagnosisDetailText(persistedSplit.detail);
                setHazardText(persistedSplit.hazard);
                setTradeLabel((existingDiagnosis.trade ?? '').trim());
                setTradeDetailLabel((existingDiagnosis.trade_detail ?? '').trim());
                setCurrentDiagnosis(existingDiagnosis);
                if (imageUrlForDiagnosis) {
                    const catalog = await fetchActiveServiceCatalogClient(supabase as any);
                    if (!cancelled && catalog.length > 0) {
                        setServiceCatalog(catalog);
                        void maybeHydrateWithProviders(
                            existingDiagnosis,
                            imageUrlForDiagnosis,
                            catalog,
                            prompt
                        );
                    }
                }
                return;
            }

            if (!imageUrlForDiagnosis) {
                setDiagnosisFailureMessage(
                    'No uploaded photo was found for this report. Please choose a new photo.'
                );
                return;
            }
            const selectedService = (
                persistedTradeHint ||
                (pendingTradeFromWelcome ?? '').trim() ||
                tradeFromQuery.trim()
            ) || null;
            await runInitialDiagnosis(
                imageUrlForDiagnosis,
                prompt,
                selectedService,
                imageSourcesForDisplay
            );
        };

        void bootstrap().finally(() => {
            if (!cancelled) setIsPageLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [
        conversationId,
        getPersistedCustomerInfoItems,
        maybeHydrateWithProviders,
        runInitialDiagnosis,
        supabase,
        tradeFromQuery,
        prefetchedConversation,
    ]);


    const showThoughtSkeleton = (isPageLoading || isImageAnalysing) && !thoughtText.trim();
    const showSkeleton = isPageLoading || isImageAnalysing || (isDiagnosing && !isDetailStageReady);
    const hasDiagnosisFailure = !showSkeleton && Boolean(diagnosisFailureMessage);
    const isUnrelatedDiagnosis =
        (isRejectedDiagnosis && !isUnservicedDiagnosis) ||
        diagnosisTitle.trim() === 'Photo Not Related to Home Maintenance';
    const isUnsupportedDiagnosis =
        tradeLabel.trim().toLowerCase() === 'n/a' ||
        diagnosisTitle.toLowerCase().includes('not currently supported') ||
        diagnosisTitle.toLowerCase().includes('not on mendr');
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
    const shouldAutoExpandMoreInfo = needsMoreBeforeMatch && !showSkeleton && !hasDiagnosisFailure;

    const canContinueToMatch =
        !showSkeleton &&
        !isMatchBlocked &&
        diagnosisTitle.trim().length > 0 &&
        !diagnosisTitle.toLowerCase().includes('diagnosing');
    const toSentence = (text: string): string => {
        const trimmed = text.trim();
        if (!trimmed) return '';
        const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
        return /[.!?]$/.test(capped) ? capped : `${capped}.`;
    };
    const clarificationQuestions =
        Array.isArray(currentDiagnosis?.clarification_questions)
            ? currentDiagnosis.clarification_questions
                  .map((q) => (typeof q === 'string' ? q.trim() : ''))
                  .map((q) => toSentence(q))
                  .filter((q) => q.length > 0)
            : [];
    const hasClarificationQuestions = clarificationQuestions.length > 0;

    // E2 — derive soft trade suggestions for the rejection UI. The classifier
    // emits the top 3 candidates it considered (see ClassificationResult);
    // we filter to ones we actually offer (present in the serviceCatalog —
    // N/A and unsupported trades dropped), drop zero-score entries, dedupe,
    // and cap at 3. Lets users tap "did you mean Security?" rather than
    // seeing a dead-end rejection.
    const tradeCandidates = Array.isArray(currentDiagnosis?.trade_candidates)
        ? currentDiagnosis.trade_candidates
        : [];
    const serviceCatalogLower = new Set(serviceCatalog.map((s) => s.toLowerCase()));
    const seenTrades = new Set<string>();
    const tradeSuggestions: { trade: string; score: number }[] = [];
    for (const c of tradeCandidates) {
        if (!c || typeof c.trade !== 'string') continue;
        const t = c.trade.trim();
        const tLower = t.toLowerCase();
        if (!t || tLower === 'n/a' || tLower === tradeLabel.trim().toLowerCase()) continue;
        if (seenTrades.has(tLower)) continue;
        if (serviceCatalog.length > 0 && !serviceCatalogLower.has(tLower)) continue;
        if (typeof c.score === 'number' && c.score <= 0) continue;
        seenTrades.add(tLower);
        tradeSuggestions.push({ trade: t, score: typeof c.score === 'number' ? c.score : 0 });
        if (tradeSuggestions.length >= 3) break;
    }
    const hasTradeSuggestions = tradeSuggestions.length > 0;

    // When the classifier returns trade='N/A' it can mean two very different
    // things: (a) "I don't know which trade — please ask the user" or
    // (b) "this trade isn't in the catalogue". Only (b) should show the
    // service-blocked copy. If the model has clarification questions for the
    // user, those win — we ask rather than dead-end. Reproduces the bug from
    // the 2026-05-23 garage-spring failure case where users saw "not on
    // Mendr's list yet" instead of clarification questions.
    const shouldShowClarification = requiresClarification && hasClarificationQuestions;

    const resolvedDetailText = shouldShowClarification
        ? 'Please pick one of the quick options below or type a short note so we can refine your diagnosis.'
        : isServiceBlocked
          ? DIAGNOSIS_REJECT_DETAIL
          : requiresClarification
            ? 'Please add a short note about the issue below so we can refine your diagnosis.'
            : diagnosisDetailText;

    const diagnosisHeadline = shouldShowClarification
        ? 'Need More Information'
        : isServiceBlocked
          ? DIAGNOSIS_REJECT_HEADLINE
          : requiresClarification
            ? 'Need More Information'
            : diagnosisTitle;

    const pageTitle = 'Your Mendr Report';
    const pageSubtitle = isServiceBlocked && !shouldShowClarification
        ? "We could not match this job. Add detail below or try a closer photo, and we'll re-scan."
        : 'Here is what your photos suggest and sensible next steps for booking a contractor.';
    const stickyHeaderTitle =
        showSkeleton || !isDetailStageReady
            ? diagnosisTitle.trim() || 'Diagnosing…'
            : diagnosisHeadline;
    const displayThoughtText = thoughtText.trim();
    const activeFullscreenImageSrc =
        fullscreenImageIndex != null && fullscreenImageIndex >= 0
            ? uploadedImageSources[fullscreenImageIndex] ?? null
            : null;
    const activeFullscreenThought =
        fullscreenImageIndex != null && fullscreenImageIndex >= 0
            ? (imageThoughtBreakdown[fullscreenImageIndex] ?? '').trim()
            : '';
    const goToPrevFullscreenImage = useCallback(() => {
        if (!uploadedImageSources.length || fullscreenImageIndex == null) return;
        setFullscreenImageIndex((prev) => {
            if (prev == null) return prev;
            return prev <= 0 ? uploadedImageSources.length - 1 : prev - 1;
        });
    }, [fullscreenImageIndex, uploadedImageSources.length]);
    const goToNextFullscreenImage = useCallback(() => {
        if (!uploadedImageSources.length || fullscreenImageIndex == null) return;
        setFullscreenImageIndex((prev) => {
            if (prev == null) return prev;
            return prev >= uploadedImageSources.length - 1 ? 0 : prev + 1;
        });
    }, [fullscreenImageIndex, uploadedImageSources.length]);

    useEffect(() => {
        if (shouldAutoExpandMoreInfo) {
            setShowAddInfoScreen(true);
        }
    }, [shouldAutoExpandMoreInfo]);

    useEffect(() => {
        const updateStickyHeaderTitle = () => {
            const anchor = headerTitleAnchorRef.current;
            if (!anchor) return;
            // getBoundingClientRect gives viewport-relative position regardless of scroll container.
            setUseStickyHeaderName(anchor.getBoundingClientRect().bottom <= HEADER_HEIGHT_PX);
        };

        const scrollEl = scrollContainerRef.current;
        if (!scrollEl) return;
        updateStickyHeaderTitle();
        scrollEl.addEventListener('scroll', updateStickyHeaderTitle, { passive: true });
        window.addEventListener('resize', updateStickyHeaderTitle);
        return () => {
            scrollEl.removeEventListener('scroll', updateStickyHeaderTitle);
            window.removeEventListener('resize', updateStickyHeaderTitle);
        };
    }, []);

    // E2 — soft trade-suggestion chip handler. When the rejection UI surfaces
    // a chip ("Did you mean Security?"), tapping it sets the trade hint and
    // re-runs the diagnosis with that hint. The classifier prompt already
    // biases toward `userSelectedTrade` when present, so we expect the next
    // pass to land on the picked trade with higher confidence.
    const handleTradeCandidatePick = async (candidateTrade: string) => {
        const picked = candidateTrade.trim();
        if (!picked || !imageSrc || isDiagnosing || showSkeleton) return;
        setSelectedTradeHint(picked);
        didRunDiagnosisRef.current = null;
        setDiagnosisTitle('Diagnosing…');
        const joinedInfo = customerInfoItems.join('\n\n').trim();
        await runInitialDiagnosis(
            imageSrc,
            joinedInfo,
            picked,
            uploadedImageSources,
        );
    };

    const handleRescanReport = async () => {
        const trimmed = infoText.trim();
        if (!trimmed || !imageSrc) return;
        setShowAddInfoScreen(false);

        const nextItems = [...customerInfoItems, trimmed];
        const joinedInfo = nextItems.join('\n\n').trim();
        setCustomerInfoItems(nextItems);
        setInfoText('');

        if (conversationId) {
            try {
                sessionStorage.removeItem(providerHydrateSessionKey(conversationId));
            } catch {
                /* ignore */
            }
            providersForDiagnoseRef.current = [];
            const noteSave = await patchConversation(conversationId, {
                initial_image_description: joinedInfo || null,
            });
            if (!noteSave.ok) {
                setDiagnosisFailureMessage(
                    noteSave.error || 'We could not save your notes. Please try again.'
                );
                return;
            }
        }

        didRunDiagnosisRef.current = null;
        setDiagnosisTitle('Diagnosing…');
        setCustomerInfoItems(nextItems);
        await runInitialDiagnosis(
            imageSrc,
            joinedInfo,
            selectedTradeHint.trim() || null,
            uploadedImageSources
        );
    };

    const handleClarificationChoice = async (choice: string) => {
        const trimmed = choice.trim();
        if (!trimmed || !imageSrc || isDiagnosing || showSkeleton) return;
        setClarificationSubmitLoading(true);
        const nextItems = [...customerInfoItems, trimmed];
        const joinedInfo = nextItems.join('\n\n').trim();
        setCustomerInfoItems(nextItems);
        setInfoText('');
        setShowAddInfoScreen(false);
        didRunDiagnosisRef.current = null;
        setDiagnosisTitle('Diagnosing…');
        if (conversationId) {
            try {
                sessionStorage.removeItem(providerHydrateSessionKey(conversationId));
            } catch {
                /* ignore */
            }
            providersForDiagnoseRef.current = [];
            const noteSave = await patchConversation(conversationId, {
                initial_image_description: joinedInfo || null,
            });
            if (!noteSave.ok) {
                setDiagnosisFailureMessage(
                    noteSave.error || 'We could not save your notes. Please try again.'
                );
                return;
            }
        }
        try {
            await runInitialDiagnosis(
                imageSrc,
                joinedInfo,
                selectedTradeHint.trim() || null,
                uploadedImageSources
            );
        } finally {
            setClarificationSubmitLoading(false);
            setClarificationCustomText('');
        }
    };

    const handleShareReport = async () => {
        if (!conversationId || typeof window === 'undefined') return;
        const url = new URL(`/report/${encodeURIComponent(conversationId)}`, window.location.origin);
        if (customerAddress) {
            url.searchParams.set('location', customerAddress);
        }
        const shareData = {
            title: 'Mendr Report',
            text: customerAddress
                ? `Mendr report for ${customerAddress}`
                : 'Mendr report',
            url: url.toString(),
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
                return;
            }
        } catch {
            // fall through to clipboard
        }
        try {
            await navigator.clipboard.writeText(url.toString());
        } catch {
            // ignore clipboard failures
        }
    };

    const fallbackClarificationQuestions = [
        'It is not turning on.',
        'It is turning on, but not working correctly.',
        'There is visible damage, leakage, or unusual noise.',
    ];
    const clarificationOptions = (
        hasClarificationQuestions ? clarificationQuestions : fallbackClarificationQuestions
    ).slice(0, 3);
    const tradeForClarificationPrompt = (tradeLabel || selectedTradeHint || '').trim();
    const clarificationTradeIsPlaceholder = !tradeForClarificationPrompt || /^n\/a$/i.test(tradeForClarificationPrompt);
    const clarificationPrompt = clarificationTradeIsPlaceholder
        ? 'Which option best describes the issue?'
        : `Which option best describes the ${tradeForClarificationPrompt.toLowerCase()} issue?`;

    // Rejected / unsupported responses still set requires_clarification on the API so users can add
    // context, but the gate-style defaults do not apply — use "Did We Miss Something?" instead.
    const showClarificationFooter =
        requiresClarification && !isServiceBlocked && !(clarificationSubmitLoading && isDiagnosing);

    const diagnosisFooter = showClarificationFooter ? (
        <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">{clarificationPrompt}</p>
            {clarificationOptions.map((question, idx) => {
                const letter = String.fromCharCode(65 + idx);
                return (
                    <div key={`${idx}-${question}`} className="flex flex-row gap-4 items-center">
                        <Badge
                            variant="secondary"
                            className="size-7"
                        >
                            {letter}
                        </Badge>
                        <Button
                            type="button"
                            variant="outline"
                            className="flex flex-1 h-12 justify-start rounded-xl border-black/[0.10] bg-white hover:bg-black/[0.03]"
                            disabled={isDiagnosing || showSkeleton}
                            onClick={() => void handleClarificationChoice(question)}
                        >
                            <span className="text-sm text-foreground font-normal truncate">{question}</span>
                        </Button>
                    </div>
                );
            })}
            <div className="flex flex-row gap-4 items-start">
                <Badge variant="secondary" className="size-7 mt-2">
                    D
                </Badge>
                <div className="flex flex-1 flex-col gap-2">
                    <input
                        type="text"
                        value={clarificationCustomText}
                        onChange={(e) => setClarificationCustomText(e.target.value)}
                        placeholder="Other: type your answer"
                        className="h-12 w-full rounded-xl border border-black/[0.10] bg-white px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-black/15"
                        disabled={isDiagnosing || showSkeleton}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full rounded-xl border-black/[0.10] bg-white hover:bg-black/[0.03]"
                        disabled={
                            isDiagnosing || showSkeleton || clarificationCustomText.trim().length === 0
                        }
                        onClick={() => void handleClarificationChoice(clarificationCustomText)}
                    >
                        Submit Answer
                    </Button>
                </div>
            </div>
        </div>
    ) : (
        <Button
            className="h-10 w-full"
            disabled={!canContinueToMatch || isDiagnosing || shouldAutoExpandMoreInfo}
            onClick={() => {
                if (!conversationId) return;
                const key = `pending_diagnosis_image_url:${conversationId}`;
                const listKey = `pending_diagnosis_image_urls:${conversationId}`;
                try { sessionStorage.removeItem(key); } catch {}
                try { sessionStorage.removeItem(listKey); } catch {}
                try { localStorage.removeItem(key); } catch {}
                writeMatchTradeContextStorage(
                    conversationId,
                    tradeLabel || selectedTradeHint,
                    tradeDetailLabel || tradeLabel || selectedTradeHint
                );
                router.push(`/match/${encodeURIComponent(conversationId)}`);
            }}
        >
            Find Contractors
        </Button>
    );

    return (
        <>
            <DiagnosisLeaveDialog
                open={leaveDialogOpen}
                onOpenChange={setLeaveDialogOpen}
                onLeave={() => router.back()}
            />

            <div className="h-dvh overflow-hidden overscroll-none flex flex-col bg-background">
                <div className="sticky top-0 z-20 shrink-0 bg-background px-6 py-3">
                    <Button
                        variant="secondary"
                        size="icon"
                        className="size-10"
                        onClick={() => setLeaveDialogOpen(true)}
                        aria-label="Go Back"
                    >
                        <ArrowLeft weight="bold" />
                    </Button>
                </div>

                {/* Scrollable content */}
                <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
                    <div className="flex flex-col w-full max-w-3xl mx-auto gap-6 p-6">

                {/* Diagnosis title + badge */}
                <div className="flex w-full flex-col gap-3">
                    {showSkeleton || !isDetailStageReady ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <Skeleton className="h-8 w-[88%] max-w-md" />
                            <Skeleton className="h-6 w-[62%] max-w-sm md:hidden" />
                        </div>
                    ) : (
                        <h2 className="w-full min-w-0 text-2xl font-bold break-words">
                            {diagnosisHeadline}
                        </h2>
                    )}
                    {showSkeleton || !isDetailStageReady ? (
                        <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
                    ) : (
                        <Badge variant="secondary" className="w-fit">
                            {isServiceBlocked
                                ? "Can't match"
                                : requiresClarification
                                  ? ''
                                  : tradeLabel || selectedTradeHint || 'Not Specified'}
                        </Badge>
                    )}
                </div>

                <div className="flex flex-col gap-3">
                    {uploadedImageSources.length > 0 ? (
                        <div className="overflow-x-auto">
                            <div className="flex min-w-full gap-2 px-1">
                                {uploadedImageSources.map((src, idx) => (
                                    <button
                                        key={`${src}-${idx}`}
                                        type="button"
                                        className="h-40 w-40 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-background text-left sm:h-44 sm:w-44"
                                        onClick={() => setFullscreenImageIndex(idx)}
                                        aria-label={`Open uploaded issue photo ${idx + 1}`}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={src}
                                            alt={`Uploaded issue photo ${idx + 1}`}
                                            className="h-full w-full object-cover"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : showSkeleton ? (
                        <Skeleton className="h-52 w-full rounded-2xl" />
                    ) : null}

                    {/* Thought text */}
                    {showThoughtSkeleton ? (
                        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading analysis">
                            <Skeleton className="h-3.5 w-full" />
                            <Skeleton className="h-3.5 w-[94%]" />
                            <Skeleton className="h-3.5 w-[88%]" />
                            <Skeleton className="h-3.5 w-[72%]" />
                            {isDiagnosingRetrying ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    We&apos;re Retrying Automatically
                                </p>
                            ) : null}
                        </div>
                    ) : displayThoughtText ? (
                        <div className="flex flex-col gap-3">
                            <p className="text-xs text-muted-foreground">{displayThoughtText}</p>
                            {imageThoughtBreakdown.length > 0 ? (
                                <button
                                    type="button"
                                    className="w-fit text-xs font-medium text-muted-foreground underline underline-offset-2"
                                    onClick={() => setShowDetailedThinking((prev) => !prev)}
                                >
                                    {showDetailedThinking ? 'Hide thinking' : 'Show thinking'}
                                </button>
                            ) : null}
                            {showDetailedThinking && imageThoughtBreakdown.length > 0 ? (
                                <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background p-3">
                                    {imageThoughtBreakdown.map((perImageThought, idx) => (
                                        <p key={`${idx}-${perImageThought}`} className="text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">{`Image ${idx + 1}: `}</span>
                                            {perImageThought}
                                        </p>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {/* Detail */}
                <>
                    {showSkeleton || !isDetailStageReady ? (
                        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading diagnosis details">
                            <div className="flex flex-col gap-2.5">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-[96%]" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-[80%]" />
                            </div>
                            <div className="flex flex-col gap-2.5">
                                <Skeleton className="h-3 w-32" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-[90%]" />
                                <Skeleton className="h-9 w-full rounded-xl" />
                            </div>
                        </div>
                    ) : hasDiagnosisFailure ? (
                        <p className="text-sm text-foreground">{diagnosisFailureMessage}</p>
                    ) : (
                        <>
                            <div className="flex flex-col gap-3">
                                {(resolvedDetailText || '')
                                    .split(/\n{2,}/)
                                    .map((para) => para.trim())
                                    .filter((para) => para.length > 0)
                                    .map((para, i) => (
                                        <p
                                            key={i}
                                            className="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
                                        >
                                            {para}
                                        </p>
                                    ))}
                            </div>
                            {hazardText && !isServiceBlocked ? (
                                <p className="text-sm text-foreground leading-relaxed border-l-2 border-destructive/50 pl-3">
                                    {hazardText}
                                </p>
                            ) : null}

                        </>
                    )}
                    {/* E2 — soft trade-suggestion chips. When the classifier
                        emitted candidate trades that match our catalogue,
                        show them as tappable chips so the user can pick
                        "did you mean X?" instead of seeing a dead-end. Only
                        renders on rejection (isServiceBlocked) and never
                        when we're already showing clarification questions. */}
                    {isServiceBlocked && !shouldShowClarification && hasTradeSuggestions ? (
                        <div
                            className="flex flex-col gap-2"
                            data-testid="trade-suggestions"
                        >
                            <p className="text-sm font-medium text-foreground">
                                Did you mean one of these instead?
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {tradeSuggestions.map((s) => (
                                    <Button
                                        key={s.trade}
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        disabled={isDiagnosing || showSkeleton}
                                        onClick={() => handleTradeCandidatePick(s.trade)}
                                    >
                                        {s.trade}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Tap a trade to re-diagnose with that hint.
                            </p>
                        </div>
                    ) : null}
                    {isServiceBlocked && serviceCatalog.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Trades Mendr can match today: {serviceCatalog.join(', ')}.
                        </p>
                    ) : null}
                </>

                {/* Did we miss something */}
                {!showSkeleton ? (
                    <div className="flex flex-col gap-3 text-center">
                        <Button
                            variant="secondary"
                            className="h-10 w-full"
                            onClick={() => setShowAddInfoScreen(true)}
                        >
                            Refine Diagnosis
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Add a short note or an extra photo so the next pass can focus on the right fault.
                        </p>
                    </div>
                ) : null}

                    </div>{/* /max-w-3xl */}
                </div>{/* /scrollable */}

                {/* Fixed footer */}
                <div
                    ref={footerRef}
                    className="sticky bottom-0 shrink-0 bg-background px-6 py-3"
                >
                    <div className="w-full max-w-sm mx-auto">
                        {diagnosisFooter}
                    </div>
                </div>
                {/* Add info — full-screen overlay, start-page style */}
                {showAddInfoScreen && (
                    <div className="absolute inset-0 z-[300] flex flex-col overflow-hidden bg-background">
                        <div className="sticky top-0 z-20 shrink-0 bg-background px-6 py-3">
                            <div className="flex w-full items-center gap-3">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="size-10"
                                    onClick={() => setShowAddInfoScreen(false)}
                                    aria-label="Go back"
                                >
                                    <ArrowLeft weight="bold" aria-hidden />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-0">
                            <div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
                                <StepHeading
                                    title="What Else Should We Know?"
                                    sub="Anything you add here is sent with your photos on the next diagnosis run."
                                />
                                <div className="flex flex-col gap-3">
                                    <Textarea
                                        autoFocus
                                        className="h-24 w-full"
                                        value={infoText}
                                        onChange={(e) => setInfoText(e.target.value)}
                                    />
                                    <div className="text-xs text-muted-foreground text-center">
                                        {infoText.trim().length >= MIN_DESCRIPTION_CHARS ? (
                                            <span>
                                                You have entered {infoText.trim().length} characters, you can continue.
                                            </span>
                                        ) : (
                                            <span>
                                                We require at least {MIN_DESCRIPTION_CHARS - infoText.trim().length} more
                                                characters to continue.
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="sticky bottom-0 shrink-0 bg-background p-6">
                            <div className="w-full max-w-sm mx-auto">
                                <Button
                                    type="button"
                                    className="h-10 w-full"
                                    disabled={
                                        infoText.trim().length < MIN_DESCRIPTION_CHARS ||
                                        isDiagnosing ||
                                        showSkeleton
                                    }
                                    onClick={() => void handleRescanReport()}
                                >
                                    {isDiagnosing ? 'Re-Scanning\u2026' : 'Re-Scan Report'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {activeFullscreenImageSrc ? (
                    <div className="absolute inset-0 z-[320] flex flex-col overflow-hidden bg-background">
                        <div className="sticky top-0 z-20 shrink-0 bg-background px-6 py-3">
                            <div className="flex w-full items-center justify-between gap-3">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="size-10"
                                    onClick={() => setFullscreenImageIndex(null)}
                                    aria-label="Close full screen image"
                                >
                                    <ArrowLeft weight="bold" aria-hidden />
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                    {`Image ${(fullscreenImageIndex ?? 0) + 1} of ${uploadedImageSources.length}`}
                                </p>
                            </div>
                        </div>
                        <div
                            className="flex min-h-0 flex-1 items-center justify-center p-6"
                            onTouchStart={(event) => {
                                fullscreenTouchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
                            }}
                            onTouchEnd={(event) => {
                                const startX = fullscreenTouchStartXRef.current;
                                const endX = event.changedTouches[0]?.clientX ?? null;
                                fullscreenTouchStartXRef.current = null;
                                if (startX == null || endX == null) return;
                                const deltaX = endX - startX;
                                const threshold = 40;
                                if (Math.abs(deltaX) < threshold) return;
                                if (deltaX > 0) {
                                    goToPrevFullscreenImage();
                                } else {
                                    goToNextFullscreenImage();
                                }
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={activeFullscreenImageSrc}
                                alt={`Full-screen uploaded issue photo ${(fullscreenImageIndex ?? 0) + 1}`}
                                className="max-h-full max-w-full rounded-lg object-contain"
                            />
                        </div>
                        <div className="sticky bottom-0 shrink-0 bg-background/95 p-6">
                            <div className="flex flex-col items-center gap-3 text-center">
                                {uploadedImageSources.length > 1 ? (
                                    <div className="flex items-center justify-center gap-1.5">
                                        {uploadedImageSources.map((_, idx) => {
                                            const isActive = idx === fullscreenImageIndex;
                                            return (
                                                <span
                                                    key={`fullscreen-dot-${idx}`}
                                                    className={
                                                        isActive
                                                            ? 'h-2 w-2 rounded-full bg-foreground'
                                                            : 'h-2 w-2 rounded-full bg-secondary'
                                                    }
                                                />
                                            );
                                        })}
                                    </div>
                                ) : null}
                                <p className="text-xs text-muted-foreground">
                                    {activeFullscreenThought ||
                                        `No unique image thought is available yet for image ${(fullscreenImageIndex ?? 0) + 1}.`}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : null}

            </div>{/* /h-dvh */}
        </>
    );
}

