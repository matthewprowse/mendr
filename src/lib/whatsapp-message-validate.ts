/** Max characters for WhatsApp prefill (server-enforced; prompt asks under 900). */
export const WHATSAPP_MESSAGE_MAX_CHARS = 900;

export type WhatsAppValidationFailure =
    | "empty"
    | "markdown_or_link_syntax"
    | "missing_report_url"
    | "missing_profile_url"
    | "too_long";

/**
 * Deterministic checks on AI-generated WhatsApp text. When invalid, callers should use template fallback.
 */
export function validateWhatsAppAiMessage(input: {
    text: string;
    reportUrl: string;
    profileUrl: string;
}): { ok: true } | { ok: false; reason: WhatsAppValidationFailure } {
    const t = input.text.trim();
    if (!t) return { ok: false, reason: "empty" };

    if (t.length > WHATSAPP_MESSAGE_MAX_CHARS) return { ok: false, reason: "too_long" };

    // Block common markdown / structured syntax that should not appear in WhatsApp SMS-style text.
    if (
        /\*\*|__|```|\[([^\]]+)\]\([^)]+\)/.test(t) ||
        /(^|\n)\s*#{1,6}\s/.test(t) ||
        /(^|\n)\s*[-*+]\s+\S/.test(t)
    ) {
        return { ok: false, reason: "markdown_or_link_syntax" };
    }

    const report = input.reportUrl.trim();
    const profile = input.profileUrl.trim();
    if (report && !t.includes(report)) return { ok: false, reason: "missing_report_url" };
    if (!report && profile && !t.includes(profile))
        return { ok: false, reason: "missing_profile_url" };

    return { ok: true };
}
