import type { DiagnosisData } from '@/features/diagnosis/types';

function normalizeJsonText(s: string): string {
    return s
        .replace(/\u201c/g, '"')
        .replace(/\u201d/g, '"')
        .replace(/\u2018/g, "'")
        .replace(/\u2019/g, "'");
}

function stripMarkdownFence(s: string): string {
    return s
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
}

/**
 * Last-resort JSON extraction used when all structured parse strategies have failed.
 * Tries three candidate forms (XML-tagged, fenced, and raw) and also handles a bare
 * <message> tag so the client always gets at least a readable message.
 * Private to this module — callers should use parseDiagnosisFromModelResponse.
 */
function tryParseDiagnosisJsonFallback(raw: string): Record<string, unknown> | null {
    if (!raw?.trim()) return null;
    const stripMarkdown = (s: string) =>
        s
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();

    const candidates = [
        raw.match(/<json>([\s\S]*?)(?:<\/json>|$)/i)?.[1],
        raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
        raw.trim(),
    ]
        .filter(Boolean)
        .map((s) => stripMarkdown(s!));

    for (const candidate of candidates) {
        let toParse = candidate;
        if (!toParse.endsWith('}')) {
            const lastBrace = toParse.lastIndexOf('}');
            if (lastBrace !== -1) toParse = toParse.substring(0, lastBrace + 1);
        }
        toParse = toParse.replace(/,(\s*[}\]])/g, '$1');
        try {
            return JSON.parse(toParse) as Record<string, unknown>;
        } catch {
            continue;
        }
    }

    const msgTag = raw.match(/<message>([\s\S]*?)<\/message>/i);
    if (msgTag?.[1]?.trim()) {
        return {
            message: msgTag[1].trim(),
            diagnosis: '',
            trade: 'N/A',
            action_required: 'N/A',
        };
    }
    return null;
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

    return tryParseDiagnosisJsonFallback(trimmed);
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

    const trade_detailRaw =
        typeof parsed.trade_detail === 'string'
            ? parsed.trade_detail
            : typeof parsed.tradeDetail === 'string'
              ? parsed.tradeDetail
              : '';

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
        trade_detail: trade_detailRaw.trim().length > 0 ? trade_detailRaw : trade,
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
