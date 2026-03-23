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

export function setLastConversationIdForWhatsApp(conversationId: string) {
    if (typeof window === 'undefined' || !conversationId?.trim()) return;
    try {
        sessionStorage.setItem(LAST_CONV_KEY, conversationId.trim());
    } catch {
        // ignore
    }
}
