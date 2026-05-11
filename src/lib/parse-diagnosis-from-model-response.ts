import type { DiagnosisData } from '@/app/chat/components/types';
import { tryParseDiagnosisJson } from '@/lib/utils';

function normalizeJsonText(s: string): string {
    return s
        .replace(/\u201c/g, '"')
        .replace(/\u201d/g, '"')
        .replace(/\u2018/g, "'")
        .replace(/\u2019/g, "'");
}

/** Cost fields must survive models returning numbers or rare non-strings without breaking the client. */
function coerceCostString(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) {
        return `Around R${Math.round(v).toLocaleString('en-ZA')}`;
    }
    if (typeof v === 'boolean') return '';
    if (typeof v === 'object') return '';
    return String(v).trim();
}

function stripMarkdownFence(s: string): string {
    return s
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
}

/**
 * Extract the first JSON object from model output using several resilient strategies.
 */
function extractParsedRecord(raw: string): Record<string, unknown> | null {
    const trimmed = raw.trim();
    const candidates: string[] = [];

    const tagged = trimmed.match(/<json>([\s\S]*?)(?:<\/json>|$)/i)?.[1];
    if (tagged?.trim()) candidates.push(tagged.trim());

    const braceFull = trimmed.match(/\{[\s\S]*\}/);
    if (braceFull?.[0]) candidates.push(braceFull[0]);

    if (trimmed.startsWith('{')) candidates.push(trimmed);

    for (let candidate of candidates) {
        candidate = stripMarkdownFence(normalizeJsonText(candidate));
        if (!candidate.endsWith('}')) {
            const last = candidate.lastIndexOf('}');
            if (last !== -1) candidate = candidate.slice(0, last + 1);
        }
        candidate = candidate.replace(/,(\s*[}\]])/g, '$1');
        try {
            const parsed = JSON.parse(candidate) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            continue;
        }
    }

    return tryParseDiagnosisJson(trimmed);
}

function buildDiagnosisData(parsed: Record<string, unknown>): DiagnosisData | null {
    if (parsed.diagnosis === undefined || parsed.diagnosis === null) return null;

    const diagnosis =
        typeof parsed.diagnosis === 'string' ? parsed.diagnosis.trim() : String(parsed.diagnosis ?? '');
    if (!diagnosis) return null;
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

    const estimated_cost = coerceCostString(parsed.estimated_cost) || coerceCostString(parsed.estimatedCost);

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

    // `thought` is the structured-output field name from Agent 2b.
    // `thinking` is the legacy field name. Accept either, prefer `thought`.
    const thoughtRaw =
        typeof parsed.thought === 'string'
            ? parsed.thought
            : typeof parsed.thinking === 'string'
              ? parsed.thinking
              : '';

    return {
        ...(parsed as unknown as DiagnosisData),
        thinking: thoughtRaw,
        diagnosis,
        trade,
        action_required,
        message: message || undefined,
        estimated_cost: estimated_cost || '',
        repair_cost_range: undefined,
        replacement_cost_range: undefined,
        equipment_parts_range: undefined,
        trade_detail: trade_detailRaw.trim().length > 0 ? trade_detailRaw : trade,
        urgency_key:
            urgency_key === 'immediate' ||
            urgency_key === 'urgent' ||
            urgency_key === 'soon' ||
            urgency_key === 'planned'
                ? urgency_key
                : 'soon',
    };
}

/**
 * Normalises the model's <json> block into {@link DiagnosisData}.
 * Used by scan-flow diagnosis and legacy diagnosis routes.
 */
export function parseDiagnosisFromModelResponse(text: string): DiagnosisData | null {
    const parsed = extractParsedRecord(text);
    if (!parsed) return null;
    return buildDiagnosisData(parsed);
}
