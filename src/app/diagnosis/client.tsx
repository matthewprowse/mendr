/**
 * Route: /diagnosis/[id]
 * Diagnosis step in the scan flow.
 *
 * Composition root: owns all state (hook order is preserved exactly from the
 * pre-refactor monolith) and wires it into the extracted modules —
 * `useDiagnosisStream` (upload bootstrap + NDJSON streaming), `useClarification`
 * (Q&A state machine), `useRefinePhotos` (Add Details photo upload + rescan),
 * and the presentational `DiagnosisResultView` / `AddDetailsOverlay`.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/auth/supabase";
import { Badge } from "@/components/ui/badge";
import type { DiagnosisData } from "@/features/diagnosis/types";
import type { Provider } from "@/lib/providers/types";
import { DiagnosisLeaveDialog } from "@/components/diagnosis-leave-dialog";
import { writeMatchTradeContextStorage } from "@/lib/diagnosis/match-trade-context";
import { type ConversationDiagnosisRow } from "@/lib/diagnosis/diagnoses-api";
import { useAuth } from "@/context/auth-context";
import { ArrowLeft } from "lucide-react";
import { FlowTopBar } from "@/components/match/flow-shell";
import { HeaderAuth } from "@/components/header-auth";
import { BRAND_NAME } from "@/lib/brand-system";
import { ClarificationDrawer, type ClarificationAnswerMap } from "./clarification-drawer";
import { PhotoViewer } from "./photo-viewer";
import type { ClarificationQuestion } from "@/features/diagnosis/types";
import type { SelectedPhoto } from "@/lib/diagnosis/photo-upload";
import {
    DIAGNOSIS_REJECT_DETAIL,
    DIAGNOSIS_REJECT_HEADLINE,
    HEADER_HEIGHT_PX,
    truncateTitleTight,
} from "./diagnosis-helpers";
import { useDiagnosisStream } from "./use-diagnosis-stream";
import { useRefinePhotos } from "./use-refine-photos";
import { useClarification } from "./use-clarification";
import { AddDetailsOverlay } from "./add-details-overlay";
import { DiagnosisResultView } from "./diagnosis-result-view";

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
    const tradeFromQuery = searchParams.get("trade") || "";
    const locationFromQuery = searchParams.get("location") || "";
    const supabase = getSupabase();

    const [infoText, setInfoText] = useState("");
    // Two overlays sit on top of /diagnosis: the "Add Details" sheet (free-
    // text note + extra photos, used when the diagnosis is right but the user
    // wants to share more context) and the "Need More Information" sheet
    // (structured clarification questions only, shown when the AI can't
    // confidently diagnose without more input). Only one is open at a time.
    const [showAddInfoScreen, setShowAddInfoScreen] = useState(false);
    const [showAnswerQuestionsScreen, setShowAnswerQuestionsScreen] = useState(false);
    const [clarificationAnswers, setClarificationAnswers] = useState<ClarificationAnswerMap>(
        {},
    );
    // Avoid showing placeholder "Estimated Diagnosis" once we reach the /diagnosis/[id] route.
    const [diagnosisTitle, setDiagnosisTitle] = useState("Diagnosing…");
    const [customerInfoItems, setCustomerInfoItems] = useState<string[]>([]);
    const [thoughtText, setThoughtText] = useState("");
    // imageThoughtBreakdown is kept because the fullscreen image viewer reads
    // from it (one entry per image, surfaced when the user taps a photo). The
    // inline "Show thinking" toggle has been removed from the page body — the
    // synthesised `thoughtText` is the only thing displayed under the images.
    const [imageThoughtBreakdown, setImageThoughtBreakdown] = useState<string[]>([]);
    const [fullscreenImageIndex, setFullscreenImageIndex] = useState<number | null>(null);
    // (Removed: fullscreenTouchStartXRef — PhotoViewer now owns its own touch-
    // swipe handlers internally.)
    const [diagnosisDetailText, setDiagnosisDetailText] = useState("");
    const [hazardText, setHazardText] = useState("");
    const [tradeLabel, setTradeLabel] = useState("");
    const [tradeDetailLabel, setTradeDetailLabel] = useState("");
    const [requiresClarification, setRequiresClarification] = useState(false);
    const [isRejectedDiagnosis, setIsRejectedDiagnosis] = useState(false);
    const [isUnservicedDiagnosis, setIsUnservicedDiagnosis] = useState(false);
    const [actionRequiredRaw, setActionRequiredRaw] = useState("");
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
    const [customerAddress, setCustomerAddress] = useState<string>("");
    const [selectedTradeHint, setSelectedTradeHint] = useState<string>("");
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
    const [currentDiagnosis, setCurrentDiagnosis] = useState<DiagnosisData | null>(null);
    const currentDiagnosisRef = useRef<DiagnosisData | null>(null);
    const footerRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const headerTitleAnchorRef = useRef<HTMLHeadingElement | null>(null);
    const headerBadgeAnchorRef = useRef<HTMLDivElement | null>(null);
    const [useStickyHeaderName, setUseStickyHeaderName] = useState(false);
    const [useStickyHeaderBadge, setUseStickyHeaderBadge] = useState(false);
    // (The earlier full-screen Need More Information overlay had its own
    // sticky-header scroll swap. The new ClarificationDrawer is a Sheet
    // (mobile) / Dialog (desktop) with no scroll-watched header — refs and
    // state for that pattern have been removed.)

    const savedCustomerCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
    const providersForDiagnoseRef = useRef<Provider[]>([]);
    const customerInfoItemsRef = useRef<string[]>([]);
    const [clarificationSubmitLoading, setClarificationSubmitLoading] = useState(false);
    const [clarificationCustomText, setClarificationCustomText] = useState("");

    // Refine-overlay photo upload state. Mirrors the /start uploader: each tile
    // tracks its own status, and the hosted URL (after upload to Supabase
    // storage) is held in `refinePhotoStorageUrls` keyed by photo id. We cap
    // the total at 4 photos overall (existing diagnosis photos + new ones),
    // matching the cap in the diagnose pipeline (REFINE_MAX_TOTAL_PHOTOS).
    const [refinePhotos, setRefinePhotos] = useState<SelectedPhoto[]>([]);
    const [refinePhotoStorageUrls, setRefinePhotoStorageUrls] = useState<
        Record<string, string>
    >({});
    // Existing diagnosis photos the user has marked for removal inside the Add
    // Details overlay. Staged here and only committed on re-run. A ref mirrors
    // it so the upload handler can read the freed-slot count without a stale
    // closure.
    const [removedOriginalUrls, setRemovedOriginalUrls] = useState<Set<string>>(
        () => new Set(),
    );
    const removedOriginalUrlsRef = useRef<Set<string>>(new Set());
    const refineUploadInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        currentDiagnosisRef.current = currentDiagnosis;
    }, [currentDiagnosis]);

    // ── Mock-mode harness (dev only) ──────────────────────────────────────
    // Hit /diagnosis/<id>?mockState=clarify to bypass the real diagnose
    // pipeline and render the clarification UI against a hard-coded
    // multi-question fixture. Used to iterate on the carousel design without
    // round-tripping Gemini. Production builds short-circuit this immediately.
    const mockStateParam = searchParams.get("mockState") || "";
    const isMockClarify = process.env.NODE_ENV !== "production" && mockStateParam === "clarify";
    const isMockClarifyRef = useRef(isMockClarify);
    useEffect(() => {
        isMockClarifyRef.current = isMockClarify;
    }, [isMockClarify]);
    useEffect(() => {
        if (!isMockClarify) return;
        // Seed the page as if the diagnosis pipeline returned a clarification
        // result. Skips the network fetch and bootstrap. Two empty placeholders
        // so DiagnosisPhotoTile renders bg-secondary cards (no external image
        // dependency, easy to read the layout).
        const placeholder = "";
        const mockImages = ["", ""];
        // Mock previews against REAL fixture data so the drawer is sized
        // against the actual sentence-shaped chip lengths the model produces
        // (4-12 words, ~17-65 chars). Made-up short labels like "Today / A
        // few days" don't stress-test the layout the same way.
        const mockQuestionSet: ClarificationQuestion[] = [
            {
                id: "mock-q1",
                question: "Looking at the door, which best describes what you see?",
                options: [
                    "Cables look slack on at least one side.",
                    "Cables look tight, only the spring is broken.",
                    "Door makes a humming or grinding sound.",
                    "Something else is happening.",
                ],
            },
            {
                id: "mock-q2",
                question: "Where is the air entering the system?",
                options: [
                    "The o-ring on the lid looks compressed, cracked, or out of position.",
                    "I can hear hissing or see drips on the suction pipework.",
                    "Pool water level is below the skimmer mouth.",
                    "Something else is happening.",
                ],
            },
            {
                id: "mock-q3",
                question: "Can you lift the door manually with the motor disengaged?",
                options: ["Too heavy to lift", "Lifts but drops fast", "Lifts and stays open"],
            },
        ];
        setIsPageLoading(false);
        setIsDetailStageReady(true);
        setImageSrc(placeholder);
        setUploadedImageSources(mockImages);
        setDiagnosisTitle("Garage door spring failure");
        setTradeLabel("Garage Doors");
        setRequiresClarification(true);
        setCurrentDiagnosis({
            thinking: "Mocked thinking.",
            diagnosis: "Mocked diagnosis body.",
            trade: "Garage Doors",
            action_required: "mock_action",
            requires_clarification: true,
            clarification_questions: mockQuestionSet.flatMap((q) => q.options),
            clarification_question_set: mockQuestionSet,
        } as DiagnosisData);
        // Mock previews land directly on the new Need More Information overlay
        // so you can iterate on the question list without an extra tap. The
        // underlying diagnosis page is still mounted — closing the overlay
        // reveals it (with the "Answer Three Questions" CTA in the footer).
        setShowAnswerQuestionsScreen(true);
        // Block the real bootstrap from blowing this state away.
        didRunDiagnosisRef.current = "mock";
    }, [isMockClarify]);

    // Upload bootstrap + /api/diagnose NDJSON streaming + persistence. The
    // hook encapsulates the same hooks, in the same order, with the same
    // dependencies as before extraction — state stays here and is injected.
    const { runInitialDiagnosis } = useDiagnosisStream({
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
    });

    const showThoughtSkeleton = (isPageLoading || isImageAnalysing) && !thoughtText.trim();
    const showSkeleton =
        isPageLoading || isImageAnalysing || (isDiagnosing && !isDetailStageReady);
    const hasDiagnosisFailure = !showSkeleton && Boolean(diagnosisFailureMessage);
    const isUnrelatedDiagnosis =
        (isRejectedDiagnosis && !isUnservicedDiagnosis) ||
        diagnosisTitle.trim() === "Photo Not Related to Home Maintenance";
    const isUnsupportedDiagnosis =
        tradeLabel.trim().toLowerCase() === "n/a" ||
        diagnosisTitle.toLowerCase().includes("not currently supported") ||
        diagnosisTitle.toLowerCase().includes("not on mendr");
    const isServiceBlocked = isUnsupportedDiagnosis || isUnrelatedDiagnosis;

    // Clarification Q&A derivation + submit handlers. Contains no React hooks
    // (plain per-render computation, handlers recreated each render — exactly
    // as they were inline), so this call has no effect on hook order.
    const {
        hasClarificationQuestions,
        clarificationQuestionList,
        clarificationQuestionCount,
        showClarificationFooter,
        answerQuestionsCtaCopy,
        handleClarificationBatchSubmit,
    } = useClarification({
        conversationId,
        currentDiagnosis,
        tradeLabel,
        selectedTradeHint,
        requiresClarification,
        isServiceBlocked,
        isDiagnosing,
        showSkeleton,
        clarificationSubmitLoading,
        clarificationAnswers,
        imageSrc,
        customerInfoItems,
        uploadedImageSources,
        isMockClarifyRef,
        didRunDiagnosisRef,
        providersForDiagnoseRef,
        setShowAnswerQuestionsScreen,
        setClarificationAnswers,
        setClarificationSubmitLoading,
        setClarificationCustomText,
        setCustomerInfoItems,
        setInfoText,
        setShowAddInfoScreen,
        setDiagnosisTitle,
        setDiagnosisFailureMessage,
        runInitialDiagnosis,
    });

    const scanForMatchEligibility =
        `${diagnosisTitle}\n${thoughtText}\n${diagnosisDetailText}\n${hazardText}`.toLowerCase();
    const suggestsNoClearRepair =
        /\bappears functional\b|\bno (visible |clear )?fault\b|\bno (specific |obvious )?fault\b|\bgood condition\b|\bin good (working )?order\b|\boperating normally\b|\bno repair (needed|required)\b|\bnothing (seems |looks )?wrong\b|\bunable to (identify|see) (a |any )?(fault|problem|damage)\b|\bdoes not (appear |seem )?to (need|require) (repair|work)\b|\b(system|equipment|unit|motor) appears (fine|okay|ok|normal)\b/i.test(
            scanForMatchEligibility,
        ) &&
        !/\b(non-functional|not functional|faulty|broken|damaged|leaking|tripping|failed|error|fault code)\b/i.test(
            scanForMatchEligibility,
        );

    const actionRequiredIsPlaceholder = /^n\/a$/i.test(actionRequiredRaw.trim());

    const isMatchBlocked =
        isServiceBlocked ||
        hasDiagnosisFailure ||
        requiresClarification ||
        actionRequiredIsPlaceholder ||
        suggestsNoClearRepair;

    const needsMoreBeforeMatch = isMatchBlocked && !isServiceBlocked;
    const shouldAutoExpandMoreInfo =
        needsMoreBeforeMatch && !showSkeleton && !hasDiagnosisFailure;

    const canContinueToMatch =
        !showSkeleton &&
        !isMatchBlocked &&
        diagnosisTitle.trim().length > 0 &&
        !diagnosisTitle.toLowerCase().includes("diagnosing");

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
        if (!c || typeof c.trade !== "string") continue;
        const t = c.trade.trim();
        const tLower = t.toLowerCase();
        if (!t || tLower === "n/a" || tLower === tradeLabel.trim().toLowerCase()) continue;
        if (seenTrades.has(tLower)) continue;
        if (serviceCatalog.length > 0 && !serviceCatalogLower.has(tLower)) continue;
        if (typeof c.score === "number" && c.score <= 0) continue;
        seenTrades.add(tLower);
        tradeSuggestions.push({ trade: t, score: typeof c.score === "number" ? c.score : 0 });
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
        ? "Please pick one of the quick options below or type a short note so we can refine your diagnosis."
        : isServiceBlocked
          ? DIAGNOSIS_REJECT_DETAIL
          : requiresClarification
            ? "Please add a short note about the issue below so we can refine your diagnosis."
            : diagnosisDetailText;

    const diagnosisHeadline = shouldShowClarification
        ? "Need More Information"
        : isServiceBlocked
          ? DIAGNOSIS_REJECT_HEADLINE
          : requiresClarification
            ? "Need More Information"
            : diagnosisTitle;

    const pageTitle = "Your Mendr Report";
    const pageSubtitle =
        isServiceBlocked && !shouldShowClarification
            ? "We could not match this job. Add detail below or try a closer photo, and we'll re-scan."
            : "Here is what your photos suggest and sensible next steps for booking a contractor.";
    const stickyHeaderTitle =
        showSkeleton || !isDetailStageReady
            ? diagnosisTitle.trim() || "Diagnosing…"
            : diagnosisHeadline;

    // Single source of truth for the trade badge label. In clarification mode
    // we have no trade yet, so this is empty — used by both the inline badge
    // (suppressed when empty) and the sticky-header badge slot.
    const badgeContent: string = isServiceBlocked
        ? "Can't match"
        : requiresClarification
          ? ""
          : tradeLabel || selectedTradeHint || "Not Specified";
    const hasBadge = badgeContent.length > 0;
    const displayThoughtText = thoughtText.trim();
    const activeFullscreenImageSrc =
        fullscreenImageIndex != null && fullscreenImageIndex >= 0
            ? (uploadedImageSources[fullscreenImageIndex] ?? null)
            : null;
    const fullscreenHasMultiple = uploadedImageSources.length > 1;
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
        // Watches both the headline (h2) and the trade badge so we can move
        // each independently into the sticky FlowTopBar as the user scrolls.
        // getBoundingClientRect gives viewport-relative position regardless
        // of which container is scrolling.
        const updateStickyHeader = () => {
            const titleAnchor = headerTitleAnchorRef.current;
            if (titleAnchor) {
                setUseStickyHeaderName(
                    titleAnchor.getBoundingClientRect().bottom <= HEADER_HEIGHT_PX,
                );
            }
            const badgeAnchor = headerBadgeAnchorRef.current;
            if (badgeAnchor) {
                setUseStickyHeaderBadge(
                    badgeAnchor.getBoundingClientRect().bottom <= HEADER_HEIGHT_PX,
                );
            } else {
                // No badge mounted at all (e.g. empty content suppressed it) —
                // make sure we don't leave a stale "show in header" state.
                setUseStickyHeaderBadge(false);
            }
        };

        const scrollEl = scrollContainerRef.current;
        if (!scrollEl) return;
        updateStickyHeader();
        scrollEl.addEventListener("scroll", updateStickyHeader, { passive: true });
        window.addEventListener("resize", updateStickyHeader);
        return () => {
            scrollEl.removeEventListener("scroll", updateStickyHeader);
            window.removeEventListener("resize", updateStickyHeader);
        };
    }, []);

    // (Removed: scroll-swap effect for the old Need More Information overlay's
    // sticky header. The drawer doesn't have a scroll-watched H1, so the
    // effect has nothing to watch.)

    // Keyboard navigation for the fullscreen image viewer (desktop-friendly).
    // ←/→ paginate through the photos, Escape closes the viewer. Listener is
    // bound to `window` only while the viewer is open so it doesn't compete
    // with anything else on the page.
    useEffect(() => {
        if (fullscreenImageIndex == null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") {
                if (fullscreenHasMultiple) {
                    e.preventDefault();
                    goToPrevFullscreenImage();
                }
            } else if (e.key === "ArrowRight") {
                if (fullscreenHasMultiple) {
                    e.preventDefault();
                    goToNextFullscreenImage();
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                setFullscreenImageIndex(null);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [
        fullscreenImageIndex,
        fullscreenHasMultiple,
        goToPrevFullscreenImage,
        goToNextFullscreenImage,
    ]);

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
        setDiagnosisTitle("Diagnosing…");
        const joinedInfo = customerInfoItems.join("\n\n").trim();
        await runInitialDiagnosis(imageSrc, joinedInfo, picked, uploadedImageSources);
    };

    // Refine-overlay photo upload + Refresh Findings rescan. The hook
    // encapsulates the same hooks, in the same order, with the same
    // dependencies as before extraction — state stays here and is injected.
    const {
        handleRefineSelectPhotos,
        handleRefinePhotosSelected,
        handleRefineRemovePhoto,
        handleRemoveExistingPhoto,
        handleRescanReport,
    } = useRefinePhotos({
        conversationId,
        showAddInfoScreen,
        infoText,
        imageSrc,
        selectedTradeHint,
        customerInfoItems,
        uploadedImageSources,
        refinePhotos,
        refinePhotoStorageUrls,
        removedOriginalUrls,
        refineUploadInputRef,
        uploadedImageSourcesRef,
        removedOriginalUrlsRef,
        providersForDiagnoseRef,
        didRunDiagnosisRef,
        setRefinePhotos,
        setRefinePhotoStorageUrls,
        setRemovedOriginalUrls,
        setShowAddInfoScreen,
        setDiagnosisFailureMessage,
        setCustomerInfoItems,
        setInfoText,
        setUploadedImageSources,
        setImageSrc,
        setDiagnosisTitle,
        runInitialDiagnosis,
    });

    const handleShareReport = async () => {
        if (!conversationId || typeof window === "undefined") return;
        const url = new URL(
            `/report/${encodeURIComponent(conversationId)}`,
            window.location.origin,
        );
        if (customerAddress) {
            url.searchParams.set("location", customerAddress);
        }
        const shareData = {
            title: "Mendr Report",
            text: customerAddress ? `Mendr report for ${customerAddress}` : "Mendr report",
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

    /**
     * Footer shape across states:
     *
     *   Clarification (needs more info, can still match):
     *     Single primary CTA → "Answer Three Questions" (count in title case)
     *     Opens the Need More Information overlay. No ghost.
     *
     *   Normal diagnosis (confident, can match):
     *     Ghost "Add Details" + primary "Find Contractors".
     *     Ghost lets the user share more context even when the diagnosis is
     *     right.
     *
     *   Service-blocked (can't match, but user can add context to retry):
     *     Ghost "Add Details" alone. No primary — nowhere to route to.
     */
    const diagnosisFooter = showSkeleton ? null : showClarificationFooter &&
      clarificationQuestionCount > 0 ? (
        <Button
            type="button"
            className="w-full"
            disabled={isDiagnosing}
            onClick={() => setShowAnswerQuestionsScreen(true)}
        >
            {answerQuestionsCtaCopy}
        </Button>
    ) : (
        <div className="flex flex-col gap-4">
            <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                disabled={isDiagnosing}
                onClick={() => setShowAddInfoScreen(true)}
            >
                Add Details
            </Button>
            {!isServiceBlocked ? (
                <Button
                    className="w-full"
                    disabled={!canContinueToMatch || isDiagnosing || shouldAutoExpandMoreInfo}
                    onClick={() => {
                        if (!conversationId) return;
                        const key = `pending_diagnosis_image_url:${conversationId}`;
                        const listKey = `pending_diagnosis_image_urls:${conversationId}`;
                        try {
                            sessionStorage.removeItem(key);
                        } catch {}
                        try {
                            sessionStorage.removeItem(listKey);
                        } catch {}
                        try {
                            localStorage.removeItem(key);
                        } catch {}
                        writeMatchTradeContextStorage(
                            conversationId,
                            tradeLabel || selectedTradeHint,
                            tradeDetailLabel || tradeLabel || selectedTradeHint,
                        );
                        router.push(`/match/${encodeURIComponent(conversationId)}`);
                    }}
                >
                    Find Contractors
                </Button>
            ) : null}
        </div>
    );

    return (
        <>
            <DiagnosisLeaveDialog
                open={leaveDialogOpen}
                onOpenChange={setLeaveDialogOpen}
                onLeave={() => router.back()}
            />

            <div className="h-dvh overflow-hidden overscroll-none flex flex-col bg-background">
                <FlowTopBar
                    className="p-4"
                    leftSlot={
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Go back"
                            onClick={() => setLeaveDialogOpen(true)}
                        >
                            <ArrowLeft strokeWidth={2.5} />
                        </Button>
                    }
                    centerSlot={
                        <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[60%] truncate text-center text-base font-medium text-foreground">
                            {useStickyHeaderName
                                ? truncateTitleTight(stickyHeaderTitle || BRAND_NAME)
                                : BRAND_NAME}
                        </p>
                    }
                    rightSlot={
                        hasBadge && useStickyHeaderBadge ? (
                            <Badge variant="secondary" className="shrink-0">
                                {badgeContent}
                            </Badge>
                        ) : (
                            <HeaderAuth />
                        )
                    }
                />

                {/* Scrollable content */}
                <DiagnosisResultView
                    conversationId={conversationId}
                    scrollContainerRef={scrollContainerRef}
                    headerTitleAnchorRef={headerTitleAnchorRef}
                    headerBadgeAnchorRef={headerBadgeAnchorRef}
                    showSkeleton={showSkeleton}
                    showThoughtSkeleton={showThoughtSkeleton}
                    isDetailStageReady={isDetailStageReady}
                    isDiagnosing={isDiagnosing}
                    isDiagnosingRetrying={isDiagnosingRetrying}
                    diagnosisHeadline={diagnosisHeadline}
                    hasBadge={hasBadge}
                    badgeContent={badgeContent}
                    uploadedImageSources={uploadedImageSources}
                    onOpenImage={(idx) => setFullscreenImageIndex(idx)}
                    onAddDetails={() => setShowAddInfoScreen(true)}
                    displayThoughtText={displayThoughtText}
                    hasDiagnosisFailure={hasDiagnosisFailure}
                    diagnosisFailureMessage={diagnosisFailureMessage}
                    resolvedDetailText={resolvedDetailText}
                    hazardText={hazardText}
                    isServiceBlocked={isServiceBlocked}
                    shouldShowClarification={shouldShowClarification}
                    hasTradeSuggestions={hasTradeSuggestions}
                    tradeSuggestions={tradeSuggestions}
                    onTradeCandidatePick={handleTradeCandidatePick}
                    serviceCatalog={serviceCatalog}
                />
                {/* /scrollable */}

                {/* Fixed footer */}
                <div ref={footerRef} className="sticky bottom-0 shrink-0 bg-background p-4">
                    <div className="w-full max-w-xl mx-auto">{diagnosisFooter}</div>
                </div>
                {/* Add Details overlay — aligned with /start design system.
                    Users can add a short note AND/OR attach extra photos
                    (up to the 4-photo shared cap). Either input alone is
                    enough to enable Refresh Findings — the text-length floor
                    only applies when the user is going text-only. */}
                {showAddInfoScreen ? (
                    <AddDetailsOverlay
                        infoText={infoText}
                        setInfoText={setInfoText}
                        uploadedImageSources={uploadedImageSources}
                        removedOriginalUrls={removedOriginalUrls}
                        refinePhotos={refinePhotos}
                        refineUploadInputRef={refineUploadInputRef}
                        isDiagnosing={isDiagnosing}
                        showSkeleton={showSkeleton}
                        onClose={() => setShowAddInfoScreen(false)}
                        onSelectPhotos={handleRefineSelectPhotos}
                        onPhotosSelected={handleRefinePhotosSelected}
                        onRemoveExistingPhoto={handleRemoveExistingPhoto}
                        onRemoveRefinePhoto={handleRefineRemovePhoto}
                        onRescan={handleRescanReport}
                    />
                ) : null}

                {/* Need More Information drawer — bottom Sheet on mobile,
                    centered Dialog on desktop. One question per page; Continue
                    advances, Refresh Findings submits on the last. */}
                <ClarificationDrawer
                    open={showAnswerQuestionsScreen && clarificationQuestionList.length > 0}
                    onOpenChange={(next) => setShowAnswerQuestionsScreen(next)}
                    questions={clarificationQuestionList}
                    answers={clarificationAnswers}
                    onAnswersChange={setClarificationAnswers}
                    onSubmit={() =>
                        void handleClarificationBatchSubmit(clarificationQuestionList)
                    }
                    isSubmitting={isDiagnosing}
                />

                {/* Photo viewer — bottom Sheet on mobile, centered Dialog
                    on desktop. Same shell primitives as ClarificationDrawer,
                    so the two overlays animate / stack consistently. */}
                <PhotoViewer
                    open={activeFullscreenImageSrc !== null}
                    onOpenChange={(next) => {
                        if (!next) setFullscreenImageIndex(null);
                    }}
                    images={uploadedImageSources}
                    descriptions={imageThoughtBreakdown}
                    index={fullscreenImageIndex}
                    onIndexChange={(nextIdx) => setFullscreenImageIndex(nextIdx)}
                />
            </div>
            {/* /h-dvh */}
        </>
    );
}
