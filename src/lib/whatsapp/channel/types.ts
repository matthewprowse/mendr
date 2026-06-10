/**
 * Channel adapter contract (Phase C).
 *
 * A channel turns provider-specific webhook payloads into normalised inbound
 * events and sends outbound messages. The bot-handler never imports a channel;
 * the webhook route composes the two. Implementations: `meta-cloud.ts` (direct
 * Meta Cloud API and 360dialog, which proxies the same payload shape).
 * A Twilio adapter can be added behind this interface without touching the bot.
 */

export interface InboundMediaRef {
    /** Provider media id, fetched via `fetchMedia`. */
    mediaId: string;
    mimeType: string;
    /** 'image' | 'audio' | other provider types we ignore. */
    kind: 'image' | 'audio' | 'document' | 'video' | 'other';
}

/** One normalised inbound user message. */
export interface InboundEvent {
    /** Provider message id — used for idempotent processing (Meta retries). */
    messageId: string;
    /** Sender phone in E.164 digits (no plus), e.g. "27821234567". */
    from: string;
    /** Unix seconds from the provider. */
    timestamp: number;
    text?: string;
    /**
     * Interactive reply id (button/list). When present the user tapped an
     * option; ids are the numeric option indices the bot presented.
     */
    interactiveReplyId?: string;
    interactiveReplyTitle?: string;
    media: InboundMediaRef[];
}

/** Delivery status callback for an outbound message. */
export interface StatusEvent {
    messageId: string;
    recipient: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    /** Provider error details when status === 'failed'. */
    errors?: Array<{ code: number; title: string }>;
}

export interface ParsedWebhook {
    events: InboundEvent[];
    statuses: StatusEvent[];
}

export interface SendResult {
    ok: boolean;
    /** Provider message id when accepted. */
    messageId?: string;
    /** HTTP status for diagnostics. */
    httpStatus?: number;
    error?: string;
    /** True when the failure is worth retrying (429 / 5xx / network). */
    retryable?: boolean;
}

/** An interactive option presented as a button or list row. */
export interface InteractiveOption {
    /** Stable id echoed back in the reply. Use the numeric index as a string. */
    id: string;
    /** Visible label. Buttons cap at 20 chars, list rows at 24. */
    title: string;
    description?: string;
}

export interface TemplateParams {
    /** Approved template name. */
    name: string;
    /** BCP-47 language, e.g. "en". */
    language: string;
    /** Body {{n}} substitutions, in order. */
    bodyParams: string[];
}

export interface WhatsappChannel {
    /** Validate the webhook signature header against the raw body. */
    verifySignature(rawBody: string, signatureHeader: string | null): boolean;
    /** Normalise a provider webhook payload. Never throws on junk. */
    parseInbound(payload: unknown): ParsedWebhook;
    sendText(to: string, text: string): Promise<SendResult>;
    /** Buttons (≤3 options) or list (≤10) with automatic text fallback upstream. */
    sendInteractive(
        to: string,
        body: string,
        options: InteractiveOption[],
        listButtonLabel?: string,
    ): Promise<SendResult>;
    sendTemplate(to: string, template: TemplateParams): Promise<SendResult>;
    /** Resolve a media id to bytes. */
    fetchMedia(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
}
