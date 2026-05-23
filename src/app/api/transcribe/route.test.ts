import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';
import { NextRequest } from 'next/server';

let admin: MockSupabaseClient;
let server: MockSupabaseClient;
const recognizeSpy = vi.fn();

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => admin),
    createSupabaseServerClient: vi.fn(async () => server),
}));

vi.mock('@google-cloud/speech', () => {
    return {
        SpeechClient: vi.fn().mockImplementation(() => ({
            recognize: (...args: unknown[]) => recognizeSpy(...args),
        })),
        protos: {
            google: {
                cloud: {
                    speech: {
                        v1: {
                            RecognitionConfig: {
                                AudioEncoding: {
                                    WEBM_OPUS: 6,
                                    OGG_OPUS: 5,
                                },
                            },
                        },
                    },
                },
            },
        },
    };
});

vi.mock('node:fs', () => ({
    default: {
        statSync: vi.fn(() => ({ isFile: () => true })),
    },
    statSync: vi.fn(() => ({ isFile: () => true })),
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
    process.env.GOOGLE_SPEECH_CREDENTIALS_JSON = JSON.stringify({ type: 'service_account', project_id: 'x' });
    admin = mockSupabaseClient({
        tables: { transcriptions: { data: null, error: null } },
    });
    server = mockSupabaseClient({ user: null });
    recognizeSpy.mockResolvedValue([
        {
            results: [{ alternatives: [{ transcript: 'hello world' }] }],
        },
    ]);
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

    it('returns 422 when transcript empty', async () => {
        recognizeSpy.mockResolvedValueOnce([{ results: [] }]);
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

    it('returns 500 on Speech-to-Text error', async () => {
        recognizeSpy.mockRejectedValueOnce(new Error('boom'));
        const file = new File([Buffer.from('a')], 'voice.webm', { type: 'audio/webm' });
        const { POST } = await import('./route');
        const res = await POST(postAudio({ audio: file }));
        expect(res.status).toBe(500);
    });
});
