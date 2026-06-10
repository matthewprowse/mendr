/* eslint-disable no-console */
/**
 * WhatsApp Cloud API webhook (Phase C, Workstream 1).
 *
 * GET  — Meta subscription handshake (hub.challenge echo).
 * POST — signature verify → parse → per-message dedupe → ACK 200 fast, then
 *        process each inbound event AFTER the response via `after()` so Meta
 *        never times out waiting on a Gemini call. Replies are sent through
 *        the outbox (retry + dead-letter), not the HTTP response.
 *
 * Required env: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 *               WHATSAPP_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { metaCloudChannel, channelConfigured } from '@/lib/whatsapp/channel/meta-cloud';
import type { InboundEvent, StatusEvent } from '@/lib/whatsapp/channel/types';
import { claimMessage } from '@/lib/whatsapp/dedupe';
import { sendOutbound } from '@/lib/whatsapp/outbox';
import { handleMessage } from '@/lib/whatsapp/bot-handler';
import type { InboundMessage, OutboundMessage } from '@/lib/whatsapp/types';
import { transcribeVoiceNote } from '@/lib/whatsapp/voice';
import { recordOptOut, clearOptOut } from '@/lib/whatsapp/opt-out';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export const maxDuration = 60;

const MAX_IMAGES_PER_TURN = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// ── GET: subscription handshake ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams;
    const mode = params.get('hub.mode');
    const token = params.get('hub.verify_token');
    const challenge = params.get('hub.challenge');
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && expected && token === expected && challenge) {
        return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
}

// ── POST: inbound events ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'whatsappWebhook');
    if (limited) return limited;

    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    if (!metaCloudChannel.verifySignature(rawBody, signature)) {
        console.error('[whatsapp/webhook] signature verification failed');
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
    }

    const { events, statuses } = metaCloudChannel.parseInbound(payload);

    // Claim ids BEFORE acking so a Meta retry of this exact delivery is a no-op.
    const fresh: InboundEvent[] = [];
    for (const event of events) {
        if (await claimMessage(event.messageId)) fresh.push(event);
    }

    // Process after the 200 goes out — Meta retries on slow responses, and a
    // diagnosis turn can take many seconds.
    if (fresh.length > 0 || statuses.length > 0) {
        after(async () => {
            for (const status of statuses) handleStatus(status);
            for (const event of fresh) {
                try {
                    await processEvent(event);
                } catch (e) {
                    console.error('[whatsapp/webhook] processEvent crashed', {
                        messageId: event.messageId,
                        error: e,
                    });
                    // THE ONE RULE, channel edition: never leave the user hanging.
                    await sendOutbound({
                        to: event.from,
                        kind: 'reply',
                        text: 'Something went wrong on my side. Please send that again in a moment.',
                    });
                }
            }
        });
    }

    return NextResponse.json({ received: true }, { status: 200 });
}

// ── Event processing ─────────────────────────────────────────────────────────

async function processEvent(event: InboundEvent): Promise<void> {
    if (!channelConfigured()) {
        console.error('[whatsapp/webhook] channel not configured — dropping event');
        return;
    }

    const trimmed = (event.text ?? '').trim();

    // Opt-out bookkeeping happens before the bot runs: "stop" must persist
    // even if the bot reply fails, and "start" must lift suppression.
    const lowered = trimmed.toLowerCase();
    if (lowered === 'stop' || lowered === 'quit' || lowered === 'end' || lowered === 'exit') {
        await recordOptOut(event.from);
    } else if (lowered === 'start') {
        await clearOptOut(event.from);
        await sendOutbound({
            to: event.from,
            kind: 'reply',
            text: 'Welcome back. You will receive updates from Mendr again. Send a photo or describe a problem any time.',
        });
        return;
    }

    // Resolve media → images (data URIs) and voice → text.
    const images: string[] = [];
    let voiceText: string | null = null;
    for (const media of event.media) {
        if (media.kind === 'image' && images.length < MAX_IMAGES_PER_TURN) {
            const fetched = await metaCloudChannel.fetchMedia(media.mediaId);
            if (!fetched || fetched.bytes.byteLength > MAX_IMAGE_BYTES) continue;
            const mime = fetched.mimeType.startsWith('image/')
                ? fetched.mimeType
                : 'image/jpeg';
            images.push(
                `data:${mime};base64,${Buffer.from(fetched.bytes).toString('base64')}`,
            );
        } else if (media.kind === 'audio' && !voiceText) {
            const fetched = await metaCloudChannel.fetchMedia(media.mediaId);
            if (!fetched) continue;
            voiceText = await transcribeVoiceNote(fetched.bytes, fetched.mimeType);
            if (!voiceText) {
                await sendOutbound({
                    to: event.from,
                    kind: 'reply',
                    text: 'I could not make out that voice note. Could you try again, or type it instead?',
                });
                return;
            }
        } else if (media.kind === 'document' || media.kind === 'video') {
            await sendOutbound({
                to: event.from,
                kind: 'reply',
                text: 'I can work with photos and voice notes. Could you send a photo of the problem?',
            });
            return;
        }
    }

    const inbound: InboundMessage = {
        from: event.from,
        text: voiceText ? [voiceText, trimmed].filter(Boolean).join('\n') : trimmed,
        imageDataUri: images,
    };

    const result = await handleMessage(inbound, { requestOrigin: null });

    // Voice confirmation precedes the bot's answer so the user can correct us.
    if (voiceText) {
        await sendOutbound({
            to: event.from,
            kind: 'reply',
            text: `Here is what I heard: "${voiceText.slice(0, 300)}"`,
        });
    }

    for (const message of result.messages) {
        await sendReply(event.from, message);
    }
}

/** Send one bot message, using interactive shapes when options are attached. */
async function sendReply(to: string, message: OutboundMessage): Promise<void> {
    const interactiveEnabled = process.env.WHATSAPP_INTERACTIVE_ENABLED !== 'false';
    if (interactiveEnabled && message.options && message.options.length > 0) {
        await sendOutbound({
            to,
            kind: 'reply',
            text: message.text,
            interactive: {
                // The plain text already contains the numbered list; for the
                // interactive shape use the prompt body without relying on it.
                body: message.interactiveBody ?? message.text,
                options: message.options,
                listButtonLabel: message.listButtonLabel,
            },
        });
        return;
    }
    await sendOutbound({ to, kind: 'reply', text: message.text });
}

/** Log delivery failures; dead-letter style visibility for sent messages. */
function handleStatus(status: StatusEvent): void {
    if (status.status !== 'failed') return;
    console.error('[whatsapp/webhook] outbound message failed', {
        messageId: status.messageId,
        recipient: status.recipient,
        errors: status.errors,
    });
    void (async () => {
        try {
            const admin = await createSupabaseAdminClient();
            await admin.from('whatsapp_outbox_failures').insert({
                phone_number: status.recipient,
                kind: 'status_callback',
                payload: { messageId: status.messageId },
                error: status.errors?.map((e) => `${e.code} ${e.title}`).join('; ') || 'failed',
                http_status: null,
            });
        } catch (e) {
            console.error('[whatsapp/webhook] failed-status persist error', e);
        }
    })();
}
