import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { metaCloudChannel } from '../channel/meta-cloud';

function sign(body: string, secret: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function inboundPayload(message: Record<string, unknown>) {
    return {
        object: 'whatsapp_business_account',
        entry: [
            {
                id: 'waba-id',
                changes: [
                    {
                        field: 'messages',
                        value: {
                            messaging_product: 'whatsapp',
                            messages: [message],
                        },
                    },
                ],
            },
        ],
    };
}

describe('meta-cloud signature verification', () => {
    it('accepts a valid signature', () => {
        process.env.WHATSAPP_APP_SECRET = 'test-secret';
        const body = '{"hello":"world"}';
        expect(metaCloudChannel.verifySignature(body, sign(body, 'test-secret'))).toBe(true);
    });

    it('rejects a tampered body', () => {
        process.env.WHATSAPP_APP_SECRET = 'test-secret';
        const sig = sign('{"hello":"world"}', 'test-secret');
        expect(metaCloudChannel.verifySignature('{"hello":"tampered"}', sig)).toBe(false);
    });

    it('rejects a missing header when a secret is configured', () => {
        process.env.WHATSAPP_APP_SECRET = 'test-secret';
        expect(metaCloudChannel.verifySignature('{}', null)).toBe(false);
    });
});

describe('meta-cloud inbound parsing', () => {
    it('parses a text message', () => {
        const { events } = metaCloudChannel.parseInbound(
            inboundPayload({
                id: 'wamid.1',
                from: '27821234567',
                timestamp: '1750000000',
                type: 'text',
                text: { body: 'My geyser is leaking' },
            }),
        );
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            messageId: 'wamid.1',
            from: '27821234567',
            text: 'My geyser is leaking',
        });
        expect(events[0].media).toHaveLength(0);
    });

    it('parses an image message into a media ref', () => {
        const { events } = metaCloudChannel.parseInbound(
            inboundPayload({
                id: 'wamid.2',
                from: '27821234567',
                timestamp: '1750000000',
                type: 'image',
                image: { id: 'media-123', mime_type: 'image/jpeg' },
            }),
        );
        expect(events[0].media).toEqual([
            { mediaId: 'media-123', mimeType: 'image/jpeg', kind: 'image' },
        ]);
    });

    it('maps a numeric button reply to its index as text', () => {
        const { events } = metaCloudChannel.parseInbound(
            inboundPayload({
                id: 'wamid.3',
                from: '27821234567',
                type: 'interactive',
                interactive: {
                    type: 'button_reply',
                    button_reply: { id: '2', title: 'Drip from the valve' },
                },
            }),
        );
        expect(events[0].text).toBe('2');
        expect(events[0].interactiveReplyTitle).toBe('Drip from the valve');
    });

    it('maps a non-numeric button reply to its title', () => {
        const { events } = metaCloudChannel.parseInbound(
            inboundPayload({
                id: 'wamid.4',
                from: '27821234567',
                type: 'interactive',
                interactive: { type: 'button_reply', button_reply: { id: 'yes', title: 'Yes' } },
            }),
        );
        expect(events[0].text).toBe('Yes');
    });

    it('parses delivery statuses', () => {
        const { statuses } = metaCloudChannel.parseInbound({
            entry: [
                {
                    changes: [
                        {
                            value: {
                                statuses: [
                                    {
                                        id: 'wamid.5',
                                        recipient_id: '27821234567',
                                        status: 'failed',
                                        errors: [{ code: 131047, title: 'Re-engagement required' }],
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        });
        expect(statuses).toHaveLength(1);
        expect(statuses[0].status).toBe('failed');
        expect(statuses[0].errors?.[0].code).toBe(131047);
    });

    it('never throws on junk payloads', () => {
        expect(metaCloudChannel.parseInbound(null).events).toHaveLength(0);
        expect(metaCloudChannel.parseInbound('garbage').events).toHaveLength(0);
        expect(metaCloudChannel.parseInbound({ entry: [{}] }).events).toHaveLength(0);
    });
});
