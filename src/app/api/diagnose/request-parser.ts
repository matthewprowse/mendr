/**
 * Request parsing + validation for /api/diagnose.
 *
 * Extracted in Phase 2 from `route.ts`. Pulls the raw body apart, applies the
 * input guards (history length, text query length, SSRF), normalises the
 * various legacy/new image fields into a flat list, and derives the boolean
 * pipeline flags (`isTextOnly`, `isProviderHydration`, `isFollowUp`, etc.).
 *
 * Returns either a 400 `Response` to send straight back, or the parsed view
 * the route uses for the rest of the flow. Behaviour preserved verbatim.
 */

import {
    MAX_DIAGNOSE_IMAGES,
    isAllowedImageUrl,
    normaliseDiagnoseImageInputs,
} from './helpers';

export interface PreviousDiagnosisLike {
    diagnosis?: string;
    trade?: string;
    trade_detail?: string;
    message?: string;
    action_required?: string;
}

export interface ParsedDiagnoseRequest {
    body: Record<string, unknown>;
    textQuery: unknown;
    history: unknown;
    feedback: unknown;
    providers: unknown;
    previousDiagnosis: unknown;
    diagnosisRejected: unknown;
    userSelectedTrade: unknown;
    initialImageDescription: unknown;
    serviceCatalog: unknown;
    analysisPhase: unknown;
    providerHydration: unknown;
    wantsStream: boolean;
    image: string | null;
    attachmentImages: string[];
    allImages: string[];
    hasAttachments: boolean;
    isTextOnly: boolean;
    isProviderHydration: boolean;
    isFollowUp: boolean;
    hasUserContext: boolean;
    prevDiagForHydration: PreviousDiagnosisLike | null | undefined;
}

export type ParseDiagnoseResult =
    | { kind: 'response'; response: Response }
    | { kind: 'parsed'; parsed: ParsedDiagnoseRequest };

export function parseDiagnoseRequest(body: Record<string, unknown>): ParseDiagnoseResult {
    const {
        textQuery,
        history,
        feedback,
        providers,
        previousDiagnosis,
        diagnosisRejected,
        userSelectedTrade,
        initial_image_description: initialImageDescription,
        serviceCatalog,
        analysisPhase,
        stream: streamResponse,
        providerHydration,
    } = body as Record<string, unknown>;

    const wantsStream = streamResponse === true;

    const rawAllImages = normaliseDiagnoseImageInputs(body);
    const allImages: string[] = rawAllImages.slice(0, MAX_DIAGNOSE_IMAGES);
    if (rawAllImages.length > MAX_DIAGNOSE_IMAGES) {
        console.warn(
            `[diagnose] received ${rawAllImages.length} images; truncating to ${MAX_DIAGNOSE_IMAGES} (extras silently dropped).`,
        );
    }
    const image = allImages[0] ?? null;
    const attachmentImages = allImages.slice(1);

    if (Array.isArray(history) && history.length > 20) {
        return {
            kind: 'response',
            response: new Response(
                JSON.stringify({ error: 'History too long. Maximum 20 turns allowed.' }),
                { status: 400 },
            ),
        };
    }
    if (typeof textQuery === 'string' && textQuery.length > 2000) {
        return {
            kind: 'response',
            response: new Response(
                JSON.stringify({ error: 'Text query too long. Maximum 2000 characters.' }),
                { status: 400 },
            ),
        };
    }
    for (const img of allImages) {
        if (img.startsWith('http') && !isAllowedImageUrl(img)) {
            return {
                kind: 'response',
                response: new Response(
                    JSON.stringify({ error: 'Invalid image URL.' }),
                    { status: 400 },
                ),
            };
        }
    }

    const hasAttachments = attachmentImages.length > 0;
    const isTextOnly = !image && !hasAttachments && typeof textQuery === 'string';
    if (!image && !isTextOnly && !hasAttachments) {
        console.error('No image, text query, or attachments provided');
        return {
            kind: 'response',
            response: new Response(
                JSON.stringify({
                    error: 'Please provide an image or describe your issue in text.',
                }),
                { status: 400 },
            ),
        };
    }

    const prevDiagForHydration = previousDiagnosis as
        | PreviousDiagnosisLike
        | null
        | undefined;
    const providerHydrationRequested = providerHydration === true;
    // We need providersForPrompt count to decide isProviderHydration. To keep
    // the parser self-contained, we re-derive that from raw `providers`.
    const providersIsNonEmpty =
        Array.isArray(providers) && (providers as unknown[]).length > 0;
    const isProviderHydration = Boolean(
        providerHydrationRequested &&
            providersIsNonEmpty &&
            prevDiagForHydration &&
            typeof prevDiagForHydration.diagnosis === 'string' &&
            prevDiagForHydration.diagnosis.trim().length > 0 &&
            typeof image === 'string' &&
            image.trim().length > 0 &&
            !isTextOnly,
    );
    const isFollowUp =
        !!(Array.isArray(history) && history.length > 0 && prevDiagForHydration?.diagnosis) ||
        isProviderHydration;

    const userSelectedTradeLike = userSelectedTrade as
        | { trade?: unknown; diagnosis?: unknown }
        | null
        | undefined;
    const hasUserContext = Boolean(
        userSelectedTradeLike?.trade && userSelectedTradeLike?.diagnosis,
    );

    return {
        kind: 'parsed',
        parsed: {
            body,
            textQuery,
            history,
            feedback,
            providers,
            previousDiagnosis,
            diagnosisRejected,
            userSelectedTrade,
            initialImageDescription,
            serviceCatalog,
            analysisPhase,
            providerHydration,
            wantsStream,
            image,
            attachmentImages,
            allImages,
            hasAttachments,
            isTextOnly,
            isProviderHydration,
            isFollowUp,
            hasUserContext,
            prevDiagForHydration,
        },
    };
}
