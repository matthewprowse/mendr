/**
 * Route: /diagnosis/[id]
 * Diagnosis step in the scan flow.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
// heic2any is loaded lazily on first HEIC conversion — keeps it out of the initial bundle.
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import {
    Share2,
    ArrowLeft,
} from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { FlowTopBar, StepHeading } from '@/components/match/flow-shell';
import { HeaderAuth } from '@/components/header-auth';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { BRAND_NAME } from '@/lib/brand-system';
import {
    ClarificationDrawer,
    type ClarificationAnswerMap,
} from './clarification-drawer';
import { PhotoViewer } from './photo-viewer';
import type { ClarificationQuestion } from '@/features/diagnosis/types';
import {
    createSelectedPhotoId,
    isHeicLike,
    normalizeSelectedPhoto,
    readFileAsDataUrl,
    uploadPhotoToStorage,
    type SelectedPhoto,
} from '@/lib/diagnosis/photo-upload';

const DIAGNOSIS_MAX_RETRIES = 3;

/** Cap used by `truncateTitleTight`. Picked to comfortably fit the sticky
 *  header's `max-w-[60%]` slot on a typical phone without leaving the CSS
 *  `truncate` rule any work to do — which is what was producing the
 *  "Name …" (space before ellipsis) artefact when the browser's truncation
 *  boundary landed on a whitespace character. */
const STICKY_TITLE_MAX_CHARS = 32;

/** Pre-truncate a title before it reaches the DOM so the browser's
 *  `text-overflow: ellipsis` never has the chance to land on a trailing
 *  space and render "Name …" (with a visible gap). `trimEnd()` strips any
 *  whitespace that would otherwise sit between the last word and the
 *  ellipsis we append. */
function truncateTitleTight(text: string, max: number = STICKY_TITLE_MAX_CHARS): string {
    const t = (text ?? '').trim();
    if (t.length <= max) return t;
    return t.slice(0, max).trimEnd() + '…';
}
/** Title-case English number words for the clarification footer CTA. We spell
 *  out 1-9 ("Answer Three Questions") and fall back to the digit beyond. */
function capitalisedNumberWord(n: number): string {
    const words = [
        'Zero',
        'One',
        'Two',
        'Three',
        'Four',
        'Five',
        'Six',
        'Seven',
        'Eight',
        'Nine',
    ];
    return n >= 0 && n < words.length ? words[n] : String(n);
}
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
    "Either this does not look like a home repair or maintenance issue we can assess from your photo, or it is not a service on Mendr's list yet. Add a clearer photo or a few words about the job below, then tap Refresh Findings. If we still cannot match you, you will need to reach a specialist outside Mendr.";

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
    // Two overlays sit on top of /diagnosis: the "Add Details" sheet (free-
    // text note + extra photos, used when the diagnosis is right but the user
    // wants to share more context) and the "Need More Information" sheet
    // (structured clarification questions only, shown when the AI can't
    // confidently diagnose without more input). Only one is open at a time.
    const [showAddInfoScreen, setShowAddInfoScreen] = useState(false);
    const [showAnswerQuestionsScreen, setShowAnswerQuestionsScreen] =
        useState(false);
    const [clarificationAnswers, setClarificationAnswers] =
        useState<ClarificationAnswerMap>({});
    // Avoid showing placeholder "Estimated Diagnosis" once we reach the /diagnosis/[id] route.
    const [diagnosisTitle, setDiagnosisTitle] = useState('Diagnosing…');
    const [customerInfoItems, setCustomerInfoItems] = useState<string[]>([]);
    const [thoughtText, setThoughtText] = useState('');
    // imageThoughtBreakdown is kept because the fullscreen image viewer reads
    // from it (one entry per image, surfaced when the user taps a photo). The
    // inline "Show thinking" toggle has been removed from the page body — the
    // synthesised `thoughtText` is the only thing displayed under the images.
    const [imageThoughtBreakdown, setImageThoughtBreakdown] = useState<string[]>([]);
    const [fullscreenImageIndex, setFullscreenImageIndex] = useState<number | null>(null);
    // (Removed: fullscreenTouchStartXRef — PhotoViewer now owns its own touch-
    // swipe handlers internally.)
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
    const [clarificationCustomText, setClarificationCustomText] = useState('');

    // Refine-overlay photo upload state. Mirrors the /start uploader: each tile
    // tracks its own status, and the hosted URL (after upload to Supabase
    // storage) is held in `refinePhotoStorageUrls` keyed by photo id. We cap
    // the total at 4 photos overall (existing diagnosis photos + new ones),
    // matching the cap in the diagnose pipeline.
    const REFINE_MAX_TOTAL_PHOTOS = 4;
    const [refinePhotos, setRefinePhotos] = useState<SelectedPhoto[]>([]);
    const [refinePhotoStorageUrls, setRefinePhotoStorageUrls] = useState<
        Record<string, string>
    >({});
    // Existing diagnosis photos the user has marked for removal inside the Add
    // Details overlay. Staged here and only committed on re-run. A ref mirrors
    // it so the upload handler can read the freed-slot count without a stale
    // closure.
    const [removedOriginalUrls, setRemovedOriginalUrls] = useState<Set<string>>(
        () => new Set()
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
    const mockStateParam = searchParams.get('mockState') || '';
    const isMockClarify =
        process.env.NODE_ENV !== 'production' && mockStateParam === 'clarify';
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
        const placeholder = '';
        const mockImages = ['', ''];
        // Mock previews against REAL fixture data so the drawer is sized
        // against the actual sentence-shaped chip lengths the model produces
        // (4-12 words, ~17-65 chars). Made-up short labels like "Today / A
        // few days" don't stress-test the layout the same way.
        const mockQuestionSet: ClarificationQuestion[] = [
            {
                id: 'mock-q1',
                question:
                    'Looking at the door, which best describes what you see?',
                options: [
                    'Cables look slack on at least one side.',
                    'Cables look tight, only the spring is broken.',
                    'Door makes a humming or grinding sound.',
                    'Something else is happening.',
                ],
            },
            {
                id: 'mock-q2',
                question:
                    'Where is the air entering the system?',
                options: [
                    'The o-ring on the lid looks compressed, cracked, or out of position.',
                    'I can hear hissing or see drips on the suction pipework.',
                    'Pool water level is below the skimmer mouth.',
                    'Something else is happening.',
                ],
            },
            {
                id: 'mock-q3',
                question:
                    'Can you lift the door manually with the motor disengaged?',
                options: [
                    'Too heavy to lift',
                    'Lifts but drops fast',
                    'Lifts and stays open',
                ],
            },
        ];
        setIsPageLoading(false);
        setIsDetailStageReady(true);
        setImageSrc(placeholder);
        setUploadedImageSources(mockImages);
        setDiagnosisTitle('Garage door spring failure');
        setTradeLabel('Garage Doors');
        setRequiresClarification(true);
        setCurrentDiagnosis({
            thinking: 'Mocked thinking.',
            diagnosis: 'Mocked diagnosis body.',
            trade: 'Garage Doors',
            action_required: 'mock_action',
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
        didRunDiagnosisRef.current = 'mock';
    }, [isMockClarify]);

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
            // Mock mode short-circuit: state was already seeded by the
            // mock-mode effect above, so don't touch it.
            if (isMockClarifyRef.current) return;
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

    // Single source of truth for the trade badge label. In clarification mode
    // we have no trade yet, so this is empty — used by both the inline badge
    // (suppressed when empty) and the sticky-header badge slot.
    const badgeContent: string = isServiceBlocked
        ? "Can't match"
        : requiresClarification
          ? ''
          : tradeLabel || selectedTradeHint || 'Not Specified';
    const hasBadge = badgeContent.length > 0;
    const displayThoughtText = thoughtText.trim();
    const activeFullscreenImageSrc =
        fullscreenImageIndex != null && fullscreenImageIndex >= 0
            ? uploadedImageSources[fullscreenImageIndex] ?? null
            : null;
    const activeFullscreenThought =
        fullscreenImageIndex != null && fullscreenImageIndex >= 0
            ? (imageThoughtBreakdown[fullscreenImageIndex] ?? '').trim()
            : '';
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
                    titleAnchor.getBoundingClientRect().bottom <= HEADER_HEIGHT_PX
                );
            }
            const badgeAnchor = headerBadgeAnchorRef.current;
            if (badgeAnchor) {
                setUseStickyHeaderBadge(
                    badgeAnchor.getBoundingClientRect().bottom <= HEADER_HEIGHT_PX
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
        scrollEl.addEventListener('scroll', updateStickyHeader, { passive: true });
        window.addEventListener('resize', updateStickyHeader);
        return () => {
            scrollEl.removeEventListener('scroll', updateStickyHeader);
            window.removeEventListener('resize', updateStickyHeader);
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
            if (e.key === 'ArrowLeft') {
                if (fullscreenHasMultiple) {
                    e.preventDefault();
                    goToPrevFullscreenImage();
                }
            } else if (e.key === 'ArrowRight') {
                if (fullscreenHasMultiple) {
                    e.preventDefault();
                    goToNextFullscreenImage();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setFullscreenImageIndex(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
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
        setDiagnosisTitle('Diagnosing…');
        const joinedInfo = customerInfoItems.join('\n\n').trim();
        await runInitialDiagnosis(
            imageSrc,
            joinedInfo,
            picked,
            uploadedImageSources,
        );
    };

    // ── Refine-overlay photo upload ──────────────────────────────────────────
    // Mirrors /start: stash a `pending` placeholder immediately, then run HEIC
    // conversion + compression in the background and patch the tile to `ready`
    // (or `error`). Uploads to Supabase storage happen in a separate effect.

    const handleRefineSelectPhotos = useCallback(() => {
        refineUploadInputRef.current?.click();
    }, []);

    const handleRefinePhotosSelected = useCallback(
        async (incoming: FileList | null) => {
            if (!incoming || incoming.length === 0) return;
            const files = Array.from(incoming).filter(
                (f) => f.type.startsWith('image/') || isHeicLike(f)
            );
            if (files.length === 0) return;
            const existingTotal =
                uploadedImageSourcesRef.current.filter(
                    (u) => !removedOriginalUrlsRef.current.has(u)
                ).length + refinePhotos.length;
            const remaining = Math.max(0, REFINE_MAX_TOTAL_PHOTOS - existingTotal);
            if (remaining === 0) {
                toast.error(
                    `You can attach at most ${REFINE_MAX_TOTAL_PHOTOS} photos in total.`
                );
                return;
            }
            const filesToQueue = files.slice(0, remaining);
            const placeholders = filesToQueue.map((file) => ({
                id: createSelectedPhotoId(),
                file,
                status: 'pending' as const,
                previewSrc: null,
                diagnosisSrc: null,
            }));
            const pendingIdsByFile = new Map(
                placeholders.map((p) => [p.file, p.id])
            );
            setRefinePhotos((prev) => [...prev, ...placeholders]);
            for (const file of filesToQueue) {
                const id = pendingIdsByFile.get(file);
                if (!id) continue;
                try {
                    const normalized = await normalizeSelectedPhoto(file);
                    setRefinePhotos((prev) =>
                        prev.map((p) =>
                            p.id === id
                                ? {
                                      ...normalized,
                                      id,
                                      file: normalized.file,
                                  }
                                : p
                        )
                    );
                } catch {
                    // Fall back to a raw data URL so the photo isn't lost on
                    // a transient HEIC-conversion failure — same pattern as
                    // /start. If even that fails, surface an error tile.
                    try {
                        const fallbackSrc = await readFileAsDataUrl(file);
                        setRefinePhotos((prev) =>
                            prev.map((p) =>
                                p.id === id
                                    ? {
                                          ...p,
                                          status: 'ready',
                                          previewSrc: fallbackSrc,
                                          diagnosisSrc: fallbackSrc,
                                          errorMessage: undefined,
                                      }
                                    : p
                            )
                        );
                    } catch {
                        setRefinePhotos((prev) =>
                            prev.map((p) =>
                                p.id === id
                                    ? {
                                          ...p,
                                          status: 'error',
                                          previewSrc: null,
                                          diagnosisSrc: null,
                                          errorMessage: isHeicLike(p.file)
                                              ? 'Could not convert this HEIC image.'
                                              : 'Could not process this image.',
                                      }
                                    : p
                            )
                        );
                    }
                }
            }
        },
        [refinePhotos.length]
    );

    const handleRefineRemovePhoto = useCallback((photoId: string) => {
        setRefinePhotos((prev) => prev.filter((p) => p.id !== photoId));
        setRefinePhotoStorageUrls((prev) => {
            const next = { ...prev };
            delete next[photoId];
            return next;
        });
    }, []);

    // Stage an existing diagnosis photo for removal. Commits on re-run.
    const handleRemoveExistingPhoto = useCallback((url: string) => {
        setRemovedOriginalUrls((prev) => {
            const next = new Set(prev);
            next.add(url);
            return next;
        });
    }, []);

    // Mirror removal state into a ref so the upload handler can read the
    // freed-slot count without a stale closure.
    useEffect(() => {
        removedOriginalUrlsRef.current = removedOriginalUrls;
    }, [removedOriginalUrls]);

    // Reset staged removals each time the Add Details overlay opens, so an
    // earlier cancelled edit does not carry over.
    useEffect(() => {
        if (showAddInfoScreen) setRemovedOriginalUrls(new Set());
    }, [showAddInfoScreen]);

    // Upload each `ready` refine photo to storage once. Mirrors the effect in
    // /start that uploads on `ready` if a hosted URL doesn't yet exist.
    useEffect(() => {
        if (!conversationId) return;
        for (const photo of refinePhotos) {
            if (
                photo.status === 'ready' &&
                !refinePhotoStorageUrls[photo.id]
            ) {
                void uploadPhotoToStorage(photo.file, conversationId).then((url) => {
                    if (url) {
                        setRefinePhotoStorageUrls((prev) => ({
                            ...prev,
                            [photo.id]: url,
                        }));
                    }
                });
            }
        }
    }, [refinePhotos, refinePhotoStorageUrls, conversationId]);

    const handleRescanReport = async () => {
        const trimmed = infoText.trim();
        // Refine can be "I'm adding text", "I'm adding photos", or "I'm
        // removing photos" — allow rescan when any of those changed.
        const readyNewPhotos = refinePhotos.filter((p) => p.status === 'ready');
        const newPhotoUrls = readyNewPhotos
            .map((p) => refinePhotoStorageUrls[p.id])
            .filter((u): u is string => typeof u === 'string' && u.length > 0);
        const hasRemovedPhotos = removedOriginalUrls.size > 0;
        if (!imageSrc) return;
        if (!trimmed && newPhotoUrls.length === 0 && !hasRemovedPhotos) return;

        // Refinement fair-use cap: the server increments refinement_count for this
        // diagnosis and returns 429 once the per-diagnosis limit is exceeded. Only
        // user-initiated refines (this handler) count, never clarifications.
        if (conversationId) {
            const capRes = await fetch('/api/diagnose/refinement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId }),
            }).catch(() => null);
            if (capRes && capRes.status === 429) {
                setShowAddInfoScreen(false);
                setDiagnosisFailureMessage(
                    'You have reached the refinement limit for this diagnosis. Start a new one to continue.'
                );
                return;
            }
        }

        setShowAddInfoScreen(false);

        const nextItems = trimmed
            ? [...customerInfoItems, trimmed]
            : customerInfoItems;
        const joinedInfo = nextItems.join('\n\n').trim();
        setCustomerInfoItems(nextItems);
        setInfoText('');

        // Append new photo URLs (deduped) to the existing photo list. The
        // diagnose pipeline caps at 4 — we already enforce that in the upload
        // handler, but slice defensively here too.
        const keptOriginals = uploadedImageSources.filter(
            (u) => !removedOriginalUrls.has(u)
        );
        const combinedPhotoSources = [
            ...keptOriginals,
            ...newPhotoUrls.filter((u) => !keptOriginals.includes(u)),
        ].slice(0, REFINE_MAX_TOTAL_PHOTOS);
        const photosChanged =
            combinedPhotoSources.length !== uploadedImageSources.length ||
            combinedPhotoSources.some((u, i) => u !== uploadedImageSources[i]);

        if (conversationId) {
            try {
                sessionStorage.removeItem(providerHydrateSessionKey(conversationId));
            } catch {
                /* ignore */
            }
            providersForDiagnoseRef.current = [];
            const noteSave = await patchConversation(conversationId, {
                initial_image_description: joinedInfo || null,
                ...(photosChanged ? { image_urls: combinedPhotoSources } : {}),
            });
            if (!noteSave.ok) {
                setDiagnosisFailureMessage(
                    noteSave.error || 'We could not save your notes. Please try again.'
                );
                return;
            }
        }

        if (photosChanged) {
            setUploadedImageSources(combinedPhotoSources);
        }

        // Clear the refine-photo staging state — the photos are now part of
        // the canonical uploadedImageSources list.
        setRefinePhotos([]);
        setRefinePhotoStorageUrls({});
        setRemovedOriginalUrls(new Set());

        // If the hero photo was removed, promote the first remaining photo to
        // primary so the diagnosis still runs off a valid source image.
        const nextPrimary =
            imageSrc && combinedPhotoSources.includes(imageSrc)
                ? imageSrc
                : combinedPhotoSources[0] ?? imageSrc;
        if (nextPrimary !== imageSrc) setImageSrc(nextPrimary);

        didRunDiagnosisRef.current = null;
        setDiagnosisTitle('Diagnosing…');
        setCustomerInfoItems(nextItems);
        await runInitialDiagnosis(
            nextPrimary,
            joinedInfo,
            selectedTradeHint.trim() || null,
            combinedPhotoSources
        );
    };

    /**
     * Batched clarification submit. Called by the Need More Information
     * overlay when the user has filled every question and tapped Refresh
     * Findings. Reads the per-question answers from `clarificationAnswers`
     * state (lifted above the list component), joins them into a single
     * multi-paragraph Q&A note, and pipes that through the same re-diagnose
     * path the single-choice handler uses.
     */
    const handleClarificationBatchSubmit = async (
        questions: ClarificationQuestion[]
    ) => {
        // Real diagnoses need a valid source image. Mock mode runs with an
        // empty placeholder src on purpose, so we skip that guard for it.
        if (!isMockClarifyRef.current && !imageSrc) return;
        if (isDiagnosing || showSkeleton) return;
        const pairs = questions
            .map((q, idx) => {
                const entry = clarificationAnswers[idx];
                if (!entry) return null;
                const chip = entry.pickedChip?.trim() ?? '';
                const extra = (entry.extra ?? '').trim();
                // Combine chip + extra into one answer block. If only one of
                // them is present, send just that. If both, list the chip
                // first and the extra as supplemental context — keeps the
                // structured signal intact for the model.
                let answer = '';
                if (chip && extra) answer = `${chip}\n(Additional: ${extra})`;
                else if (chip) answer = chip;
                else if (extra) answer = extra;
                if (!answer) return null;
                return `Q: ${q.question}\nA: ${answer}`;
            })
            .filter((s): s is string => Boolean(s));
        if (pairs.length === 0) return;
        const joinedAnswer = pairs.join('\n\n');
        // Close the overlay and clear answers so a follow-up clarification
        // (the model can ask for clarification again after this round) lands
        // on a fresh slate.
        setShowAnswerQuestionsScreen(false);
        setClarificationAnswers({});
        if (isMockClarifyRef.current) {
            toast.success(`Mock submitted ${pairs.length} answers.`);
            return;
        }
        await handleClarificationChoice(joinedAnswer);
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

    // Build the question list for the Need More Information overlay. Two
    // sources, preference order:
    //   1) `clarification_question_set` from the diagnosis row (new shape).
    //   2) Legacy `clarification_questions: string[]` — wrap as ONE question
    //      using the derived prompt, so old diagnoses still render.
    const newClarificationSet: ClarificationQuestion[] = Array.isArray(
        currentDiagnosis?.clarification_question_set
    )
        ? currentDiagnosis!.clarification_question_set!
        : [];
    const clarificationQuestionList: ClarificationQuestion[] =
        newClarificationSet.length > 0
            ? newClarificationSet
            : clarificationOptions.length > 0
              ? [
                    {
                        id: 'legacy-single',
                        question: clarificationPrompt,
                        options: clarificationOptions,
                    },
                ]
              : [];
    const clarificationQuestionCount = clarificationQuestionList.length;
    const clarificationAllAnswered =
        clarificationQuestionCount > 0 &&
        clarificationQuestionList.every((_, idx) => {
            const entry = clarificationAnswers[idx];
            if (!entry) return false;
            const chip = entry.pickedChip;
            const extra = (entry.extra ?? '').trim();
            return Boolean(chip) || extra.length > 0;
        });

    const showClarificationFooter =
        requiresClarification && !isServiceBlocked && !(clarificationSubmitLoading && isDiagnosing);

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
    const answerQuestionsCtaCopy =
        clarificationQuestionCount === 1
            ? 'Answer One Question'
            : `Answer ${capitalisedNumberWord(clarificationQuestionCount)} Questions`;
    const diagnosisFooter = showSkeleton ? null : showClarificationFooter && clarificationQuestionCount > 0 ? (
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
                <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
                    <div className="flex flex-col w-full max-w-xl mx-auto gap-8 p-4">

                {/* Diagnosis title + badge */}
                <div className="flex w-full flex-col gap-3">
                    {showSkeleton || !isDetailStageReady ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <Skeleton className="h-8 w-[88%] max-w-md" />
                            <Skeleton className="h-6 w-[62%] max-w-sm md:hidden" />
                        </div>
                    ) : (
                        <h2
                            ref={headerTitleAnchorRef}
                            className="w-full min-w-0 text-2xl font-semibold break-words"
                        >
                            {diagnosisHeadline}
                        </h2>
                    )}
                    {showSkeleton || !isDetailStageReady ? (
                        <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
                    ) : hasBadge ? (
                        // Wrapper div carries the scroll anchor so the badge
                        // can fade out of the body and into the header
                        // rightSlot without us needing to query the badge
                        // node itself (which would re-render on every render).
                        <div ref={headerBadgeAnchorRef} className="w-fit">
                            <Badge variant="secondary" className="w-fit">
                                {badgeContent}
                            </Badge>
                        </div>
                    ) : null}
                    {/* Sub-description, mirrors /start: text-sm muted, sits
                        beneath the headline group. Hidden during skeleton so
                        we don't reserve dead space while content streams in. */}
                    {!showSkeleton && isDetailStageReady ? (
                        <p className="text-sm text-muted-foreground">
                            Here is what we think is wrong, exactly why we think so, and roughly what it should take to put it right again.</p>
                    ) : null}
                </div>

                <div className="flex flex-col gap-3">
                    {uploadedImageSources.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                            {uploadedImageSources.map((src, idx) => (
                                <DiagnosisPhotoTile
                                    key={`${src}-${idx}`}
                                    src={src}
                                    index={idx}
                                    showNumber={uploadedImageSources.length > 1}
                                    onOpen={() => setFullscreenImageIndex(idx)}
                                />
                            ))}
                            {/*
                              Odd-count slot. /start fills this with an "Add
                              Photos" trigger; here we route to the refine
                              overlay (where users CAN attach extra photos)
                              so the affordance is honest. Only shown for 1 or
                              3 — 2 and 4 fill the grid cleanly. Hidden when
                              the diagnosis is in a transient/loading state.
                            */}
                            {(uploadedImageSources.length === 1 ||
                                uploadedImageSources.length === 3) &&
                            !showSkeleton ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => setShowAddInfoScreen(true)}
                                    className="aspect-square h-auto w-full"
                                >
                                    Add Photos
                                </Button>
                            ) : null}
                        </div>
                    ) : showSkeleton ? (
                        <div className="grid grid-cols-2 gap-2">
                            <Skeleton className="aspect-square w-full rounded-lg" />
                            <Skeleton className="aspect-square w-full rounded-lg" />
                            <Skeleton className="aspect-square w-full rounded-lg" />
                            <Skeleton className="aspect-square w-full rounded-lg" />
                        </div>
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
                        // Thought block is now a single synthesised summary
                        // across all images. Per-image detail is reachable by
                        // tapping a photo — the fullscreen viewer surfaces the
                        // breakdown for the specific image opened.
                        <p className="text-xs text-muted-foreground">{displayThoughtText}</p>
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

                {/*
                  Inline "Refine Diagnosis" intentionally removed — the action
                  now lives in the sticky footer as a ghost "Add Details"
                  button, paired with the primary "Find Contractors" CTA.
                */}

                    </div>{/* /max-w-xl */}
                </div>{/* /scrollable */}

                {/* Fixed footer */}
                <div
                    ref={footerRef}
                    className="sticky bottom-0 shrink-0 bg-background p-4"
                >
                    <div className="w-full max-w-xl mx-auto">
                        {diagnosisFooter}
                    </div>
                </div>
                {/* Add Details overlay — aligned with /start design system.
                    Users can add a short note AND/OR attach extra photos
                    (up to the 4-photo shared cap). Either input alone is
                    enough to enable Refresh Findings — the text-length floor
                    only applies when the user is going text-only. */}
                {showAddInfoScreen && (() => {
                    const refineReadyCount = refinePhotos.filter(
                        (p) => p.status === 'ready'
                    ).length;
                    const refinePendingCount = refinePhotos.filter(
                        (p) => p.status === 'pending'
                    ).length;
                    const keptOriginals = uploadedImageSources.filter(
                        (u) => !removedOriginalUrls.has(u)
                    );
                    const totalPhotosAfter =
                        keptOriginals.length + refinePhotos.length;
                    const canAddMorePhotos =
                        totalPhotosAfter < REFINE_MAX_TOTAL_PHOTOS;
                    // One shared 1..N numbering across existing + new photos.
                    // At least one photo must remain, so removal is disabled
                    // once a single tile is left.
                    const showTileNumbers = totalPhotosAfter > 1;
                    const canRemoveAny = totalPhotosAfter > 1;
                    // Mirror /start's add-photo placement: an odd tile count
                    // gets a square "Add Photos" tile to fill the 2-col row, an
                    // even count gets a full-width button below the grid.
                    const addPhotosAsTile =
                        canAddMorePhotos && totalPhotosAfter % 2 === 1;
                    const addPhotosAsButton =
                        canAddMorePhotos && totalPhotosAfter % 2 === 0;
                    const hasNewText =
                        infoText.trim().length >= MIN_DESCRIPTION_CHARS;
                    const hasNewPhotos = refineReadyCount > 0;
                    // Removing an existing photo is itself a change worth
                    // re-running on, even with no new text or new photos.
                    const hasRemovedPhotos = removedOriginalUrls.size > 0;
                    const canRescan =
                        (hasNewText || hasNewPhotos || hasRemovedPhotos) &&
                        refinePendingCount === 0 &&
                        !isDiagnosing &&
                        !showSkeleton;
                    return (
                        <div className="absolute inset-0 z-[300] flex flex-col overflow-hidden bg-background">
                            <FlowTopBar
                                className="p-4"
                                leftSlot={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Go back"
                                        onClick={() => setShowAddInfoScreen(false)}
                                    >
                                        <ArrowLeft strokeWidth={2.5} aria-hidden />
                                    </Button>
                                }
                                centerSlot={
                                    <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                                        Add Details
                                    </p>
                                }
                            />
                            <input
                                ref={refineUploadInputRef}
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                className="sr-only"
                                onChange={(e) => {
                                    void handleRefinePhotosSelected(
                                        e.target.files
                                    );
                                    e.currentTarget.value = '';
                                }}
                            />
                            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                                <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                                    <div className="flex flex-col gap-8 w-full max-w-xl mx-auto">
                                        <StepHeading
                                            title="What Else Should We Know?"
                                            sub="Add more photos or extra detail about the problem and we will refine the diagnosis to make it more accurate."
                                        />

                                        {totalPhotosAfter > 0 ? (
                                            <div className="grid grid-cols-2 gap-2">
                                                {keptOriginals.map((url, idx) => (
                                                    <DiagnosisPhotoTile
                                                        key={url}
                                                        src={url}
                                                        index={idx}
                                                        showNumber={showTileNumbers}
                                                        onRemove={() =>
                                                            handleRemoveExistingPhoto(url)
                                                        }
                                                        canRemove={canRemoveAny}
                                                    />
                                                ))}
                                                {refinePhotos.map((photo, idx) => (
                                                    <RefinePhotoTile
                                                        key={photo.id}
                                                        photo={photo}
                                                        index={
                                                            keptOriginals.length + idx
                                                        }
                                                        showNumber={showTileNumbers}
                                                        onRemove={
                                                            handleRefineRemovePhoto
                                                        }
                                                        canRemove={canRemoveAny}
                                                    />
                                                ))}
                                                {addPhotosAsTile ? (
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        onClick={
                                                            handleRefineSelectPhotos
                                                        }
                                                        className="aspect-square h-auto w-full"
                                                    >
                                                        Add Photos
                                                    </Button>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        {addPhotosAsButton ? (
                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    onClick={handleRefineSelectPhotos}
                                                >
                                                    Add Photos
                                                </Button>
                                                <p className="text-center text-xs text-muted-foreground">
                                                    Add up to four photos. Clear, well lit ones work best.</p>
                                            </div>
                                        ) : null}

                                        {!canAddMorePhotos ? (
                                            <p className="text-center text-xs text-muted-foreground">
                                                You have added the most photos we can take, which is four.</p>
                                        ) : null}

                                        {/* Note input — mirrors /start's Problem
                                            Description block exactly: Label + char
                                            counter, default-height Textarea (no fixed
                                            h-N), no placeholder, helper line below. */}
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="adjust-note">
                                                    Problem Description
                                                </Label>
                                                <span className="text-xs text-muted-foreground">
                                                    {infoText.length} / 500
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <Textarea
                                                    id="adjust-note"
                                                    autoFocus
                                                    maxLength={500}
                                                    value={infoText}
                                                    onChange={(e) =>
                                                        setInfoText(e.target.value)
                                                    }
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Tell us anything new you have noticed since the diagnosis.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="sticky bottom-0 shrink-0 bg-background p-4">
                                <div className="w-full max-w-xl mx-auto">
                                    <Button
                                        type="button"
                                        className="w-full"
                                        disabled={!canRescan}
                                        onClick={() => void handleRescanReport()}
                                    >
                                        {isDiagnosing
                                            ? 'Processing\u2026'
                                            : 'Refresh Findings'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

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
                        void handleClarificationBatchSubmit(
                            clarificationQuestionList
                        )
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

            </div>{/* /h-dvh */}
        </>
    );
}

// ── Photo tiles ──────────────────────────────────────────────────────────────
// Two tile components live here because their roles differ:
//   * `DiagnosisPhotoTile` is read-only — it renders the already-uploaded
//     photos that fed the current diagnosis and acts as the click target for
//     the existing full-screen carousel.
//   * `RefinePhotoTile` is used inside the Add Details overlay where new
//     photos go through the same `pending` → `ready` / `error` lifecycle the
//     /start uploader uses, plus a Remove button.
// Keeping them separate avoids the conditional sprawl that a single component
// would need, at the cost of a little markup duplication.

function DiagnosisPhotoTile({
    src,
    index,
    showNumber,
    onOpen,
    onRemove,
    canRemove = true,
}: {
    /** Empty string renders a bg-secondary placeholder — used by mock mode
     *  and any case where the row is hydrating before image URLs land. */
    src: string;
    index: number;
    showNumber: boolean;
    onOpen?: () => void;
    /** When provided, the tile renders a removable variant (used in the Add
     *  Details overlay) instead of the full-screen-open button. */
    onRemove?: () => void;
    canRemove?: boolean;
}) {
    const hasImage = src.trim().length > 0;
    const wrapperCls = [
        'relative aspect-square overflow-hidden rounded-lg border border-border',
        hasImage ? 'bg-background' : 'bg-secondary',
    ].join(' ');
    const inner = (
        <>
            {hasImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={src}
                    alt={`Uploaded issue photo ${index + 1}`}
                    className="h-full w-full object-cover"
                    draggable={false}
                />
            ) : null}
            {showNumber ? (
                <Badge variant="count" className="absolute bottom-2 left-2">
                    {index + 1}
                </Badge>
            ) : null}
        </>
    );

    // Removable variant: a div wrapper with the same outline Remove badge that
    // RefinePhotoTile uses. Rendered as a div (not a button) so the Remove
    // button isn't nested inside another button. No full-screen open here.
    if (onRemove) {
        return (
            <div className={wrapperCls}>
                {inner}
                {canRemove ? (
                    <Badge asChild variant="outline">
                        <button
                            type="button"
                            className="absolute right-2 top-2 cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
                            }}
                            aria-label="Remove photo"
                        >
                            Remove
                        </button>
                    </Badge>
                ) : null}
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={
                hasImage
                    ? `Open uploaded issue photo ${index + 1}`
                    : `Photo placeholder ${index + 1}`
            }
            className={wrapperCls}
        >
            {inner}
        </button>
    );
}

function RefinePhotoTile({
    photo,
    index,
    showNumber,
    onRemove,
    canRemove = true,
}: {
    photo: SelectedPhoto;
    index: number;
    showNumber: boolean;
    onRemove: (photoId: string) => void;
    canRemove?: boolean;
}) {
    const isReady = photo.status === 'ready' && photo.previewSrc;
    const wrapperCls = [
        'relative aspect-square overflow-hidden rounded-lg border border-border transition-all duration-150',
        isReady ? 'bg-background' : 'bg-secondary',
    ].join(' ');
    return (
        <div className={wrapperCls}>
            {isReady ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={photo.previewSrc!}
                    alt={photo.file.name || ''}
                    className="h-full w-full object-cover"
                    draggable={false}
                />
            ) : photo.status === 'pending' ? (
                <div className="flex h-full w-full items-center justify-center">
                    <Spinner className="size-5 text-muted-foreground" />
                </div>
            ) : (
                <div className="flex h-full w-full items-center justify-center p-3 text-center">
                    <p className="line-clamp-3 text-xs text-muted-foreground">
                        {photo.errorMessage ?? 'Could not process this image.'}
                    </p>
                </div>
            )}
            {showNumber ? (
                <Badge variant="count" className="absolute bottom-2 left-2">
                    {index + 1}
                </Badge>
            ) : null}
            {isReady && canRemove ? (
                <Badge asChild variant="outline">
                    <button
                        type="button"
                        className="absolute right-2 top-2 cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(photo.id);
                        }}
                        aria-label="Remove photo"
                    >
                        Remove
                    </button>
                </Badge>
            ) : null}
        </div>
    );
}

