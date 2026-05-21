import type { DiagnosisData } from '@/features/diagnosis/types';
import { fetchProvidersApi } from '@/features/match/api/client';
import { saveMatchPageCache } from '@/features/match/cache/match-page-cache';
import { fetchConversationDiagnosis, patchConversation, type ConversationDiagnosisRow } from '@/lib/diagnosis/diagnoses-api';
import { parseDiagnosisFromModelResponse } from '@/lib/diagnosis/parse-diagnosis-from-model-response';


export type ProcessingStepKey =
    | 'uploadConfirmed'
    | 'imageThoughtComplete'
    | 'fullDiagnosisComplete'
    | 'prefetchQueued'
    | 'prefetchSkipped';

export type ProcessingStepStatus = 'idle' | 'running' | 'done' | 'error';

export type ProcessingStepUpdate = {
    key: ProcessingStepKey;
    status: ProcessingStepStatus;
    message?: string;
};

export const PROCESSING_STEP_ORDER: ProcessingStepKey[] = [
    'uploadConfirmed',
    'imageThoughtComplete',
    'fullDiagnosisComplete',
    'prefetchQueued',
];

/**
 * True when persisted diagnosis is complete enough that we should not re-run the pipeline.
 * Trade-hint bootstrap rows use diagnosis like "Plumbing services" with confidence 0 — those are not complete.
 */
export function shouldSkipDiagnosisPipeline(d: DiagnosisData | null | undefined): boolean {
    const headline = (d?.diagnosis ?? '').trim();
    if (!headline) return false;
    if (headline === 'Diagnosing…') return false;
    const confidence = typeof d?.confidence === 'number' && Number.isFinite(d.confidence) ? d.confidence : 0;
    if (confidence < 1 && /\s+services$/i.test(headline)) return false;
    return true;
}

export function buildDiagnosisVersion(diagnosis: DiagnosisData): string {
    const confidence =
        typeof diagnosis.confidence === 'number' && Number.isFinite(diagnosis.confidence)
            ? String(Math.round(diagnosis.confidence))
            : '';
    return [
        (diagnosis.trade ?? '').trim().toLowerCase(),
        (diagnosis.trade_detail ?? '').trim().toLowerCase(),
        String(Boolean(diagnosis.requires_clarification)),
        String(Boolean(diagnosis.rejected)),
        String(Boolean(diagnosis.unserviced)),
        confidence,
    ].join('|');
}

export function isDiagnosisAccurateForPrefetch(diagnosis: DiagnosisData): {
    eligible: boolean;
    reason?: string;
} {
    const trade = (diagnosis.trade ?? '').trim();
    if (!trade || trade.toLowerCase() === 'n/a') return { eligible: false, reason: 'invalid_trade' };
    if (diagnosis.requires_clarification) return { eligible: false, reason: 'requires_clarification' };
    if (diagnosis.rejected) return { eligible: false, reason: 'rejected' };
    if (diagnosis.unserviced) return { eligible: false, reason: 'unserviced' };
    if (typeof diagnosis.confidence === 'number' && Number.isFinite(diagnosis.confidence) && diagnosis.confidence < 85) {
        return { eligible: false, reason: 'low_confidence' };
    }
    return { eligible: true };
}

type RunProcessingArgs = {
    conversationId: string;
    imageUrl: string | null;
    imageUrls: string[];
    prompt: string;
    selectedService: string | null;
    userId: string | null;
    onStep: (update: ProcessingStepUpdate) => void;
};

export async function runDiagnosisProcessingPipeline({
    conversationId,
    imageUrl,
    imageUrls,
    prompt,
    selectedService,
    userId,
    onStep,
}: RunProcessingArgs): Promise<DiagnosisData> {
    const normalizedPrompt = prompt.trim();
    const normalizedSelectedService = selectedService?.trim() ?? '';
    if (normalizedPrompt.length < 25 && !normalizedSelectedService) {
        throw new Error('Please provide at least 25 characters or select a service.');
    }

    onStep({ key: 'uploadConfirmed', status: 'running' });
    const existing = await fetchConversationDiagnosis(conversationId);
    const existingDiagnosis = existing.ok ? ((existing.data?.diagnosis as DiagnosisData | null) ?? null) : null;
    if (shouldSkipDiagnosisPipeline(existingDiagnosis)) {
        onStep({ key: 'uploadConfirmed', status: 'done' });
        onStep({ key: 'imageThoughtComplete', status: 'done', message: 'Using saved analysis.' });
        onStep({ key: 'fullDiagnosisComplete', status: 'done' });
        onStep({ key: 'prefetchSkipped', status: 'done', message: 'Already prepared.' });
        return existingDiagnosis as DiagnosisData;
    }
    onStep({ key: 'uploadConfirmed', status: 'done' });

    const conversationRow = existing.ok ? existing.data : null;
    const serviceCatalog = await fetch('/api/service-catalog', { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) =>
            Array.isArray(body?.labels)
                ? body.labels.map((x: unknown) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
                : []
        )
        .catch(() => [] as string[]);
    if (serviceCatalog.length === 0) {
        throw new Error('Could not load service catalog.');
    }

    // Optional lightweight thought call — does not gate the full diagnosis request.
    onStep({ key: 'imageThoughtComplete', status: 'running' });
    const normalizedImageUrls = Array.isArray(imageUrls)
        ? imageUrls.filter((x) => typeof x === 'string' && x.trim().length > 0)
        : [];
    const primaryImage = imageUrl?.trim() || normalizedImageUrls[0] || null;
    const additionalAttachments = normalizedImageUrls
        .filter((x) => x !== primaryImage)
        .slice(0, 3);
    if (primaryImage) {
        void fetch('/api/diagnose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: primaryImage,
                ...(additionalAttachments.length > 0 ? { attachments: additionalAttachments } : {}),
                analysisPhase: 'image_thought_only',
                serviceCatalog,
                textQuery:
                    normalizedPrompt ||
                    'Analyse only the photo first. Output <thought> only about what is visibly happening and likely issue pattern. Keep it concise and practical.',
                ...(selectedService
                    ? {
                          userSelectedTrade: {
                              trade: selectedService,
                              diagnosis: `${selectedService} services`,
                          },
                      }
                    : {}),
            }),
        }).catch(() => null);
        onStep({ key: 'imageThoughtComplete', status: 'done' });
    } else {
        onStep({ key: 'imageThoughtComplete', status: 'done', message: 'No photo provided — using text only.' });
    }

    onStep({ key: 'fullDiagnosisComplete', status: 'running' });
    const diagnoseRes = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...(primaryImage ? { image: primaryImage } : {}),
            ...(additionalAttachments.length > 0 ? { attachments: additionalAttachments } : {}),
            serviceCatalog,
            ...(normalizedPrompt
                ? { textQuery: normalizedPrompt }
                : normalizedSelectedService
                  ? { textQuery: `${normalizedSelectedService} services` }
                  : {}),
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
    const diagnoseText = await diagnoseRes.text();
    if (!diagnoseRes.ok) {
        throw new Error('Diagnosis request failed.');
    }
    const parsed = parseDiagnosisFromModelResponse(diagnoseText);
    if (!parsed) {
        throw new Error('Could not parse diagnosis response.');
    }

    const result = parsed;

    const saveResult = await patchConversation(conversationId, {
        title: result.diagnosis || 'New Diagnosis',
        image_url: primaryImage,
        diagnosis: result,
        initial_image_description: normalizedPrompt || (normalizedSelectedService ? `${normalizedSelectedService} services` : null),
        device: typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        user_id: userId,
    });
    if (!saveResult.ok) {
        throw new Error(saveResult.error || 'Could not save diagnosis.');
    }
    onStep({ key: 'fullDiagnosisComplete', status: 'done' });

    const prefetchEligibility = isDiagnosisAccurateForPrefetch(result);
    if (!prefetchEligibility.eligible) {
        onStep({ key: 'prefetchSkipped', status: 'done', message: `Skipped: ${prefetchEligibility.reason}` });
        return result;
    }

    onStep({ key: 'prefetchQueued', status: 'running' });
    const latest = await fetchConversationDiagnosis(conversationId);
    const conv = latest.ok ? latest.data : conversationRow;
    await prefetchProvidersIntoMatchCache(conversationId, conv, result);
    onStep({ key: 'prefetchQueued', status: 'done' });
    return result;
}

export async function prefetchProvidersIntoMatchCache(
    conversationId: string,
    conversation: ConversationDiagnosisRow | null | undefined,
    diagnosis: DiagnosisData
): Promise<void> {
    const lat = conversation?.customer_lat;
    const lng = conversation?.customer_lng;
    const trade = (diagnosis.trade ?? '').trim();
    const tradeDetail = (diagnosis.trade_detail ?? '').trim();
    if (
        typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        !trade
    ) {
        return;
    }

    const providersResult = await fetchProvidersApi({
        lat,
        lng,
        trade,
        ...(tradeDetail ? { tradeDetail } : {}),
        radius: 25_000,
    });
    if (!providersResult.ok || !providersResult.data?.providers?.length) return;

    saveMatchPageCache(conversationId, {
        providers: providersResult.data.providers,
        companyIndex: 1,
        searchRadiusMeters: 25_000,
        userLocation: {
            lat,
            lng,
            address: String(conversation?.customer_address ?? '').trim(),
        },
        addressInput: String(conversation?.customer_address ?? '').trim(),
        enrichmentCache: {},
        scandioReviewCountByProviderId: {},
        diagnosisVersion: buildDiagnosisVersion(diagnosis),
        savedAt: Date.now(),
    });
}
