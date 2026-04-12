/**
 * Route: /diagnosis/[id]
 * Diagnosis step in the scan flow.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getSupabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import type { DiagnosisData, Provider } from '@/app/chat/components/types';
import { DiagnosisLeaveDialog } from '@/components/diagnosis-leave-dialog';
import { ScanFlowShell } from '@/components/scan-flow-shell';
import { BetaCostEstimateCard } from '@/components/beta-cost-estimate-card';
import { cleanThoughtSentenceStarts, splitDetailAndHazard } from '@/lib/diagnosis-display';
import { parseDiagnosisFromModelResponse } from '@/lib/parse-diagnosis-from-model-response';
import {
    consumeDiagnoseNdjsonStream,
    DiagnoseStreamHttpError,
    responseLooksLikeDiagnoseNdjson,
} from '@/lib/diagnose-ndjson-stream';
import { writeMatchTradeContextStorage } from '@/lib/match-trade-context';
import { prewarmProvidersApi } from '@/features/match/api/client';
import { fetchActiveServiceCatalogClient } from '@/lib/services-catalog';
import {
    fetchConversationDiagnosis,
    invalidateConversationDiagnosisCache,
    patchConversation,
    type ConversationDiagnosisRow,
} from '@/lib/diagnoses-api';
import { mergeMarketRatesResponseIntoDiagnosis } from '@/lib/market-rates/merge-client';
import { useAuth } from '@/context/auth-context';
import { ArrowLeft, DownloadSimple, Share } from '@phosphor-icons/react';
import { Separator } from '@/components/ui/separator';

const URGENCY_LABELS: Record<string, string> = {
    immediate: 'Immediate',
    urgent: 'Urgent',
    soon: 'Soon',
    planned: 'Planned',
};

const DIAGNOSIS_MAX_RETRIES = 3;
const HEADER_STICKY_OFFSET_PX = 72;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_MATCH_RADIUS_METERS = 10_000;

function providerHydrateSessionKey(id: string): string {
    return `scandio_provider_hydrate_done:${id}`;
}

/** Single UX for unsupported trade and unrelated / non-maintenance photos (see `isServiceBlocked`). */
const DIAGNOSIS_REJECT_HEADLINE = 'We Can’t Match This Job on Scandio Yet';
const DIAGNOSIS_REJECT_DETAIL =
    'Either this does not look like a home repair or maintenance issue we can assess from your photo, or it is not a service on Scandio’s list yet. Add a clearer photo or a few words about the job below, then tap Re-Scan Report. If we still cannot match you, you will need to reach a specialist outside Scandio.';

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
    const [isMoreInfoExpanded, setIsMoreInfoExpanded] = useState(false);
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
    const [customerAddress, setCustomerAddress] = useState<string>('');
    const [selectedTradeHint, setSelectedTradeHint] = useState<string>('');
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
    const footerRef = useRef<HTMLDivElement | null>(null);
    const [footerHeight, setFooterHeight] = useState(0);
    const headerTitleAnchorRef = useRef<HTMLHeadingElement | null>(null);
    const [useStickyHeaderName, setUseStickyHeaderName] = useState(false);
    const [diagnosisForCostUi, setDiagnosisForCostUi] = useState<DiagnosisData | null>(null);
    const savedCustomerCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
    const providersForDiagnoseRef = useRef<Provider[]>([]);

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
            parts.push(`Location context from user: ${loc}`);
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
                'We could not load the service list for your Scandio Report. Please retry now.'
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
                setRequiresClarification(Boolean(diagWithThought.requires_clarification));
                setIsRejectedDiagnosis(Boolean((diagWithThought as any).rejected));
                setIsUnservicedDiagnosis(Boolean((diagWithThought as any).unserviced));
                setActionRequiredRaw((diagWithThought.action_required ?? '').trim());
                setDiagnosisTitle(diagWithThought.diagnosis);
                setDiagnosisForCostUi(diagWithThought);
                const finalThoughtRaw = (thought || '').trim();
                setThoughtText(
                    finalThoughtRaw ? cleanThoughtSentenceStarts(finalThoughtRaw) : ''
                );

                const deviceType =
                    typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
                        ? 'mobile'
                        : 'desktop';
                const saveResult = await patchConversation(cid, {
                    title: diagWithThought.diagnosis || 'New Diagnosis',
                    image_url: img,
                    diagnosis: diagWithThought as unknown,
                    urgency_key: diagWithThought.urgency_key ?? null,
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
        async (img: string, prompt: string, selectedService: string | null) => {
            const cid = conversationId ?? null;
            // Prevent duplicate in-flight calls (Next dev Strict Mode can double-invoke effects).
            if (!cid) return null;
            if (didRunDiagnosisRef.current === cid) return null;
            didRunDiagnosisRef.current = cid;
            thoughtStreamGenRef.current += 1;
            setThoughtText('');
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
                                            'Scandio is busy right now. Please try again shortly.'
                                    )
                        );
                    } catch {
                        setDiagnosisFailureMessage('Scandio is busy right now. Please try again shortly.');
                    }
                };

                for (let attempt = 1; attempt <= DIAGNOSIS_MAX_RETRIES; attempt += 1) {
                    let imageThoughtRaw = '';
                    setIsDiagnosingRetrying(attempt > 1);
                    const catalog = await parseServiceCatalogOrFail();
                    if (!catalog) {
                        if (attempt < DIAGNOSIS_MAX_RETRIES) {
                            await sleep(500 * attempt);
                            continue;
                        }
                        return null;
                    }

                    thoughtStreamGenRef.current += 1;
                    const genImg = thoughtStreamGenRef.current;
                    let imageAnalysisText: string;
                    try {
                        imageAnalysisText = await fetchDiagnoseScan(
                            {
                                image: img,
                                analysisPhase: 'image_thought_only',
                                serviceCatalog: catalog,
                                textQuery:
                                    'Analyse only the photo first. Output <thought> only about what is visibly happening and likely issue pattern. Keep it concise and practical.',
                                ...buildSelectedTradePayload(selectedService),
                            },
                            (t) => setThoughtText(t),
                            genImg
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
                                'We could not finish your Scandio Report automatically. Please retry now.'
                            );
                            return null;
                        }
                        throw e;
                    }

                    imageThoughtRaw = parseThoughtFromResponse(imageAnalysisText).trim();
                    const imageThought = imageThoughtRaw
                        ? cleanThoughtSentenceStarts(imageThoughtRaw)
                        : '';
                    if (imageThought) {
                        setThoughtText(imageThought);
                        if (cid) {
                            await patchConversation(cid, {
                                image_url: img,
                                initial_image_description: (prompt ?? '').trim() || null,
                                diagnosis: { thinking: imageThought } as unknown,
                            });
                        }
                    }
                    setIsImageAnalysing(false);

                    thoughtStreamGenRef.current += 1;
                    const genFull = thoughtStreamGenRef.current;
                    let text: string;
                    try {
                        text = await fetchDiagnoseScan(
                            {
                                image: img,
                                serviceCatalog: catalog,
                                ...(buildPromptWithContext(prompt).trim()
                                    ? { textQuery: buildPromptWithContext(prompt).trim() }
                                    : {}),
                                ...buildSelectedTradePayload(selectedService),
                                ...(imageThought ? { initial_image_description: imageThought } : {}),
                                ...(providersForDiagnoseRef.current.length > 0
                                    ? { providers: providersForDiagnoseRef.current }
                                    : {}),
                            },
                            (t) => setThoughtText(t),
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
                                'We could not finish your Scandio Report automatically. Please retry now.'
                            );
                            return null;
                        }
                        throw e;
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
                    const finalThoughtRaw = (thought || imageThoughtRaw).trim();
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
                    setIsRejectedDiagnosis(Boolean((diagWithThought as any).rejected));
                    setIsUnservicedDiagnosis(Boolean((diagWithThought as any).unserviced));
                    setActionRequiredRaw((diagWithThought.action_required ?? '').trim());
                    setDiagnosisTitle(diagWithThought.diagnosis);
                    setDiagnosisFailureMessage(null);
                    setDiagnosisForCostUi(diagWithThought);
                    setIsDetailStageReady(true);
                    setThoughtText(
                        finalThoughtRaw ? cleanThoughtSentenceStarts(finalThoughtRaw) : ''
                    );

                    const deviceType =
                        typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
                            ? 'mobile'
                            : 'desktop';
                    const saveResult = await patchConversation(cid, {
                        title: diagWithThought.diagnosis || 'New Diagnosis',
                        image_url: img,
                        diagnosis: diagWithThought as unknown,
                        urgency_key: diagWithThought.urgency_key ?? null,
                        initial_image_description: (prompt ?? '').trim() || null,
                        device: deviceType,
                        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                        user_id: user?.id ?? null,
                    });
                    if (!saveResult.ok) {
                        setDiagnosisFailureMessage(
                            saveResult.error ||
                                'We could not save your Scandio Report. Please check your connection and try again.'
                        );
                        return null;
                    }

                    const latestConv = await fetchConversationDiagnosis(cid);
                    if (latestConv.ok) {
                        prewarmProvidersForConversation(latestConv.data, diagWithThought);
                    }

                    void maybeHydrateWithProviders(
                        diagWithThought,
                        img,
                        catalog,
                        buildPromptWithContext(prompt).trim()
                    );

                    void (async () => {
                        try {
                            const addr =
                                typeof customerAddress === 'string' ? customerAddress.trim() : '';
                            const res = await fetch('/api/market-rates/research', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    trade: diagWithThought.trade,
                                    tradeDetail: diagWithThought.trade_detail,
                                    customerAddress: addr,
                                    conversationId: cid,
                                    baselineDiagnosis: diagWithThought,
                                }),
                            });
                            const json = (await res.json()) as Record<string, unknown>;
                            if (!json?.ok) return;
                            invalidateConversationDiagnosisCache(cid);
                            setDiagnosisForCostUi((prev) =>
                                mergeMarketRatesResponseIntoDiagnosis(prev, json)
                            );
                        } catch {
                            /* ignore */
                        }
                    })();

                    return diagWithThought;
                }
                setDiagnosisFailureMessage(
                    'We could not complete your Scandio Report right now. Please retry now.'
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
            conversationId,
            customerAddress,
            maybeHydrateWithProviders,
            parseServiceCatalogOrFail,
            prewarmProvidersForConversation,
            user?.id,
        ]
    );

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
            setDiagnosisForCostUi(null);
            setDiagnosisTitle('Diagnosing…');
            // URL saved on /welcome after a successful upload — used if the client cannot read
            // the conversation row yet (slow network) or RLS hides rows created via the admin API.
            let pendingImageUrl: string | null = null;
            let pendingPromptFromWelcome: string | null = null;
            let pendingTradeFromWelcome: string | null = null;
            try {
                pendingImageUrl = sessionStorage.getItem(
                    `pending_diagnosis_image_url:${conversationId}`
                );
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

            const img = (data as any)?.image_url as string | null;
            const imageUrlForDiagnosis = (img && String(img).trim()) || pendingImageUrl || null;
            setImageSrc(imageUrlForDiagnosis);
            const promptFromDb = ((data as any)?.initial_image_description as string | null) ?? '';
            const prompt = promptFromDb.trim() || (pendingPromptFromWelcome ?? '').trim();
            const customerInfo = prompt.trim();
            setCustomerInfoItems(customerInfo ? [customerInfo] : []);
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

            if (existingDiagnosis?.diagnosis) {
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
                setDiagnosisForCostUi(existingDiagnosis);
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
            await runInitialDiagnosis(imageUrlForDiagnosis, prompt, selectedService);
        };

        void bootstrap().finally(() => {
            if (!cancelled) setIsPageLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [
        conversationId,
        maybeHydrateWithProviders,
        runInitialDiagnosis,
        supabase,
        tradeFromQuery,
        prefetchedConversation,
    ]);

    useEffect(() => {
        if (!conversationId) return;
        const d = diagnosisForCostUi;
        if (!d?.diagnosis?.trim()) return;
        if (d.requires_clarification || d.rejected || d.unserviced) return;
        const src = d.market_rates?.sources;
        if (Array.isArray(src) && src.length > 0) return;

        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch('/api/market-rates/research', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        trade: d.trade,
                        tradeDetail: d.trade_detail,
                        customerAddress: customerAddress.trim(),
                        conversationId,
                        baselineDiagnosis: d,
                    }),
                });
                const json = (await res.json()) as Record<string, unknown>;
                if (cancelled || !json?.ok) return;
                invalidateConversationDiagnosisCache(conversationId);
                setDiagnosisForCostUi((prev) =>
                    mergeMarketRatesResponseIntoDiagnosis(prev, json)
                );
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        conversationId,
        customerAddress,
        diagnosisForCostUi?.diagnosis,
        diagnosisForCostUi?.trade,
        diagnosisForCostUi?.trade_detail,
        diagnosisForCostUi?.requires_clarification,
        diagnosisForCostUi?.rejected,
        diagnosisForCostUi?.unserviced,
        diagnosisForCostUi?.market_rates?.sources?.length,
    ]);

    useEffect(() => {
        const footerEl = footerRef.current;
        if (!footerEl) {
            setFooterHeight(0);
            return;
        }

        const updateFooterHeight = () => {
            setFooterHeight(footerEl.offsetHeight);
        };

        updateFooterHeight();

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(updateFooterHeight);
            resizeObserver.observe(footerEl);
        }
        window.addEventListener('resize', updateFooterHeight);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', updateFooterHeight);
        };
    }, []);

    const showImageSkeleton = isPageLoading && !imageSrc;
    const showThoughtSkeleton = (isPageLoading || isImageAnalysing) && !thoughtText.trim();
    const showSkeleton = isPageLoading || isImageAnalysing || (isDiagnosing && !isDetailStageReady);
    const hasDiagnosisFailure = !showSkeleton && Boolean(diagnosisFailureMessage);
    const isUnrelatedDiagnosis =
        (isRejectedDiagnosis && !isUnservicedDiagnosis) ||
        diagnosisTitle.trim() === 'Photo Not Related to Home Maintenance';
    const isUnsupportedDiagnosis =
        tradeLabel.trim().toLowerCase() === 'n/a' ||
        diagnosisTitle.toLowerCase().includes('not currently supported') ||
        diagnosisTitle.toLowerCase().includes('not on scandio');
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
    const resolvedDetailText = isServiceBlocked
        ? DIAGNOSIS_REJECT_DETAIL
        : diagnosisDetailText;

    const diagnosisHeadline = isServiceBlocked ? DIAGNOSIS_REJECT_HEADLINE : diagnosisTitle;

    const pageTitle = 'Your Diagnosis';
    const pageSubtitle =
        'This summary reflects what we could see in your photo and anything you added in chat. If something looks off, add a bit more detail below—then continue when you are ready to find contractors.';
    const stickyHeaderTitle =
        showSkeleton || !isDetailStageReady
            ? diagnosisTitle.trim() || 'Diagnosing…'
            : diagnosisHeadline;

    const contentBottomPadding = 72;

    useEffect(() => {
        if (shouldAutoExpandMoreInfo) {
            setIsMoreInfoExpanded(true);
        }
    }, [shouldAutoExpandMoreInfo]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const updateStickyHeaderTitle = () => {
            const anchor = headerTitleAnchorRef.current;
            if (!anchor) return;
            const anchorTop = anchor.offsetTop;
            const anchorBottom = anchorTop + anchor.offsetHeight;
            const scrollY = window.scrollY;
            // Switch once the main heading itself has scrolled past the header boundary.
            setUseStickyHeaderName(scrollY + HEADER_STICKY_OFFSET_PX >= anchorBottom);
        };

        updateStickyHeaderTitle();
        window.addEventListener('scroll', updateStickyHeaderTitle, { passive: true });
        window.addEventListener('resize', updateStickyHeaderTitle);
        return () => {
            window.removeEventListener('scroll', updateStickyHeaderTitle);
            window.removeEventListener('resize', updateStickyHeaderTitle);
        };
    }, []);

    const handleRescanReport = async () => {
        const trimmed = infoText.trim();
        if (!trimmed || !imageSrc) return;
        setIsMoreInfoExpanded(false);

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
        await runInitialDiagnosis(imageSrc, joinedInfo, selectedTradeHint.trim() || null);
        setIsMoreInfoExpanded(false);
    };

    const handleShareReport = async () => {
        if (!conversationId || typeof window === 'undefined') return;
        const url = new URL(`/report/${encodeURIComponent(conversationId)}`, window.location.origin);
        if (customerAddress) {
            url.searchParams.set('location', customerAddress);
        }
        const shareData = {
            title: 'Scandio Report',
            text: customerAddress
                ? `Scandio report for ${customerAddress}`
                : 'Scandio report',
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

    const diagnosisFooter = (
        <div className="flex flex-row gap-4 justify-end">
            <Button
                type="button"
                variant="ghost"
                className="h-10 flex-1"
                disabled={!infoText.trim() || isDiagnosing || showSkeleton}
                onClick={() => void handleRescanReport()}
            >
                {isDiagnosing ? 'Re-Scanning…' : 'Re-Scan Report'}
            </Button>
            <Button
                type="button"
                className="h-10 flex-1"
                disabled={!canContinueToMatch || isDiagnosing || shouldAutoExpandMoreInfo}
                onClick={() => {
                    if (!conversationId) return;
                    const key = `pending_diagnosis_image_url:${conversationId}`;
                    try { sessionStorage.removeItem(key); } catch {}
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
        </div>
    );

    return (
        <>
            <DiagnosisLeaveDialog
                open={leaveDialogOpen}
                onOpenChange={setLeaveDialogOpen}
                onLeave={() => router.back()}
            />

            <ScanFlowShell
                onClose={() => setLeaveDialogOpen(true)}
                footerRef={footerRef}
                contentBottomPadding={contentBottomPadding}
                contentWrapperClassName="p-0 py-18"
                contentClassName="px-4"
                constrainContentWidth
                footer={diagnosisFooter}
                headerLeft={
                    <ArrowLeft size={24} weight="bold" className="text-foreground" />
                }
                headerCenter={
                    <h3
                        className="block min-w-0 w-full max-w-full truncate text-center text-xl font-semibold text-foreground"
                        title={useStickyHeaderName ? stickyHeaderTitle : undefined}
                    >
                        {useStickyHeaderName ? stickyHeaderTitle : 'Scandio'}
                    </h3>
                }
                headerRight={
                    <div className="flex flex-row gap-2">
                        <Button
                            variant="outline"
                            className="size-10"
                            onClick={() => void handleShareReport()}
                        >
                            <Share size={24} weight="bold" className="text-foreground" />
                        </Button>
                        <Button variant="outline" className="size-10">
                            <DownloadSimple size={24} weight="bold" className="text-foreground" />
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-1">
                    <h1 ref={headerTitleAnchorRef} className="text-3xl font-semibold tracking-tight text-foreground">
                        {pageTitle}
                    </h1>
                    {isPageLoading ? (
                        <div className="flex max-w-xl flex-col gap-2" aria-hidden>
                            <Skeleton className="h-4 w-full max-w-md" />
                            <Skeleton className="h-4 w-[92%] max-w-lg" />
                        </div>
                    ) : (
                        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                            {pageSubtitle}
                        </p>
                    )}
                </div>

                {customerInfoItems.length > 0 ? (
                    <div className="flex flex-col items-start gap-2">
                        {customerInfoItems.map((item, idx) => (
                            <div
                                key={`${idx}-${item.slice(0, 20)}`}
                                className="w-fit rounded-md bg-background px-3 py-2 text-xs text-foreground"
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                ) : null}

                <div className="flex flex-col gap-6 rounded-lg border border-border bg-background p-6 text-left">
                    <div className="flex flex-col gap-5">
                        <div className="flex flex-row items-start justify-between gap-3">
                            {showSkeleton || !isDetailStageReady ? (
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    <Skeleton className="h-7 w-[88%] max-w-md" />
                                    <Skeleton className="h-7 w-[62%] max-w-sm md:hidden" />
                                </div>
                            ) : (
                                <h2 className="min-w-0 flex-1 text-lg font-bold text-foreground">
                                    {diagnosisHeadline}
                                </h2>
                            )}
                            {showSkeleton || !isDetailStageReady ? (
                                <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
                            ) : (
                                <Badge variant="secondary" className="shrink-0">
                                    {isServiceBlocked ? 'Can’t match' : tradeLabel || selectedTradeHint || 'Not Specified'}
                                </Badge>
                            )}
                        </div>
                        <div className="flex flex-col gap-4">
                            {showImageSkeleton ? (
                                <Skeleton className="aspect-[4/3] w-full rounded-lg md:h-48 md:aspect-auto" />
                            ) : (
                                <div className="h-48 w-full rounded-lg border border-border bg-secondary object-cover">
                                    {imageSrc ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={imageSrc}
                                            alt="Diagnosis photo"
                                            className="h-48 w-full rounded-lg object-cover"
                                            loading="eager"
                                            fetchPriority="high"
                                        />
                                    ) : null}
                                </div>
                            )}
                            {showThoughtSkeleton ? (
                                <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading analysis">
                                    <Skeleton className="h-3.5 w-full" />
                                    <Skeleton className="h-3.5 w-[94%]" />
                                    <Skeleton className="h-3.5 w-[88%]" />
                                    <Skeleton className="h-3.5 w-[76%]" />
                                    {isDiagnosingRetrying ? (
                                        <p className="text-xs text-muted-foreground">
                                            We&apos;re Retrying Automatically
                                        </p>
                                    ) : null}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">{thoughtText || ''}</p>
                            )}
                        </div>
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-4">
                        {showSkeleton || !isDetailStageReady ? (
                            <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading diagnosis details">
                                <div className="flex flex-col gap-2.5">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-[96%]" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-[82%]" />
                                </div>
                                <div className="rounded-lg border border-border/60 bg-secondary/40 p-4">
                                    <Skeleton className="mb-3 h-3 w-32" />
                                    <Skeleton className="h-3 w-full" />
                                    <Skeleton className="mt-2 h-3 w-[90%]" />
                                    <Skeleton className="mt-4 h-9 w-full rounded-md" />
                                </div>
                            </div>
                        ) : hasDiagnosisFailure ? (
                            <p className="text-sm text-foreground">{diagnosisFailureMessage}</p>
                        ) : (
                            <>
                                <p className="text-sm text-foreground">{resolvedDetailText}</p>
                                {hazardText && !isServiceBlocked ? (
                                    <p className="text-sm text-foreground">{hazardText}</p>
                                ) : null}
                                {diagnosisForCostUi && !isServiceBlocked && !requiresClarification ? (
                                    <BetaCostEstimateCard diagnosis={diagnosisForCostUi} />
                                ) : null}
                            </>
                        )}
                        {isServiceBlocked && serviceCatalog.length > 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Trades Scandio can match today: {serviceCatalog.join(', ')}.
                            </p>
                        ) : null}
                    </div>
                </div>

                {isMoreInfoExpanded ? (
                    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-6 text-left">
                        <Label htmlFor="diagnosis-info-text">Add More Information</Label>
                        <Textarea
                            id="diagnosis-info-text"
                            ref={infoTextareaRef}
                            className="min-h-18"
                            value={infoText}
                            onChange={(e) => setInfoText(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Optional. Not a substitute for a site visit.</p>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsMoreInfoExpanded(true)}
                        className="flex flex-row items-center justify-between rounded-lg border border-border/50 bg-background px-6 py-3.5 text-left"
                    >
                        <p className="text-sm text-muted-foreground">Did We Miss Something?</p>
                        <p className="text-sm font-medium text-foreground">Add Information</p>
                    </button>
                )}
            </ScanFlowShell>
        </>
    );
}

