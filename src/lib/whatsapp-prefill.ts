/**
 * Client-only: resolve diagnosis + report URL for WhatsApp prefill from the last known scan/report.
 */

const LAST_CONV_KEY = 'scandio_last_conversation_id';
const REPORTS_KEY = 'scandio_my_reports';

type ReportEntry = { conversationId: string; title?: string; date?: string };

export type WhatsAppPrefill = {
    diagnosis: string;
    trade?: string;
    report_url: string;
    profile_url: string;
};

export async function resolveWhatsAppPrefill(profileUrl: string): Promise<WhatsAppPrefill> {
    const profile_url =
        typeof window !== 'undefined' && profileUrl.trim()
            ? profileUrl.trim()
            : typeof window !== 'undefined'
              ? window.location.href
              : '';

    let diagnosis = 'Home repair or maintenance';
    let trade: string | undefined;
    let report_url = '';

    const tryConversation = async (conversationId: string) => {
        const res = await fetch(
            `/api/report-info?conversation_id=${encodeURIComponent(conversationId)}`
        );
        if (!res.ok) return;
        const info = (await res.json()) as {
            diagnosis?: string;
            trade?: string;
            report_url?: string;
        };
        if (typeof info.diagnosis === 'string' && info.diagnosis.trim()) {
            diagnosis = info.diagnosis.trim();
        }
        if (typeof info.trade === 'string' && info.trade.trim()) {
            trade = info.trade.trim();
        }
        if (typeof info.report_url === 'string' && info.report_url.trim()) {
            report_url = info.report_url.trim();
        }
    };

    if (typeof window === 'undefined') {
        return { diagnosis, trade, report_url, profile_url };
    }

    const last = sessionStorage.getItem(LAST_CONV_KEY)?.trim();
    if (last) {
        await tryConversation(last);
    }

    if (!report_url) {
        try {
            const raw = localStorage.getItem(REPORTS_KEY);
            const list: ReportEntry[] = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list) && list[0]?.conversationId) {
                await tryConversation(String(list[0].conversationId));
            }
        } catch {
            // ignore
        }
    }

    return { diagnosis, trade, report_url, profile_url };
}

/**
 * Builds a concise WhatsApp share message for a completed diagnosis report.
 *
 * Format (all parts present):
 *   Mendr diagnosed my home fault: <title>\n\nTrade needed: <trade>. Confidence: <n>%.\n\nFull report: <url>
 *
 * Rules:
 *  - trade line is omitted entirely when trade is null or blank.
 *  - confidence clause is omitted when confidence is null.
 *  - title falls back to "a home issue" when null or blank.
 *  - confidence is rounded to the nearest integer.
 *  - total length is capped at 700 chars (WhatsApp intent pre-fill limit).
 */
export function buildReportShareMessage(params: {
    title: string | null;
    trade: string | null;
    confidence: number | null;
    reportUrl: string;
}): string {
    const MAX_LEN = 699;

    const title =
        params.title && params.title.trim() ? params.title.trim() : 'a home issue';
    const trade =
        params.trade && params.trade.trim() ? params.trade.trim() : null;
    const confidence =
        params.confidence != null ? Math.round(params.confidence) : null;

    const line1 = `Mendr diagnosed my home fault: ${title}`;
    const line3 = `Full report: ${params.reportUrl}`;

    let line2: string | null = null;
    if (trade !== null) {
        line2 =
            confidence !== null
                ? `Trade needed: ${trade}. Confidence: ${confidence}%.`
                : `Trade needed: ${trade}.`;
    }

    const parts = [line1, ...(line2 ? [line2] : []), line3];
    const raw = parts.join('\n\n');

    if (raw.length <= MAX_LEN) return raw;

    // Truncate title to fit within limit, preserving url and trade lines.
    const fixed = [line3, ...(line2 ? [line2] : [])].join('\n\n');
    const prefix = 'Mendr diagnosed my home fault: ';
    const available = MAX_LEN - prefix.length - (line2 ? '\n\n'.length + line2.length + '\n\n'.length : '\n\n'.length) - line3.length;
    const truncatedTitle = available > 3 ? title.slice(0, available - 3) + '...' : title.slice(0, Math.max(0, available));
    void fixed;
    return `${prefix}${truncatedTitle}\n\n${line2 ? line2 + '\n\n' : ''}${line3}`.slice(0, MAX_LEN);
}

export function setLastConversationIdForWhatsApp(conversationId: string) {
    if (typeof window === 'undefined' || !conversationId?.trim()) return;
    try {
        sessionStorage.setItem(LAST_CONV_KEY, conversationId.trim());
    } catch {
        // ignore
    }
}
