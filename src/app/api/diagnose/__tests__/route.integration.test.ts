/**
 * Phase 2 — integration safety net for the /api/diagnose route handler.
 *
 * These tests pin the observable contract of the route end-to-end, with the
 * external dependencies (Gemini, Supabase, rate limiter, service catalog)
 * mocked at the module boundary. They are the proof that the Phase 2 extraction
 * preserved behaviour — the refactor should leave them unchanged.
 *
 * Pipeline invariants (from CLAUDE.md) — these tests confirm:
 *   1. checkRateLimit runs first
 *   2. runClassification runs before runProseGeneration
 *   3. Response envelope shape is `<thought>…</thought>\n<json>{…}</json>`
 *   4. 400s are emitted for invalid request shapes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Module mocks ────────────────────────────────────────────────────────────
// Track call order across the agent pipeline so we can pin invariant #2.
const callOrder: string[] = [];

// Stable mock classification + prose results, returned by the agents.
const mockClassification = {
    trade: 'Plumbing',
    trade_detail: 'Burst Pipe / Major Leak',
    subcategory_id: 'burst_pipe_leak',
    confidence: 92,
    rejected: false,
    requires_clarification: false,
    unserviced: false,
    refetch_providers: false,
    unsupported_reason: '',
    failed_component: 'copper supply line',
    cascading_damage: '',
};

const mockProse = {
    thought:
        'The image shows water surfacing near the boundary wall, consistent with a burst on the mains supply. The pattern of the wet patch and the absence of other plumbing in the area together support this conclusion. No alternative cause is visible in the frame. The fault is on the supply side because the meter continues to register flow with no taps open.',
    diagnosis: 'Burst Pipe On Mains Supply',
    estimated_diagnosis_sentence: 'Burst Pipe On Mains Supply',
    message: 'There is a burst on the mains supply line.',
    action_required: '',
    contractor_checklist: ['Excavate and repair.'],
    homeowner_prep: 'Close the main stop valve.',
    image_descriptions: ['Wet patch at boundary wall.'],
    image_observations: [],
    clarification_questions: [],
    diy_verification: '',
    photo_request: '',
    confidence_drivers: [],
};

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => {
        callOrder.push('checkRateLimit');
        return null;
    }),
    isRateLimitBypassed: vi.fn(() => true),
    killSwitchActive: vi.fn(() => false),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
    }),
    createSupabaseAdminClient: async () => ({
        rpc: async () => ({ data: 1, error: null }),
    }),
}));

vi.mock('@/lib/service-catalog-server', () => ({
    getServiceCatalogLabelsCached: async () => [
        'Plumbing',
        'Electrical',
        'Security',
        'General Handyman',
    ],
}));

vi.mock('@/lib/ai/ai-diagnosis-backend', () => ({
    GEMINI_MODEL_NAME: 'gemini-2.5-flash-test',
    getDiagnosisModel: () => ({
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
    }),
}));

vi.mock('@/lib/ai/ai-logging', () => ({
    logAiEvent: vi.fn(),
    logPipelineStep: vi.fn(),
}));

vi.mock('@/features/diagnosis/agent-classify', async () => {
    const actual = await vi.importActual<typeof import('@/features/diagnosis/agent-classify')>(
        '@/features/diagnosis/agent-classify',
    );
    return {
        ...actual,
        runClassification: vi.fn(async () => {
            callOrder.push('runClassification');
            return { ...mockClassification };
        }),
    };
});

vi.mock('@/features/diagnosis/agent-prose', async () => {
    const actual = await vi.importActual<typeof import('@/features/diagnosis/agent-prose')>(
        '@/features/diagnosis/agent-prose',
    );
    return {
        ...actual,
        runProseGeneration: vi.fn(async () => {
            callOrder.push('runProseGeneration');
            return { ...mockProse };
        }),
    };
});

vi.mock('@/lib/diagnosis/structural-confidence', async () => {
    const actual = await vi.importActual<
        typeof import('@/lib/diagnosis/structural-confidence')
    >('@/lib/diagnosis/structural-confidence');
    return {
        ...actual,
        computeStructuralConfidence: vi.fn(() => ({
            score: 80,
            signals: {
                hasImage: true,
                imageCount: 1,
                descriptionWordCount: 10,
                subcategoryMatched: true,
                failedComponentNamed: true,
                isCatchAllWithNoVisual: false,
                isRejectedOrUnserviced: false,
            },
        })),
    };
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost:3000/api/diagnose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function parseJson(out: string): Record<string, unknown> {
    const match = out.match(/<json>([\s\S]+)<\/json>/);
    if (!match) throw new Error(`no <json> block in: ${out.slice(0, 200)}`);
    return JSON.parse(match[1]) as Record<string, unknown>;
}

beforeEach(() => {
    callOrder.length = 0;
    vi.clearAllMocks();
    // Restore the spies set on the module mocks above.
    process.env.DISABLE_DIAGNOSIS_DAILY_QUOTA = 'true';
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('/api/diagnose — 400 validation gates', () => {
    it('returns 400 when no image, text, or attachments are supplied', async () => {
        const { POST } = await import('../route');
        const res = await POST(makeRequest({}));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/provide an image or describe/i);
    });

    it('returns 400 when history exceeds 20 turns', async () => {
        const { POST } = await import('../route');
        const res = await POST(
            makeRequest({
                textQuery: 'help',
                history: Array(21).fill({ role: 'user', content: 'x' }),
            }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when textQuery exceeds 2000 chars', async () => {
        const { POST } = await import('../route');
        const res = await POST(makeRequest({ textQuery: 'a'.repeat(2001) }));
        expect(res.status).toBe(400);
    });

    it('returns 400 for an http image URL outside the allow-list', async () => {
        const { POST } = await import('../route');
        const res = await POST(
            makeRequest({
                image: 'https://evil.example.com/foo.jpg',
                textQuery: 'help',
            }),
        );
        expect(res.status).toBe(400);
    });
});

describe('/api/diagnose — happy path (non-streaming, text-only)', () => {
    it('returns a <thought>…</thought><json>…</json> envelope with the classified trade', async () => {
        const { POST } = await import('../route');
        const res = await POST(
            makeRequest({ textQuery: 'water is leaking near the boundary wall' }),
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toMatch(/^<thought>[\s\S]+<\/thought>\n<json>[\s\S]+<\/json>$/);
        const json = parseJson(text);
        expect(json.trade).toBe('Plumbing');
        // toHeadlineStyle lowercases short connector words like "on".
        expect(json.diagnosis).toBe('Burst Pipe on Mains Supply');
        expect(json).toHaveProperty('structural_confidence');
    });

    it('preserves the canonical pipeline order: rate-limit → classify → prose', async () => {
        const { POST } = await import('../route');
        await POST(makeRequest({ textQuery: 'water is leaking' }));
        // checkRateLimit must come first; classification before prose.
        const rl = callOrder.indexOf('checkRateLimit');
        const cls = callOrder.indexOf('runClassification');
        const prs = callOrder.indexOf('runProseGeneration');
        expect(rl).toBeGreaterThanOrEqual(0);
        expect(cls).toBeGreaterThan(rl);
        expect(prs).toBeGreaterThan(cls);
    });

    it('emits the X-Mendr-Ai-Model + X-Mendr-Prompt-Version response headers', async () => {
        const { POST } = await import('../route');
        const res = await POST(makeRequest({ textQuery: 'help' }));
        expect(res.headers.get('X-Mendr-Ai-Model')).toBeTruthy();
        expect(res.headers.get('X-Mendr-Prompt-Version')).toBeTruthy();
    });
});

describe('/api/diagnose — rate limit', () => {
    it('returns the rate-limit response unchanged when checkRateLimit blocks', async () => {
        const blocked = new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
        });
        const rateLimitConfig = await import('@/lib/rate-limit-config');
        vi.mocked(rateLimitConfig.checkRateLimit).mockResolvedValueOnce(
            blocked as unknown as Awaited<ReturnType<typeof rateLimitConfig.checkRateLimit>>,
        );

        const { POST } = await import('../route');
        const res = await POST(makeRequest({ textQuery: 'help' }));
        expect(res.status).toBe(429);
        // Neither classify nor prose should have been called.
        expect(callOrder).not.toContain('runClassification');
        expect(callOrder).not.toContain('runProseGeneration');
    });
});
