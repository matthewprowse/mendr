"use client";

/**
 * useDiagnosisStream — upload bootstrap, /api/diagnose NDJSON streaming and
 * parsing callbacks, retry loop, persistence, and provider prewarm/hydration
 * for the /diagnosis client.
 *
 * Extracted verbatim from client.tsx as a pure mechanical refactor: the hook
 * encapsulates exactly the contiguous run of hooks that previously sat between
 * the mock-mode block and the derived-state section of DiagnosisPageClient,
 * in the same order, with identical effect dependencies. All state lives in
 * the composition root (client.tsx) and is injected via params so hook order
 * and behavior are unchanged.
 */

import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DiagnosisData } from "@/features/diagnosis/types";
import type { Provider } from "@/lib/providers/types";
import {
    cleanThoughtSentenceStarts,
    splitDetailAndHazard,
} from "@/lib/diagnosis/diagnosis-display";
import { parseDiagnosisFromModelResponse } from "@/features/diagnosis/parse-diagnosis-from-model-response";
import {
    consumeDiagnoseNdjsonStream,
    DiagnoseStreamHttpError,
    responseLooksLikeDiagnoseNdjson,
} from "@/lib/diagnosis/diagnose-ndjson-stream";
import { prewarmProvidersApi } from "@/features/match/api/client";
import { fetchActiveServiceCatalogClient } from "@/lib/services-catalog";
import {
    fetchConversationDiagnosis,
    patchConversation,
    type ConversationDiagnosisRow,
} from "@/lib/diagnosis/diagnoses-api";
import {
    isDiagnosisAccurateForPrefetch,
    prefetchProvidersIntoMatchCache,
    shouldSkipDiagnosisPipeline,
} from "@/features/diagnosis/processing-orchestrator";
import { getPendingDiagnosisImages } from "@/lib/diagnosis/pending-diagnosis-images-cache";
import { trackEvent } from "@/lib/analytics";
import {
    DEFAULT_MATCH_RADIUS_METERS,
    DIAGNOSIS_MAX_RETRIES,
    buildSelectedTradePayload,
    ensureRenderableImageSource,
    isLikelyRenderableImageSource,
    parseThoughtFromResponse,
    providerHydrateSessionKey,
    sleep,
} from "./diagnosis-helpers";

/** Structural ref type — matches the object returned by `useRef`. */
type MutableRef<T> = { current: T };

export type RunInitialDiagnosis = (
    img: string,
    prompt: string,
    selectedService: string | null,
    imageSourcesOverride?: string[],
) => Promise<DiagnosisData | null>;

type UseDiagnosisStreamParams = {
    conversationId?: string;
    /** When set (including `null`), skips the client GET for this row on first load. */
    prefetchedConversation?: ConversationDiagnosisRow | null;
    supabase: unknown;
    user: { id: string } | null;
    tradeFromQuery: string;
    locationFromQuery: string;
    customerAddress: string;
    serviceCatalog: string[];
    customerInfoItems: string[];
    uploadedImageSources: string[];
    // Refs (owned by the composition root)
    didRunDiagnosisRef: MutableRef<string | null>;
    thoughtStreamGenRef: MutableRef<number>;
    currentDiagnosisRef: MutableRef<DiagnosisData | null>;
    uploadedImageSourcesRef: MutableRef<string[]>;
    customerInfoItemsRef: MutableRef<string[]>;
    savedCustomerCoordsRef: MutableRef<{ lat: number; lng: number } | null>;
    providersForDiagnoseRef: MutableRef<Provider[]>;
    isMockClarifyRef: MutableRef<boolean>;
    // State setters (owned by the composition root)
    setThoughtText: Dispatch<SetStateAction<string>>;
    setImageThoughtBreakdown: Dispatch<SetStateAction<string[]>>;
    setIsDiagnosing: Dispatch<SetStateAction<boolean>>;
    setIsImageAnalysing: Dispatch<SetStateAction<boolean>>;
    setIsDiagnosingRetrying: Dispatch<SetStateAction<boolean>>;
    setIsDetailStageReady: Dispatch<SetStateAction<boolean>>;
    setDiagnosisFailureMessage: Dispatch<SetStateAction<string | null>>;
    setDiagnosisDetailText: Dispatch<SetStateAction<string>>;
    setHazardText: Dispatch<SetStateAction<string>>;
    setTradeLabel: Dispatch<SetStateAction<string>>;
    setTradeDetailLabel: Dispatch<SetStateAction<string>>;
    setRequiresClarification: Dispatch<SetStateAction<boolean>>;
    setIsRejectedDiagnosis: Dispatch<SetStateAction<boolean>>;
    setIsUnservicedDiagnosis: Dispatch<SetStateAction<boolean>>;
    setActionRequiredRaw: Dispatch<SetStateAction<string>>;
    setDiagnosisTitle: Dispatch<SetStateAction<string>>;
    setCurrentDiagnosis: Dispatch<SetStateAction<DiagnosisData | null>>;
    setServiceCatalog: Dispatch<SetStateAction<string[]>>;
    setCustomerInfoItems: Dispatch<SetStateAction<string[]>>;
    setCustomerAddress: Dispatch<SetStateAction<string>>;
    setSelectedTradeHint: Dispatch<SetStateAction<string>>;
    setImageSrc: Dispatch<SetStateAction<string | null>>;
    setUploadedImageSources: Dispatch<SetStateAction<string[]>>;
    setIsPageLoading: Dispatch<SetStateAction<boolean>>;
};

export function useDiagnosisStream({
    conversationId,
    prefetchedConversation,
    supabase,
    user,
    tradeFromQuery,
    locationFromQuery,
    customerAddress,
    serviceCatalog,
    customerInfoItems,
    uploadedImageSources,
    didRunDiagnosisRef,
    thoughtStreamGenRef,
    currentDiagnosisRef,
    uploadedImageSourcesRef,
    customerInfoItemsRef,
    savedCustomerCoordsRef,
    providersForDiagnoseRef,
    isMockClarifyRef,
    setThoughtText,
    setImageThoughtBreakdown,
    setIsDiagnosing,
    setIsImageAnalysing,
    setIsDiagnosingRetrying,
    setIsDetailStageReady,
    setDiagnosisFailureMessage,
    setDiagnosisDetailText,
    setHazardText,
    setTradeLabel,
    setTradeDetailLabel,
    setRequiresClarification,
    setIsRejectedDiagnosis,
    setIsUnservicedDiagnosis,
    setActionRequiredRaw,
    setDiagnosisTitle,
    setCurrentDiagnosis,
    setServiceCatalog,
    setCustomerInfoItems,
    setCustomerAddress,
    setSelectedTradeHint,
    setImageSrc,
    setUploadedImageSources,
    setIsPageLoading,
}: UseDiagnosisStreamParams): { runInitialDiagnosis: RunInitialDiagnosis } {
    const getPersistedCustomerInfoItems = useCallback(
        (data: ConversationDiagnosisRow | null, fallbackPrompt: string): string[] => {
            const raw =
                data &&
                typeof (data as any)?.diagnosis === "object" &&
                (data as any)?.diagnosis !== null &&
                Array.isArray(((data as any).diagnosis as any).customer_info_items)
                    ? (((data as any).diagnosis as any).customer_info_items as unknown[])
                    : null;
            const fromDiagnosis = raw
                ? raw
                      .map((x) => (typeof x === "string" ? x.trim() : ""))
                      .filter((x) => x.length > 0)
                : [];
            if (fromDiagnosis.length > 0) return fromDiagnosis;

            const fallback = fallbackPrompt.trim();
            return fallback ? [fallback] : [];
        },
        [],
    );

    const prewarmProvidersForConversation = useCallback(
        (
            conversation: ConversationDiagnosisRow | null | undefined,
            diagnosisData: DiagnosisData,
        ) => {
            const lat = conversation?.customer_lat;
            const lng = conversation?.customer_lng;
            const tradeRaw = (diagnosisData.trade ?? "").trim();
            const tradeDetailRaw = (diagnosisData.trade_detail ?? "").trim();
            if (
                typeof lat !== "number" ||
                typeof lng !== "number" ||
                !Number.isFinite(lat) ||
                !Number.isFinite(lng) ||
                !tradeRaw ||
                tradeRaw.toLowerCase() === "n/a"
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
        [],
    );

    const buildPromptWithContext = useCallback(
        (prompt: string): string => {
            const parts: string[] = [];
            const loc = customerAddress.trim() || locationFromQuery.trim();
            const base = prompt.trim();
            if (loc) {
                parts.push(`Location context: ${loc}`);
            }
            if (base) {
                parts.push(base);
            }
            return parts.join("\n\n");
        },
        [customerAddress, locationFromQuery],
    );

    const parseServiceCatalogOrFail = useCallback(async (): Promise<string[] | null> => {
        let catalog = serviceCatalog;
        if (catalog.length === 0) {
            catalog = await fetchActiveServiceCatalogClient(supabase as any);
            if (catalog.length > 0) setServiceCatalog(catalog);
        }
        if (catalog.length === 0) {
            setDiagnosisFailureMessage(
                "We could not load the service list for your Mendr Report. Please retry now.",
            );
            return null;
        }
        return catalog;
    }, [serviceCatalog, supabase]);

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
            if (!trade || trade === "N/A") return;
            if (diag.requires_clarification || diag.rejected || diag.unserviced) return;
            try {
                if (sessionStorage.getItem(providerHydrateSessionKey(cid)) === "1") return;
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
                    typeof saved.lat === "number" &&
                    typeof saved.lng === "number" &&
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

                const geocodeRes = await fetch("/api/geocode", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lat, lng }),
                });
                if (!geocodeRes.ok) return;

                const provRes = await fetch("/api/providers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        lat,
                        lng,
                        trade,
                        radius: 25_000,
                    }),
                });
                const provData = await provRes.json().catch(() => ({}));
                if (!provRes.ok) return;
                const list = Array.isArray(provData.providers)
                    ? (provData.providers as Provider[])
                    : [];
                if (list.length === 0) return;

                providersForDiagnoseRef.current = list;
                // All uploaded images sent with equal weight for provider hydration.
                const hydrationImages =
                    uploadedImageSourcesRef.current.length > 0
                        ? uploadedImageSourcesRef.current
                        : [img];

                const res = await fetch("/api/diagnose", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        imageUrls: hydrationImages,
                        serviceCatalog: catalog,
                        providerHydration: true,
                        providers: list,
                        textQuery: userWords.trim() || undefined,
                        previousDiagnosis: {
                            diagnosis: diag.diagnosis,
                            trade: diag.trade,
                            trade_detail: diag.trade_detail ?? "",
                            message: diag.message ?? "",
                            action_required: diag.action_required ?? "",
                        },
                    }),
                });
                const text = await res.text();
                if (!res.ok) return;
                const parsed = parseDiagnosisFromModelResponse(text);
                if (!parsed) return;

                const thoughtFromJson =
                    Array.isArray((parsed as any)?.image_descriptions) &&
                    typeof (parsed as any).image_descriptions[0] === "string"
                        ? String((parsed as any).image_descriptions[0]).trim()
                        : "";
                const thought =
                    parseThoughtFromResponse(text) ||
                    (parsed.thinking ?? "").trim() ||
                    thoughtFromJson;
                const diagWithThought: DiagnosisData = { ...parsed, thinking: thought };
                const toSave = diagWithThought;
                const detail =
                    (toSave.action_required ?? "").trim() ||
                    (toSave.message ?? "").trim() ||
                    "";
                const split = splitDetailAndHazard(detail);
                setDiagnosisDetailText(split.detail);
                setHazardText(split.hazard);
                setTradeLabel((toSave.trade ?? "").trim());
                setTradeDetailLabel((toSave.trade_detail ?? "").trim());
                setRequiresClarification(Boolean(toSave.requires_clarification));
                setIsRejectedDiagnosis(Boolean((toSave as any).rejected));
                setIsUnservicedDiagnosis(Boolean((toSave as any).unserviced));
                setActionRequiredRaw((toSave.action_required ?? "").trim());
                setDiagnosisTitle(toSave.diagnosis);
                setCurrentDiagnosis(toSave);
                const finalThoughtRaw = (thought || "").trim();
                setThoughtText(
                    finalThoughtRaw ? cleanThoughtSentenceStarts(finalThoughtRaw) : "",
                );

                const deviceType =
                    typeof navigator !== "undefined" &&
                    /Mobi|Android/i.test(navigator.userAgent)
                        ? "mobile"
                        : "desktop";
                const persistImageUrls =
                    uploadedImageSourcesRef.current.length > 0
                        ? uploadedImageSourcesRef.current.slice(0, 4)
                        : [img];
                const saveResult = await patchConversation(cid, {
                    title: toSave.diagnosis || "New Diagnosis",
                    image_url: persistImageUrls[0] ?? img,
                    image_urls: persistImageUrls,
                    diagnosis: toSave as unknown,
                    device: deviceType,
                    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
                    user_id: user?.id ?? null,
                });
                if (saveResult.ok) {
                    try {
                        sessionStorage.setItem(providerHydrateSessionKey(cid), "1");
                    } catch {
                        /* ignore */
                    }
                }
            } catch {
                /* geolocation, network, or hydrate failed */
            }
        },
        [conversationId, supabase, user?.id],
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
            imageSourcesOverride?: string[],
        ) => {
            const cid = conversationId ?? null;
            // Prevent duplicate in-flight calls (Next dev Strict Mode can double-invoke effects).
            if (!cid) return null;
            if (didRunDiagnosisRef.current === cid) return null;
            didRunDiagnosisRef.current = cid;
            thoughtStreamGenRef.current += 1;
            setThoughtText("");
            setImageThoughtBreakdown([]);
            setIsDiagnosing(true);
            setIsImageAnalysing(true);
            setIsDiagnosingRetrying(false);
            setIsDetailStageReady(false);
            setDiagnosisFailureMessage(null);
            try {
                const fetchDiagnoseScan = async (
                    payload: Record<string, unknown>,
                    onThought: (t: string) => void,
                    gen: number,
                ): Promise<string> => {
                    const res = await fetch("/api/diagnose", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
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
                            ? `${waitMinutes} minute${waitMinutes === 1 ? "" : "s"}`
                            : "a few minutes";
                        const isRateLimited =
                            String(parsed?.error || "").toLowerCase() === "rate_limited";
                        const isQuotaExceeded =
                            String(parsed?.error || "").toLowerCase() === "quota_exceeded";
                        setDiagnosisFailureMessage(
                            isRateLimited
                                ? `You are sending requests too quickly. Please wait about ${waitText}, then tap Retry Report.`
                                : isQuotaExceeded
                                  ? String(
                                        parsed?.message ||
                                            "You have reached your diagnosis limit for now.",
                                    )
                                  : String(
                                        parsed?.message ||
                                            parsed?.error ||
                                            "Mendr is busy right now. Please try again shortly.",
                                    ),
                        );
                    } catch {
                        setDiagnosisFailureMessage(
                            "Mendr is busy right now. Please try again shortly.",
                        );
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
                                ...(Array.isArray(imageSourcesOverride)
                                    ? imageSourcesOverride
                                    : []),
                                img,
                            ].filter((src) => isLikelyRenderableImageSource(src)),
                        ),
                    );
                    if (analysisSources.length === 0) analysisSources.push(img);
                    // All images are sent with equal weight — no primary/attachment distinction.
                    thoughtStreamGenRef.current += 1;
                    const genFull = thoughtStreamGenRef.current;
                    let text: string;
                    let gotStreamThought = false;
                    try {
                        const latestDiagnosis = currentDiagnosisRef.current;
                        const ar = (latestDiagnosis?.action_required ?? "").trim();
                        const hasRejectablePrior =
                            Boolean(latestDiagnosis?.diagnosis?.trim()) &&
                            ar.length > 0 &&
                            !/^n\/a$/i.test(ar);
                        const previousDiagnosisPayload = hasRejectablePrior
                            ? {
                                  diagnosis: latestDiagnosis!.diagnosis,
                                  trade: latestDiagnosis!.trade,
                                  trade_detail: latestDiagnosis!.trade_detail ?? "",
                                  message: latestDiagnosis!.message ?? "",
                                  action_required: latestDiagnosis!.action_required ?? "",
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
                            genFull,
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
                                "We could not finish your Mendr Report automatically. Please retry now.",
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
                            "We could not read that response correctly. Please retry now.",
                        );
                        return null;
                    }

                    const thoughtFromJson =
                        Array.isArray((diag as any)?.image_descriptions) &&
                        typeof (diag as any).image_descriptions[0] === "string"
                            ? String((diag as any).image_descriptions[0]).trim()
                            : "";
                    const thought =
                        parseThoughtFromResponse(text) ||
                        (diag.thinking ?? "").trim() ||
                        thoughtFromJson;
                    const breakdownFromDiag =
                        Array.isArray((diag as any)?.image_thought_breakdown) &&
                        (diag as any).image_thought_breakdown.every(
                            (x: unknown) => typeof x === "string",
                        )
                            ? ((diag as any).image_thought_breakdown as string[])
                            : Array.isArray((diag as any)?.image_descriptions)
                              ? ((diag as any).image_descriptions as unknown[]).filter(
                                    (x): x is string =>
                                        typeof x === "string" && x.trim().length > 0,
                                )
                              : [];
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
                        (toSave.action_required ?? "").trim() ||
                        (toSave.message ?? "").trim() ||
                        "";
                    const split = splitDetailAndHazard(detail);
                    setDiagnosisDetailText(split.detail);
                    setHazardText(split.hazard);
                    setTradeLabel((toSave.trade ?? "").trim());
                    setTradeDetailLabel((toSave.trade_detail ?? "").trim());
                    setRequiresClarification(
                        Boolean((toSave as DiagnosisData).requires_clarification),
                    );
                    setIsRejectedDiagnosis(Boolean((toSave as any).rejected));
                    setIsUnservicedDiagnosis(Boolean((toSave as any).unserviced));
                    setActionRequiredRaw((toSave.action_required ?? "").trim());
                    setDiagnosisTitle(toSave.diagnosis);
                    setCurrentDiagnosis(toSave);
                    setDiagnosisFailureMessage(null);
                    setIsDetailStageReady(true);
                    setThoughtText(
                        finalThoughtRaw ? cleanThoughtSentenceStarts(finalThoughtRaw) : "",
                    );
                    setImageThoughtBreakdown(breakdownFromDiag);

                    const deviceType =
                        typeof navigator !== "undefined" &&
                        /Mobi|Android/i.test(navigator.userAgent)
                            ? "mobile"
                            : "desktop";
                    const persistImageUrls =
                        uploadedImageSourcesRef.current.length > 0
                            ? uploadedImageSourcesRef.current.slice(0, 4)
                            : [img];
                    const saveResult = await patchConversation(cid, {
                        title: toSave.diagnosis || "New Diagnosis",
                        image_url: persistImageUrls[0] ?? img,
                        image_urls: persistImageUrls,
                        diagnosis: toSave as unknown,
                        initial_image_description: (prompt ?? "").trim() || null,
                        device: deviceType,
                        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
                        user_id: user?.id ?? null,
                    });
                    if (!saveResult.ok) {
                        setDiagnosisFailureMessage(
                            saveResult.error ||
                                "We could not save your Mendr Report. Please check your connection and try again.",
                        );
                        return null;
                    }

                    const latestConv = await fetchConversationDiagnosis(cid);
                    if (latestConv.ok) {
                        prewarmProvidersForConversation(latestConv.data, toSave);
                        const eligible = isDiagnosisAccurateForPrefetch(toSave);
                        if (eligible.eligible) {
                            trackEvent("prefetch_attempted", { diagnosis_id: cid });
                            void prefetchProvidersIntoMatchCache(cid, latestConv.data, toSave)
                                .then(() => {
                                    trackEvent("prefetch_succeeded", { diagnosis_id: cid });
                                })
                                .catch(() => {
                                    trackEvent("prefetch_skipped", {
                                        diagnosis_id: cid,
                                        reason: "prefetch_error",
                                    });
                                });
                        } else {
                            trackEvent("prefetch_skipped", {
                                diagnosis_id: cid,
                                reason: eligible.reason || "not_eligible",
                            });
                        }
                    }

                    void maybeHydrateWithProviders(
                        toSave,
                        img,
                        catalog,
                        buildPromptWithContext(prompt).trim(),
                    );

                    return toSave;
                }
                setDiagnosisFailureMessage(
                    "We could not complete your Mendr Report right now. Please retry now.",
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
        ],
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
            // Mock mode short-circuit: state was already seeded by the
            // mock-mode effect above, so don't touch it.
            if (isMockClarifyRef.current) return;
            // Reset guard when the route id changes.
            didRunDiagnosisRef.current = null;
            setCurrentDiagnosis(null);
            setDiagnosisTitle("Diagnosing…");
            // URL saved on /welcome after a successful upload — used if the client cannot read
            // the conversation row yet (slow network) or RLS hides rows created via the admin API.
            let pendingImageUrl: string | null = null;
            let pendingImageUrls: string[] = [];
            let pendingPromptFromWelcome: string | null = null;
            let pendingTradeFromWelcome: string | null = null;
            try {
                pendingImageUrl = sessionStorage.getItem(
                    `pending_diagnosis_image_url:${conversationId}`,
                );
                const pendingImageUrlsRaw = sessionStorage.getItem(
                    `pending_diagnosis_image_urls:${conversationId}`,
                );
                if (pendingImageUrlsRaw) {
                    const parsed = JSON.parse(pendingImageUrlsRaw) as unknown;
                    if (Array.isArray(parsed)) {
                        pendingImageUrls = parsed
                            .map((value) => (typeof value === "string" ? value.trim() : ""))
                            .filter((value) => value.length > 0);
                    }
                }
                if (pendingImageUrls.length === 0) {
                    pendingImageUrls = getPendingDiagnosisImages(conversationId);
                }
                if (pendingImageUrl) setImageSrc(pendingImageUrl);
                pendingPromptFromWelcome = sessionStorage.getItem(
                    `pending_diagnosis_prompt:${conversationId}`,
                );
                pendingTradeFromWelcome = sessionStorage.getItem(
                    `pending_diagnosis_trade:${conversationId}`,
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
                typeof clat === "number" &&
                typeof clng === "number" &&
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
                .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
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
                await Promise.all(
                    pendingImageUrls.map((src) => ensureRenderableImageSource(src)),
                )
            ).filter((src): src is string => isLikelyRenderableImageSource(src));
            const normalizedPersistedImageUrls = (
                await Promise.all(
                    persistedImageUrls.map((src) => ensureRenderableImageSource(src)),
                )
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
            const promptFromDb =
                ((data as any)?.initial_image_description as string | null) ?? "";
            const prompt = promptFromDb.trim() || (pendingPromptFromWelcome ?? "").trim();
            const persistedCustomerInfoItems = getPersistedCustomerInfoItems(data, prompt);
            setCustomerInfoItems(persistedCustomerInfoItems);
            setCustomerAddress(String((data as any)?.customer_address ?? "").trim());
            const persistedTradeHint =
                data &&
                typeof (data as any)?.diagnosis === "object" &&
                (data as any)?.diagnosis !== null &&
                typeof ((data as any).diagnosis as any).selected_trade_hint === "string"
                    ? String(((data as any).diagnosis as any).selected_trade_hint).trim()
                    : "";
            setSelectedTradeHint(
                persistedTradeHint ||
                    (pendingTradeFromWelcome ?? "").trim() ||
                    tradeFromQuery.trim(),
            );
            const existingDiagnosis = (data as any)?.diagnosis as DiagnosisData | null;

            if (existingDiagnosis && shouldSkipDiagnosisPipeline(existingDiagnosis)) {
                setDiagnosisTitle(existingDiagnosis.diagnosis);
                setIsDetailStageReady(true);
                setRequiresClarification(Boolean(existingDiagnosis.requires_clarification));
                setIsRejectedDiagnosis(Boolean((existingDiagnosis as any).rejected));
                setIsUnservicedDiagnosis(Boolean((existingDiagnosis as any).unserviced));
                setActionRequiredRaw((existingDiagnosis.action_required ?? "").trim());
                const persistedThinking = (existingDiagnosis.thinking ?? "").trim();
                const persistedImageDescriptions =
                    Array.isArray((existingDiagnosis as any)?.image_descriptions) &&
                    typeof (existingDiagnosis as any).image_descriptions[0] === "string"
                        ? String((existingDiagnosis as any).image_descriptions[0]).trim()
                        : "";
                const persistedImageThoughtBreakdown = Array.isArray(
                    (existingDiagnosis as any)?.image_thought_breakdown,
                )
                    ? ((existingDiagnosis as any).image_thought_breakdown as unknown[])
                          .filter((value): value is string => typeof value === "string")
                          .map((value) => value.trim())
                          .filter(Boolean)
                    : [];
                setThoughtText(
                    cleanThoughtSentenceStarts(persistedThinking || persistedImageDescriptions),
                );
                setImageThoughtBreakdown(persistedImageThoughtBreakdown);
                const persistedSplit = splitDetailAndHazard(
                    (existingDiagnosis.action_required ?? "").trim() ||
                        (existingDiagnosis.message ?? "").trim() ||
                        "",
                );
                setDiagnosisDetailText(persistedSplit.detail);
                setHazardText(persistedSplit.hazard);
                setTradeLabel((existingDiagnosis.trade ?? "").trim());
                setTradeDetailLabel((existingDiagnosis.trade_detail ?? "").trim());
                setCurrentDiagnosis(existingDiagnosis);
                // Read-only: do not call /api/diagnose on page load.
                // The processing pipeline already wrote a final diagnosis to
                // public.diagnoses; surfacing what's there is enough.
                // Provider-context hydration (the previous behaviour) was
                // re-running the model and rewriting prose on every visit —
                // the "diagnosis keeps changing" bug. Regeneration now only
                // happens via explicit user actions: refine, clarification
                // pick, or trade candidate pick.
                if (imageUrlForDiagnosis) {
                    const catalog = await fetchActiveServiceCatalogClient(supabase as any);
                    if (!cancelled && catalog.length > 0) {
                        setServiceCatalog(catalog);
                    }
                }
                return;
            }

            if (!imageUrlForDiagnosis) {
                setDiagnosisFailureMessage(
                    "No uploaded photo was found for this report. Please choose a new photo.",
                );
                return;
            }
            const selectedService =
                persistedTradeHint ||
                (pendingTradeFromWelcome ?? "").trim() ||
                tradeFromQuery.trim() ||
                null;
            await runInitialDiagnosis(
                imageUrlForDiagnosis,
                prompt,
                selectedService,
                imageSourcesForDisplay,
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

    return { runInitialDiagnosis };
}
