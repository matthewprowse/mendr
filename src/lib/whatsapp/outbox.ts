/* eslint-disable no-console */
/**
 * Outbound send layer (Phase C, Workstream 2).
 *
 * Wraps the channel adapter with:
 *   - retry with backoff on retryable failures (429 / 5xx / network)
 *   - opt-out suppression for PROACTIVE sends (templates, nudges). Replies to
 *     a user-initiated message are always allowed per WhatsApp policy.
 *   - dead-letter persistence to `whatsapp_outbox_failures` when retries are
 *     exhausted, so a failed template send (= a lost lead or follow-up) is
 *     visible and re-sendable rather than silently dropped.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { metaCloudChannel } from './channel/meta-cloud';
import type {
    InteractiveOption,
    SendResult,
    TemplateParams,
    WhatsappChannel,
} from './channel/types';
import { isOptedOut } from './opt-out';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 750, 2500];

export type OutboundKind = 'reply' | 'proactive';

export interface OutboxSend {
    to: string;
    kind: OutboundKind;
    text?: string;
    interactive?: { body: string; options: InteractiveOption[]; listButtonLabel?: string };
    template?: TemplateParams;
}

/** Injectable for tests. */
export function getChannel(): WhatsappChannel {
    return metaCloudChannel;
}

/**
 * Send one outbound message with retry + suppression + dead-letter.
 * Returns the final SendResult; never throws.
 */
export async function sendOutbound(
    send: OutboxSend,
    channel: WhatsappChannel = getChannel(),
): Promise<SendResult> {
    if (send.kind === 'proactive' && (await isOptedOut(send.to))) {
        return { ok: false, error: 'recipient opted out', retryable: false };
    }

    let last: SendResult = { ok: false, error: 'not attempted', retryable: false };
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (BACKOFF_MS[attempt]) {
            await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
        }
        last = await dispatch(send, channel);
        if (last.ok || !last.retryable) break;
    }

    if (!last.ok) {
        await deadLetter(send, last);
    }
    return last;
}

async function dispatch(send: OutboxSend, channel: WhatsappChannel): Promise<SendResult> {
    if (send.template) return channel.sendTemplate(send.to, send.template);
    if (send.interactive && send.interactive.options.length > 0) {
        const res = await channel.sendInteractive(
            send.to,
            send.interactive.body,
            send.interactive.options,
            send.interactive.listButtonLabel,
        );
        // Interactive can fail for shape reasons (e.g. title too long after an
        // edge case slips the guards) — degrade to plain text rather than lose
        // the turn.
        if (!res.ok && !res.retryable && send.text) {
            return channel.sendText(send.to, send.text);
        }
        return res;
    }
    if (send.text) return channel.sendText(send.to, send.text);
    return { ok: false, error: 'empty send', retryable: false };
}

/** Persist an exhausted send for ops visibility / manual replay. */
async function deadLetter(send: OutboxSend, result: SendResult): Promise<void> {
    try {
        const admin = await createSupabaseAdminClient();
        await admin.from('whatsapp_outbox_failures').insert({
            phone_number: send.to,
            kind: send.kind,
            payload: {
                text: send.text ?? null,
                template: send.template ?? null,
                interactive: send.interactive
                    ? { body: send.interactive.body, options: send.interactive.options }
                    : null,
            },
            error: result.error ?? 'unknown',
            http_status: result.httpStatus ?? null,
        });
        console.error('[whatsapp/outbox] dead-lettered send', {
            to: send.to,
            kind: send.kind,
            template: send.template?.name,
            error: result.error,
        });
    } catch (e) {
        console.error('[whatsapp/outbox] dead-letter write failed', e);
    }
}
