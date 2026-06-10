import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';
import { NextRequest } from 'next/server';

let admin: MockSupabaseClient;
let server: MockSupabaseClient;
const generateContent = vi.fn();

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => admin),
    createSupabaseServerClient: vi.fn(async () => server),
}));

// Transcription now runs through Gemini (@google/genai) rather than the
// dedicated Cloud Speech client. result.text is a property on the new SDK.
vi.mock('@/lib/ai/ai-client', () => ({
    getGenAiClient: () => ({ models: { generateContent } }),
    GEMINI_MODEL_NAME: 'gemini-2.5-flash',
}));

function postAudio(parts: Record<string, File | string | null>): NextRequest {
    const fd = new FormData();
    for (const [k, v] of Object.entries(parts)) {
        if (v !== null) fd.set(k, v);
    }
    return new NextRequest('http://localhost/api/transcribe', { method: 'POST', body: fd });
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    admin = mockSupabaseClient({
        tables: { transcriptions: { data: null, error: null } },
    });
    server = mockSupabaseClient({ user: null });
    generateContent.mockResolvedValue({ text: 'hello world' });
});

describe('POST /api/transcribe', () => {
    it('returns 400 when audio missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(postAudio({}));
        expect(res.status).toBe(400);
    });

    it('returns 400 when audio empty', async () => {
        const file = new File([], 'voice.webm', { type: 'audio/webm' });
        const { POST } = await import('./route');
        const res = await POST(postAudio({ audio: file }));
        expect(res.status).toBe(400);
    });

    it('returns 413 on oversized audio', async () => {
        const big = new Uint8Array(11 * 1024 * 1024);
        const file = new File([big], 'voice.webm', { type: 'audio/webm' });
        const { POST } = await import('./route');
        const res = await POST(postAudio({ audio: file }));
        expect(res.status).toBe(413);
    });

    it('returns 503 when GEMINI_API_KEY is unset', async () => {
        delete process.env.GEMINI_API_KEY;
        const file = new File([Buffer.from('a')], 'voice.webm', { type: 'audio/webm' });
        const { POST } = await import('./route');
        const res = await POST(postAudio({ audio: file }));
        expect(res.status).toBe(503);
    });

    it('returns 422 when transcript empty', async () => {
        generateContent.mockResolvedValueOnce({ text: '' });
        const file = new File([Buffer.from('a')], 'voice.webm', { type: 'audio/webm' });
        const { POST } = await import('./route');
        const res = await POST(postAudio({ audio: file }));
        expect(res.status).toBe(422);
    });

    it('returns transcript on success', async () => {
        const file = new File([Buffer.from('a')], 'voice.webm', { type: 'audio/webm' });
        const { POST } = await import('./route');
        const res = await POST(postAudio({ audio: file }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.transcript).toBe('hello world');
    });

    it('passes the audio to Gemini as inline data', async () => {
        const file = new File([Buffer.from('hi')], 'voice.webm', { type: 'audio/webm;codecs=opus' });
        const { POST } = await import('./route');
        await POST(postAudio({ audio: file }));
        expect(generateContent).toHaveBeenCalledTimes(1);
        const arg = generateContent.mock.calls[0][0] as {
            contents: Array<{ parts: Array<{ inlineData?: { mimeType: string } }> }>;
        };
        const inline = arg.contents[0].parts.find((p) => p.inlineData);
        // codec params stripped → clean container type
        expect(inline?.inlineData?.mimeType).toBe('audio/webm');
    });

    it('returns 500 on Gemini error', async () => {
        generateContent.mockRejectedValueOnce(new Error('boom'));
        const file = new File([Buffer.from('a')], 'voice.webm', { type: 'audio/webm' });
        const { POST } = await import('./route');
        const res = await POST(postAudio({ audio: file }));
        expect(res.status).toBe(500);
    });
});
