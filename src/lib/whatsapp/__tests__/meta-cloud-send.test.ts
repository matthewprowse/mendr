import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { metaCloudChannel, channelConfigured, WHATSAPP_TEXT_LIMIT } from '../channel/meta-cloud';

const fetchMock = vi.fn();

const ENV = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_GRAPH_BASE_URL',
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    for (const k of ENV) saved[k] = process.env[k];
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok-123';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-1';
    process.env.WHATSAPP_GRAPH_BASE_URL = 'https://graph.test/v23.0';
});

afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as unknown as Response;
}

function lastBody(): Record<string, unknown> {
    const init = fetchMock.mock.calls.at(-1)![1] as RequestInit;
    return JSON.parse(init.body as string);
}

function lastInit(): RequestInit {
    return fetchMock.mock.calls.at(-1)![1] as RequestInit;
}

describe('channelConfigured', () => {
    it('is true when token and phone id are set', () => {
        expect(channelConfigured()).toBe(true);
    });
    it('is false when the token is missing', () => {
        delete process.env.WHATSAPP_ACCESS_TOKEN;
        expect(channelConfigured()).toBe(false);
    });
});

describe('sendText', () => {
    it('posts a text message with the bearer token and returns the messageId', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ messages: [{ id: 'wamid.out' }] }));
        const res = await metaCloudChannel.sendText('27821234567', 'hi there');
        expect(res.ok).toBe(true);
        expect(res.messageId).toBe('wamid.out');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://graph.test/v23.0/phone-1/messages');
        expect((init as RequestInit).headers).toMatchObject({
            Authorization: 'Bearer tok-123',
        });
        expect(lastBody()).toMatchObject({ type: 'text', to: '27821234567' });
    });

    it('truncates text beyond the WhatsApp hard limit', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ messages: [{ id: 'x' }] }));
        await metaCloudChannel.sendText('27821234567', 'a'.repeat(WHATSAPP_TEXT_LIMIT + 500));
        const body = lastBody().text as { body: string };
        expect(body.body.length).toBe(WHATSAPP_TEXT_LIMIT);
    });

    it('marks a 429 response as retryable', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'rate limited' } }, false, 429));
        const res = await metaCloudChannel.sendText('27821234567', 'hi');
        expect(res).toMatchObject({ ok: false, httpStatus: 429, retryable: true });
    });

    it('marks a 5xx response as retryable', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, false, 503));
        const res = await metaCloudChannel.sendText('27821234567', 'hi');
        expect(res).toMatchObject({ ok: false, httpStatus: 503, retryable: true });
    });

    it('marks a 4xx (non-429) response as non-retryable', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'bad' } }, false, 400));
        const res = await metaCloudChannel.sendText('27821234567', 'hi');
        expect(res).toMatchObject({ ok: false, httpStatus: 400, retryable: false });
    });

    it('returns a retryable error on a network failure', async () => {
        fetchMock.mockRejectedValue(new Error('socket hang up'));
        const res = await metaCloudChannel.sendText('27821234567', 'hi');
        expect(res).toMatchObject({ ok: false, retryable: true, error: 'socket hang up' });
    });

    it('returns not-configured (non-retryable) when env is missing', async () => {
        delete process.env.WHATSAPP_ACCESS_TOKEN;
        const res = await metaCloudChannel.sendText('27821234567', 'hi');
        expect(res).toMatchObject({ ok: false, retryable: false });
        expect(res.error).toMatch(/not configured/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('sendInteractive', () => {
    it('falls back to a text send when there are no options', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ messages: [{ id: 'x' }] }));
        await metaCloudChannel.sendInteractive('27821234567', 'body', []);
        expect(lastBody().type).toBe('text');
    });

    it('sends a button payload for <= 3 options, capping titles at 20 chars', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ messages: [{ id: 'x' }] }));
        await metaCloudChannel.sendInteractive('27821234567', 'Pick one', [
            { id: '1', title: 'A very very long option title indeed' },
            { id: '2', title: 'Short' },
        ]);
        const body = lastBody();
        expect(body.type).toBe('interactive');
        const interactive = body.interactive as {
            type: string;
            action: { buttons: Array<{ reply: { title: string } }> };
        };
        expect(interactive.type).toBe('button');
        expect(interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
    });

    it('sends a list payload for > 3 options with a button label', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ messages: [{ id: 'x' }] }));
        const options = Array.from({ length: 5 }, (_, i) => ({
            id: String(i + 1),
            title: `Option ${i + 1}`,
        }));
        await metaCloudChannel.sendInteractive('27821234567', 'Pick', options, 'See all');
        const interactive = lastBody().interactive as {
            type: string;
            action: { button: string; sections: Array<{ rows: unknown[] }> };
        };
        expect(interactive.type).toBe('list');
        expect(interactive.action.button).toBe('See all');
        expect(interactive.action.sections[0].rows).toHaveLength(5);
    });
});

describe('sendTemplate', () => {
    it('builds a template body with named params', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ messages: [{ id: 'x' }] }));
        await metaCloudChannel.sendTemplate('27821234567', {
            name: 'lead_alert_contractor',
            language: 'en',
            bodyParams: ['Plumbing', 'Claremont', 'https://x/leads'],
        });
        const tmpl = lastBody().template as {
            name: string;
            language: { code: string };
            components: Array<{ type: string; parameters: Array<{ text: string }> }>;
        };
        expect(tmpl.name).toBe('lead_alert_contractor');
        expect(tmpl.language.code).toBe('en');
        expect(tmpl.components[0].parameters.map((p) => p.text)).toEqual([
            'Plumbing',
            'Claremont',
            'https://x/leads',
        ]);
    });

    it('omits components when there are no body params', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ messages: [{ id: 'x' }] }));
        await metaCloudChannel.sendTemplate('27821234567', {
            name: 'no_params',
            language: 'en',
            bodyParams: [],
        });
        const tmpl = lastBody().template as { components: unknown[] };
        expect(tmpl.components).toEqual([]);
    });
});

describe('fetchMedia', () => {
    it('resolves the media id then downloads the bytes with the bearer token', async () => {
        fetchMock
            .mockResolvedValueOnce(
                jsonResponse({ url: 'https://cdn.test/media.jpg', mime_type: 'image/jpeg' }),
            )
            .mockResolvedValueOnce({
                ok: true,
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
            } as unknown as Response);
        const res = await metaCloudChannel.fetchMedia('media-1');
        expect(res).not.toBeNull();
        expect(res!.mimeType).toBe('image/jpeg');
        expect(Array.from(res!.bytes)).toEqual([1, 2, 3]);
        // Both calls carry the auth header.
        expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
            Authorization: 'Bearer tok-123',
        });
        expect((lastInit().headers as Record<string, string>).Authorization).toBe(
            'Bearer tok-123',
        );
    });

    it('returns null when the media meta fetch fails', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockResolvedValue(jsonResponse({}, false, 404));
        expect(await metaCloudChannel.fetchMedia('media-1')).toBeNull();
        errSpy.mockRestore();
    });

    it('returns null when the meta response has no url', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ mime_type: 'image/jpeg' }));
        expect(await metaCloudChannel.fetchMedia('media-1')).toBeNull();
    });

    it('returns null when the binary download fails', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ url: 'https://cdn.test/m.jpg' }))
            .mockResolvedValueOnce(jsonResponse({}, false, 500));
        expect(await metaCloudChannel.fetchMedia('media-1')).toBeNull();
        errSpy.mockRestore();
    });

    it('returns null and does not fetch when no access token is configured', async () => {
        delete process.env.WHATSAPP_ACCESS_TOKEN;
        expect(await metaCloudChannel.fetchMedia('media-1')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
