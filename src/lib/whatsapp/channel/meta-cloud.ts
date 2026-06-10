/* eslint-disable no-console */
/**
 * Meta WhatsApp Cloud API channel adapter (Phase C).
 *
 * Also works against 360dialog, which exposes the same payload/send shapes —
 * point `WHATSAPP_GRAPH_BASE_URL` at their gateway and supply their API key.
 *
 * Env:
 *   WHATSAPP_ACCESS_TOKEN          — Cloud API bearer token (or BSP key)
 *   WHATSAPP_PHONE_NUMBER_ID       — sender phone number id
 *   WHATSAPP_APP_SECRET            — for X-Hub-Signature-256 verification
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN  — GET subscription handshake token
 *   WHATSAPP_GRAPH_BASE_URL        — default https://graph.facebook.com/v23.0
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type {
    InboundEvent,
    InboundMediaRef,
    InteractiveOption,
    ParsedWebhook,
    SendResult,
    StatusEvent,
    TemplateParams,
    WhatsappChannel,
} from './types';

const DEFAULT_BASE = 'https://graph.facebook.com/v23.0';

/** WhatsApp hard limit per text message. */
export const WHATSAPP_TEXT_LIMIT = 4096;

function baseUrl(): string {
    return (process.env.WHATSAPP_GRAPH_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, '');
}

function accessToken(): string | null {
    return process.env.WHATSAPP_ACCESS_TOKEN ?? null;
}

function phoneNumberId(): string | null {
    return process.env.WHATSAPP_PHONE_NUMBER_ID ?? null;
}

export function channelConfigured(): boolean {
    return Boolean(accessToken() && phoneNumberId());
}

// ── Inbound payload shapes (the subset we read) ──────────────────────────────

interface MetaMessage {
    id?: unknown;
    from?: unknown;
    timestamp?: unknown;
    type?: unknown;
    text?: { body?: unknown };
    image?: { id?: unknown; mime_type?: unknown };
    audio?: { id?: unknown; mime_type?: unknown };
    voice?: { id?: unknown; mime_type?: unknown };
    document?: { id?: unknown; mime_type?: unknown };
    video?: { id?: unknown; mime_type?: unknown };
    interactive?: {
        type?: unknown;
        button_reply?: { id?: unknown; title?: unknown };
        list_reply?: { id?: unknown; title?: unknown };
    };
    button?: { text?: unknown; payload?: unknown };
}

interface MetaStatus {
    id?: unknown;
    recipient_id?: unknown;
    status?: unknown;
    errors?: Array<{ code?: unknown; title?: unknown }>;
}

function str(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

function mediaRef(
    kind: InboundMediaRef['kind'],
    obj: { id?: unknown; mime_type?: unknown } | undefined,
): InboundMediaRef | null {
    const id = str(obj?.id);
    if (!id) return null;
    return { mediaId: id, mimeType: str(obj?.mime_type) || 'application/octet-stream', kind };
}

function parseMessage(m: MetaMessage): InboundEvent | null {
    const messageId = str(m.id);
    const from = str(m.from);
    if (!messageId || !from) return null;

    const event: InboundEvent = {
        messageId,
        from,
        timestamp: Number(m.timestamp) || Math.floor(Date.now() / 1000),
        media: [],
    };

    switch (str(m.type)) {
        case 'text':
            event.text = str(m.text?.body);
            break;
        case 'image': {
            const ref = mediaRef('image', m.image);
            if (ref) event.media.push(ref);
            break;
        }
        case 'audio':
        case 'voice': {
            const ref = mediaRef('audio', m.audio ?? m.voice);
            if (ref) event.media.push(ref);
            break;
        }
        case 'interactive': {
            const reply =
                m.interactive?.button_reply ?? m.interactive?.list_reply ?? undefined;
            event.interactiveReplyId = str(reply?.id);
            event.interactiveReplyTitle = str(reply?.title);
            // Numeric ids are the option indices the bot presented — feed the
            // index through the text path so layer-1 parsing resolves it
            // exactly. Non-numeric ids (yes/no/more) fall back to the title.
            event.text = /^\d+$/.test(event.interactiveReplyId)
                ? event.interactiveReplyId
                : event.interactiveReplyTitle || event.interactiveReplyId;
            break;
        }
        case 'button':
            // Template quick-reply button.
            event.text = str(m.button?.text) || str(m.button?.payload);
            break;
        case 'document':
        case 'video': {
            const kind = str(m.type) as 'document' | 'video';
            const ref = mediaRef(kind, kind === 'document' ? m.document : m.video);
            if (ref) event.media.push(ref);
            break;
        }
        default:
            // Stickers, locations, contacts, reactions — surface as empty text;
            // the bot replies with its first-contact / reprompt copy.
            break;
    }
    return event;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export const metaCloudChannel: WhatsappChannel = {
    verifySignature(rawBody: string, signatureHeader: string | null): boolean {
        const secret = process.env.WHATSAPP_APP_SECRET;
        // Fail closed in production when a secret is configured; fail open in
        // dev when it is not (local tunnels, simulator-driven testing).
        if (!secret) return process.env.NODE_ENV !== 'production';
        if (!signatureHeader?.startsWith('sha256=')) return false;
        const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
        const provided = signatureHeader.slice('sha256='.length);
        if (provided.length !== expected.length) return false;
        try {
            return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
        } catch {
            return false;
        }
    },

    parseInbound(payload: unknown): ParsedWebhook {
        const events: InboundEvent[] = [];
        const statuses: StatusEvent[] = [];
        const entries =
            payload && typeof payload === 'object'
                ? ((payload as { entry?: unknown }).entry as unknown[] | undefined) ?? []
                : [];
        for (const entry of Array.isArray(entries) ? entries : []) {
            const changes =
                ((entry as { changes?: unknown })?.changes as unknown[] | undefined) ?? [];
            for (const change of Array.isArray(changes) ? changes : []) {
                const value = (change as { value?: unknown })?.value as
                    | { messages?: MetaMessage[]; statuses?: MetaStatus[] }
                    | undefined;
                for (const m of value?.messages ?? []) {
                    const e = parseMessage(m);
                    if (e) events.push(e);
                }
                for (const s of value?.statuses ?? []) {
                    const status = str(s.status) as StatusEvent['status'];
                    if (!str(s.id) || !status) continue;
                    statuses.push({
                        messageId: str(s.id),
                        recipient: str(s.recipient_id),
                        status,
                        errors: (s.errors ?? []).map((e) => ({
                            code: Number(e.code) || 0,
                            title: str(e.title),
                        })),
                    });
                }
            }
        }
        return { events, statuses };
    },

    async sendText(to: string, text: string): Promise<SendResult> {
        const body = text.length > WHATSAPP_TEXT_LIMIT
            ? text.slice(0, WHATSAPP_TEXT_LIMIT - 1) + '…'
            : text;
        return post({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { preview_url: true, body },
        });
    },

    async sendInteractive(
        to: string,
        body: string,
        options: InteractiveOption[],
        listButtonLabel = 'Choose an option',
    ): Promise<SendResult> {
        if (options.length === 0) return this.sendText(to, body);
        if (options.length <= 3) {
            return post({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: body.slice(0, 1024) },
                    action: {
                        buttons: options.map((o) => ({
                            type: 'reply',
                            reply: { id: o.id.slice(0, 256), title: o.title.slice(0, 20) },
                        })),
                    },
                },
            });
        }
        return post({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'list',
                body: { text: body.slice(0, 1024) },
                action: {
                    button: listButtonLabel.slice(0, 20),
                    sections: [
                        {
                            rows: options.slice(0, 10).map((o) => ({
                                id: o.id.slice(0, 200),
                                title: o.title.slice(0, 24),
                                description: o.description?.slice(0, 72),
                            })),
                        },
                    ],
                },
            },
        });
    },

    async sendTemplate(to: string, template: TemplateParams): Promise<SendResult> {
        return post({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'template',
            template: {
                name: template.name,
                language: { code: template.language },
                components: template.bodyParams.length
                    ? [
                          {
                              type: 'body',
                              parameters: template.bodyParams.map((p) => ({
                                  type: 'text',
                                  text: p,
                              })),
                          },
                      ]
                    : [],
            },
        });
    },

    async fetchMedia(
        mediaId: string,
    ): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
        const token = accessToken();
        if (!token) return null;
        try {
            // Step 1: resolve the media id to a short-lived CDN URL.
            const metaRes = await fetch(`${baseUrl()}/${encodeURIComponent(mediaId)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!metaRes.ok) {
                console.error('[whatsapp/meta] media meta fetch failed', metaRes.status);
                return null;
            }
            const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
            if (!meta.url) return null;
            // Step 2: download the bytes (same bearer token required).
            const binRes = await fetch(meta.url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!binRes.ok) {
                console.error('[whatsapp/meta] media download failed', binRes.status);
                return null;
            }
            const buf = new Uint8Array(await binRes.arrayBuffer());
            return { bytes: buf, mimeType: meta.mime_type ?? 'application/octet-stream' };
        } catch (e) {
            console.error('[whatsapp/meta] fetchMedia error', e);
            return null;
        }
    },
};

/** POST to /{phone_number_id}/messages. Never throws. */
async function post(payload: Record<string, unknown>): Promise<SendResult> {
    const token = accessToken();
    const phoneId = phoneNumberId();
    if (!token || !phoneId) {
        return { ok: false, error: 'WhatsApp channel not configured', retryable: false };
    }
    try {
        const res = await fetch(`${baseUrl()}/${phoneId}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({}))) as {
            messages?: Array<{ id?: string }>;
            error?: { message?: string };
        };
        if (!res.ok) {
            return {
                ok: false,
                httpStatus: res.status,
                error: json.error?.message ?? `HTTP ${res.status}`,
                retryable: res.status === 429 || res.status >= 500,
            };
        }
        return { ok: true, httpStatus: res.status, messageId: json.messages?.[0]?.id };
    } catch (e) {
        return {
            ok: false,
            error: e instanceof Error ? e.message : 'network error',
            retryable: true,
        };
    }
}
