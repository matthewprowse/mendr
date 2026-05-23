/**
 * Response shaping for /api/diagnose.
 *
 * Extracted in Phase 2 from `route.ts`. Combines the locked-in classification
 * (Agent 2a) and prose result (Agent 2b) into the backwards-compatible
 * `<thought>…</thought><json>…</json>` string the frontend already parses.
 *
 * Behaviour is preserved verbatim from the original `buildCompatibleResponseText`
 * — this is a mechanical extraction so the route handler can shrink and the
 * shaping logic can be unit-tested with synthetic classify/prose inputs.
 */

import { GEMINI_MODEL_NAME } from '@/lib/ai/ai-diagnosis-backend';
import { DIAGNOSE_PROMPT_VERSION } from '@/features/diagnosis/prompts/prompt-version';
import { logIfDiagnosisJsonShapeUnexpected } from '@/features/diagnosis/diagnosis-json-validate';
import {
    buildUnrelatedImageMessage,
    buildUnsupportedHomeServiceMessage,
} from '@/features/diagnosis/prompts/special-cases';
import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import type { ProseResult } from '@/features/diagnosis/agent-prose';
import {
    inferTradeFromSignals,
    TAXONOMY_NONE_ID,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';
import { tradeToServiceLabel } from '@/lib/services';
import { computeStructuralConfidence } from '@/lib/diagnosis/structural-confidence';

interface HistoryLike {
    content?: unknown;
}

/**
 * Returns 3–4 short homeowner-perspective clarification chips appropriate
 * for the given trade. Used as a fallback when Agent 2b returns
 * requires_clarification but no clarification_questions.
 */
export function buildTradeFallbackClarificationChips(trade: string): string[] {
    const t = (trade ?? '').toLowerCase().trim();
    if (t.includes('electrical')) {
        return [
            'There is no power to a circuit or outlet.',
            'A switch, fitting, or light is not working.',
            'There is tripping, sparking, or a burning smell.',
            'Something else is happening.',
        ];
    }
    if (t.includes('plumbing')) {
        return [
            'There is a visible leak or drip.',
            'A drain or pipe is blocked.',
            'The geyser or hot water is not working.',
            'Something else is happening.',
        ];
    }
    if (t.includes('security') || t.includes('access')) {
        return [
            'The gate opens but does not close.',
            'The gate does not respond to the remote.',
            'The intercom or access panel is faulty.',
            'Something else is happening.',
        ];
    }
    if (t.includes('pool')) {
        return [
            'The pump or filter is not running.',
            'The water is discoloured or has algae.',
            'There is a visible leak.',
            'Something else is happening.',
        ];
    }
    if (t.includes('carpentry') || t.includes('woodwork')) {
        return [
            'A door, window, or cabinet is not closing properly.',
            'There is visible damage or rot.',
            'A fitting or hinge needs replacing.',
            'Something else is happening.',
        ];
    }
    if (t.includes('painting')) {
        return [
            'There is peeling, cracking, or bubbling paint.',
            'There is damp staining on a wall.',
            'A surface needs repainting after repairs.',
            'Something else is happening.',
        ];
    }
    if (t.includes('flooring') || t.includes('tiling')) {
        return [
            'Tiles are cracked, loose, or lifting.',
            'Grout is damaged or discoloured.',
            'A floor surface needs replacing or repairing.',
            'Something else is happening.',
        ];
    }
    if (t.includes('building') || t.includes('construction')) {
        return [
            'There is a crack in a wall or ceiling.',
            'There is damp, water ingress, or a leak.',
            'Structural work or an extension is needed.',
            'Something else is happening.',
        ];
    }
    if (t.includes('handyman')) {
        return [
            'It is a small repair or odd job.',
            'Assembly or installation is needed.',
            'Multiple small tasks need doing.',
            'Something else is happening.',
        ];
    }
    if (t.includes('locksmith')) {
        return [
            'A lock is broken or not working.',
            'Keys are lost or a lock needs rekeying.',
            'A new lock or deadbolt needs fitting.',
            'Something else is happening.',
        ];
    }
    if (t.includes('welding')) {
        return [
            'A metal gate, fence, or fitting is broken.',
            'A structural metal component needs repair.',
            'Something else is happening.',
        ];
    }
    // Generic fallback for unknown or N/A trade.
    return [
        'The issue is with a fitting or fixture.',
        'The issue is structural or with a surface.',
        'The issue involves a mechanical or electrical component.',
        'Something else is happening.',
    ];
}

export function inferTradeFromProseFallback(value: unknown, allowed: string[]): string {
    const raw = typeof value === 'string' ? value : '';
    if (!raw.trim()) return '';
    const taxonomyHit = inferTradeFromSignals(raw);
    if (taxonomyHit) {
        const hit = allowed.find(
            (l) => l.toLowerCase() === taxonomyHit.trade.toLowerCase(),
        );
        if (hit) return hit;
        return taxonomyHit.trade;
    }
    const t = raw.toLowerCase();
    if (/\b(garage door|gate motor|garage motor|roller shutter|access control)\b/.test(t)) {
        const hit = allowed.find((l) => l.toLowerCase() === 'security');
        return hit ?? 'Security';
    }
    if (/\b(leak|pipe|geyser|toilet|tap|drain|plumbing)\b/.test(t)) {
        const hit = allowed.find((l) => l.toLowerCase() === 'plumbing');
        return hit ?? 'Plumbing';
    }
    if (/\b(trip|db board|socket|light|wiring|electrical)\b/.test(t)) {
        const hit = allowed.find((l) => l.toLowerCase() === 'electrical');
        return hit ?? 'Electrical';
    }
    const loose = tradeToServiceLabel(raw);
    if (!loose) return '';
    const hit = allowed.find((l) => l.toLowerCase() === loose.toLowerCase());
    return hit ?? loose;
}

/** Align trade/trade_detail with taxonomy keywords when prose contradicts classification. */
export function reconcileTradeFromDiagnosisSignals(
    j: Record<string, unknown>,
    cls: {
        trade: string;
        subcategory_id: string;
    },
    allowed: string[],
): void {
    const rejected = Boolean(j.rejected);
    const unserviced = Boolean(j.unserviced);
    const tradeStr = typeof j.trade === 'string' ? j.trade.trim() : '';
    if (rejected || unserviced || !tradeStr || tradeStr.toLowerCase() === 'n/a') return;

    const primary = [
        j.diagnosis,
        j.estimated_diagnosis_sentence,
        j.trade_detail,
        typeof j.message === 'string' ? (j.message as string).slice(0, 800) : '',
    ]
        .map((x) => (typeof x === 'string' ? x : ''))
        .join(' | ');

    const inferred = inferTradeFromSignals(primary);
    if (!inferred) return;

    const inferredAllowed = allowed.find(
        (l) => l.toLowerCase() === inferred.trade.toLowerCase(),
    );
    const curResolved =
        allowed.find((l) => l.toLowerCase() === tradeStr.toLowerCase()) ?? tradeStr;
    const inferredNorm = inferredAllowed ?? inferred.trade;
    const curNorm = curResolved;

    if (inferredNorm.toLowerCase() === curNorm.toLowerCase()) return;

    const handyman =
        allowed.find((l) => l.toLowerCase() === 'general handyman') ?? 'General Handyman';

    const shouldOverride =
        handyman.toLowerCase() === curNorm.toLowerCase() ||
        cls.subcategory_id === TAXONOMY_NONE_ID;

    if (!shouldOverride) return;

    const nextTrade = inferredAllowed ?? inferredNorm;
    if (!allowed.some((l) => l.toLowerCase() === nextTrade.toLowerCase())) return;

    const resolved =
        allowed.find((l) => l.toLowerCase() === nextTrade.toLowerCase()) ?? nextTrade;
    j.trade = resolved;
    j.trade_detail = inferred.label;
    j.subcategory_id = inferred.subcategoryId;
}

export interface BuildCompatibleResponseInput {
    thoughtText: string;
    classification: ClassificationResult;
    prose: ProseResult;
    serviceList: string[];
    previousDiagnosis: unknown;
    diagnosisRejected: unknown;
    history: unknown;
    initialImageDescription: unknown;
    textQuery: unknown;
    imageCountAfterTier: number | null;
    hasImage: boolean;
    attachmentCount: number;
}

/**
 * Build the final backwards-compatible response string.
 * Wraps Agent 2b output + Agent 2a classification into the existing
 * <thought>…</thought><json>…</json> format the frontend parses.
 *
 * Behaviour preserved verbatim from the original inline implementation in
 * `route.ts` so the integration safety-net tests continue to pass unchanged
 * across the refactor.
 */
export function buildCompatibleResponseText(
    input: BuildCompatibleResponseInput,
): string {
    const {
        thoughtText,
        classification,
        prose,
        serviceList,
        previousDiagnosis,
        diagnosisRejected,
        history,
        initialImageDescription,
        textQuery,
        imageCountAfterTier,
        hasImage,
        attachmentCount,
    } = input;

    const ensuredThought =
        thoughtText.trim().length >= 50
            ? thoughtText.trim()
            : prose.thought?.trim() ||
              'Photo is not clear enough for a confident diagnosis. Uploading a sharper or closer image of the problem area will help.';

    const jsonBody = {
        // Prose fields (Agent 2b)
        thought: ensuredThought,
        thinking: ensuredThought,
        diagnosis: prose.diagnosis,
        estimated_diagnosis_sentence: prose.estimated_diagnosis_sentence,
        message: prose.message,
        action_required: prose.action_required,
        image_descriptions: prose.image_descriptions ?? [],
        image_thought_breakdown: Array.isArray(prose.image_descriptions)
            ? prose.image_descriptions
                  .filter((x) => typeof x === 'string')
                  .map((x) => String(x).trim())
                  .filter(Boolean)
            : [],
        clarification_questions: Array.isArray(prose.clarification_questions)
            ? prose.clarification_questions.filter(
                  (q) => typeof q === 'string' && q.trim().length > 0,
              )
            : [],
        contractor_checklist: Array.isArray(prose.contractor_checklist)
            ? prose.contractor_checklist.filter(
                  (s) => typeof s === 'string' && s.trim().length > 0,
              )
            : [],
        homeowner_prep:
            typeof prose.homeowner_prep === 'string' ? prose.homeowner_prep : '',
        diy_verification:
            typeof prose.diy_verification === 'string' ? prose.diy_verification : '',
        photo_request:
            typeof prose.photo_request === 'string' ? prose.photo_request : '',
        confidence_drivers: Array.isArray(prose.confidence_drivers)
            ? prose.confidence_drivers.filter(
                  (s) => typeof s === 'string' && s.trim().length > 0,
              )
            : [],
        // Classification fields (Agent 2a — ground truth)
        trade: classification.trade,
        trade_detail: classification.trade_detail,
        confidence: classification.confidence,
        rejected: classification.rejected,
        requires_clarification: classification.requires_clarification,
        unserviced: classification.unserviced,
        refetch_providers: classification.refetch_providers,
        unsupported_reason: classification.unsupported_reason ?? '',
        subcategory_id: classification.subcategory_id,
        failed_component:
            typeof classification.failed_component === 'string'
                ? classification.failed_component
                : '',
        cascading_damage:
            typeof classification.cascading_damage === 'string'
                ? classification.cascading_damage
                : '',
        // Metadata
        prompt_version: DIAGNOSE_PROMPT_VERSION,
        ai_model: GEMINI_MODEL_NAME,
        pipeline: 'v2-classify-prose',
    };

    logIfDiagnosisJsonShapeUnexpected(jsonBody);

    let finalJson = jsonBody as typeof jsonBody & Record<string, unknown>;
    const isLikelyClassificationFallback =
        !classification.requestFailed &&
        classification.trade.trim().toLowerCase() === 'n/a' &&
        Number(classification.confidence ?? 0) === 0 &&
        !classification.unserviced &&
        !classification.rejected &&
        !String(classification.unsupported_reason ?? '').trim();
    if (classification.rejected && !classification.unserviced && !diagnosisRejected) {
        const msg = buildUnrelatedImageMessage();
        finalJson = {
            ...finalJson,
            diagnosis: 'Photo Not Related to Home Maintenance',
            estimated_diagnosis_sentence: 'Photo Not Related to Home Maintenance',
            trade: 'N/A',
            trade_detail: '',
            subcategory_id: TAXONOMY_NONE_ID,
            message: msg,
            action_required: msg,
            requires_clarification: true,
        };
    } else if (
        classification.unserviced ||
        (classification.trade.toLowerCase() === 'n/a' && !isLikelyClassificationFallback)
    ) {
        const msg = buildUnsupportedHomeServiceMessage(serviceList);
        finalJson = {
            ...finalJson,
            diagnosis: 'Service Not Currently Supported',
            estimated_diagnosis_sentence: 'Service Not Currently Supported',
            trade: 'N/A',
            trade_detail: '',
            subcategory_id: TAXONOMY_NONE_ID,
            message: msg,
            action_required: msg,
            requires_clarification: true,
        };
    }

    if (diagnosisRejected) {
        const clean = (v: unknown) =>
            typeof v === 'string' ? v.trim().toLowerCase() : '';
        const prevDiag = clean(
            (previousDiagnosis as { diagnosis?: unknown } | null)?.diagnosis,
        );
        const prevTrade = clean(
            (previousDiagnosis as { trade?: unknown } | null)?.trade,
        );
        const nextDiag = clean(finalJson.diagnosis);
        const nextTrade = clean(finalJson.trade);
        const repeatedDiagnosis =
            Boolean(prevDiag) &&
            Boolean(prevTrade) &&
            prevDiag === nextDiag &&
            prevTrade === nextTrade;
        const chips = Array.isArray(finalJson.clarification_questions)
            ? finalJson.clarification_questions
                  .map((q) => (typeof q === 'string' ? q.trim() : ''))
                  .filter((q) => q.length > 0)
                  .slice(0, 3)
            : [];
        const fallbackQuestion =
            'Which part is actually giving trouble — opening, closing, remote response, or something else?';
        const targetedQuestion =
            chips.length >= 2
                ? `What best matches the issue: ${chips.join(', ')}?`
                : chips.length === 1
                  ? `Does this best describe the issue: ${chips[0]}?`
                  : fallbackQuestion;
        const forcedMessage = `Sorry for getting that wrong. ${targetedQuestion}`;
        const fallbackClarificationQuestions =
            chips.length > 0
                ? chips
                : buildTradeFallbackClarificationChips(classification.trade);
        if (repeatedDiagnosis) {
            finalJson = {
                ...finalJson,
                rejected: false,
                unserviced: false,
                requires_clarification: true,
                confidence: Math.min(
                    75,
                    Number.isFinite(Number(finalJson.confidence))
                        ? Number(finalJson.confidence)
                        : 75,
                ),
                diagnosis: 'Needs Clarification',
                estimated_diagnosis_sentence: 'Needs Clarification',
                clarification_questions: fallbackClarificationQuestions,
                message: forcedMessage,
                action_required: forcedMessage,
            };
        }
    }

    if (
        isLikelyClassificationFallback &&
        !prose.requestFailed &&
        !String(finalJson.diagnosis ?? '')
            .toLowerCase()
            .includes('service not currently supported')
    ) {
        const inferredTrade =
            inferTradeFromProseFallback(finalJson.diagnosis, serviceList) ||
            inferTradeFromProseFallback(finalJson.message, serviceList) ||
            serviceList.find((s) => s.toLowerCase() === 'general handyman') ||
            'General Handyman';
        const taxFromDiag =
            inferTradeFromSignals(String(finalJson.diagnosis ?? '')) ||
            inferTradeFromSignals(String(finalJson.message ?? ''));
        const inferredConfidence = Math.max(72, Number(finalJson.confidence ?? 0));
        finalJson = {
            ...finalJson,
            trade: inferredTrade,
            trade_detail: taxFromDiag ? taxFromDiag.label : '',
            subcategory_id: taxFromDiag ? taxFromDiag.subcategoryId : TAXONOMY_NONE_ID,
            confidence: inferredConfidence,
            requires_clarification: true,
            unsupported_reason: 'N/A',
        };
    }

    if (!prose.requestFailed) {
        reconcileTradeFromDiagnosisSignals(
            finalJson as Record<string, unknown>,
            {
                trade: classification.trade,
                subcategory_id: classification.subcategory_id,
            },
            serviceList,
        );
    }

    if (classification.requestFailed || prose.requestFailed) {
        finalJson = {
            ...finalJson,
            requires_clarification: true,
            rejected: Boolean(finalJson.rejected),
            unserviced: Boolean(finalJson.unserviced),
            confidence: Math.min(
                65,
                Number.isFinite(Number(finalJson.confidence))
                    ? Number(finalJson.confidence)
                    : 65,
            ),
            unsupported_reason: '',
        };
        const explain =
            'We could not finish the automated analysis for these photos right now. ';
        if (
            typeof finalJson.message === 'string' &&
            !finalJson.message.toLowerCase().includes('could not finish')
        ) {
            finalJson.message = `${explain}${finalJson.message}`;
        }
    }

    if (
        finalJson.requires_clarification &&
        (!Array.isArray(finalJson.clarification_questions) ||
            finalJson.clarification_questions.length === 0)
    ) {
        finalJson = {
            ...finalJson,
            clarification_questions: buildTradeFallbackClarificationChips(
                classification.trade,
            ),
        };
    }

    // Phase 4 structural confidence
    const structuralImageCount =
        imageCountAfterTier ?? (hasImage ? 1 + attachmentCount : attachmentCount);
    const historyTextForStructural = Array.isArray(history)
        ? (history as HistoryLike[])
              .map((h) => (typeof h?.content === 'string' ? (h.content as string) : ''))
              .join(' ')
        : '';
    const descriptionTextForStructural = [
        typeof initialImageDescription === 'string' ? initialImageDescription : '',
        typeof textQuery === 'string' ? textQuery : '',
        historyTextForStructural,
    ]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' ');
    const structuralClassificationView = {
        ...classification,
        trade: String(finalJson.trade ?? classification.trade),
        subcategory_id: String(
            finalJson.subcategory_id ?? classification.subcategory_id,
        ),
        rejected: Boolean(finalJson.rejected),
        unserviced: Boolean(finalJson.unserviced),
        requires_clarification: Boolean(finalJson.requires_clarification),
        failed_component:
            typeof finalJson.failed_component === 'string'
                ? (finalJson.failed_component as string)
                : classification.failed_component,
    };
    const structural = computeStructuralConfidence({
        classification: structuralClassificationView,
        imageCount: structuralImageCount,
        descriptionText: descriptionTextForStructural,
        failedComponent: structuralClassificationView.failed_component,
    });
    finalJson = {
        ...finalJson,
        structural_confidence: {
            score: structural.score,
            signals: structural.signals,
        },
    };

    return `<thought>${ensuredThought}</thought>\n<json>${JSON.stringify(finalJson)}</json>`;
}
