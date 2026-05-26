/**
 * Contract tests for POST /api/diagnoses/[id]/refine.
 *
 * The full pipeline is heavyweight (Gemini + structural-confidence + parsers).
 * These tests pin the validation gates and auth path — the success path is
 * exercised by the Phase 2 integration tests in `src/app/api/diagnose/__tests__/`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let admin: MockSupabaseClient;
let server: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => admin),
    createSupabaseServerClient: vi.fn(async () => server),
}));
vi.mock('@/lib/service-catalog-server', () => ({
    getServiceCatalogLabelsCached: vi.fn(async () => ['Plumbing']),
}));
vi.mock('@/features/diagnosis/prompts/composer', () => ({
    buildSystemInstruction: () => 'sys',
    buildProseBaseInstruction: () => 'prose',
}));
vi.mock('@/features/diagnosis/agent-classify', () => ({
    runClassification: vi.fn(async () => ({
        trade: 'Plumbing',
        trade_detail: 'leak',
        subcategory_id: 'leak',
        confidence: 80,
        rejected: false,
        requires_clarification: false,
        unserviced: false,
        refetch_providers: false,
        unsupported_reason: '',
        failed_component: 'pipe',
        cascading_damage: '',
    })),
}));
vi.mock('@/features/diagnosis/agent-prose', () => ({
    runProseGeneration: vi.fn(async () => ({})),
    normaliseProse: vi.fn(() => ({
        thought: 'x'.repeat(220),
        diagnosis: 'Leak under sink',
        estimated_diagnosis_sentence: 'Leak under sink',
        message: 'There is a leak.',
        action_required: '',
        contractor_checklist: [],
        homeowner_prep: '',
        image_descriptions: [],
        clarification_questions: [],
        diy_verification: '',
        photo_request: '',
        confidence_drivers: [],
    })),
}));
vi.mock('@/lib/ai/ai-logging', () => ({ logAiEvent: vi.fn(), logPipelineStep: vi.fn() }));
vi.mock('@/lib/ai/ai-diagnosis-backend', () => ({ GEMINI_MODEL_NAME: 'gemini-test' }));
vi.mock('@/features/diagnosis/prompts/prompt-version', () => ({ DIAGNOSE_PROMPT_VERSION: 'v0' }));
vi.mock('@/features/diagnosis/diagnosis-json-validate', () => ({
    logIfDiagnosisJsonShapeUnexpected: vi.fn(),
}));
vi.mock('@/lib/diagnosis/structural-confidence', () => ({
    computeStructuralConfidence: vi.fn(() => ({
        score: 80,
        signals: {
            hasImage: false,
            imageCount: 0,
            descriptionWordCount: 5,
            subcategoryMatched: true,
            failedComponentNamed: true,
            isCatchAllWithNoVisual: false,
            isRejectedOrUnserviced: false,
        },
    })),
}));
vi.mock('@/lib/ai/prompt-utils', () => ({
    toHeadlineStyle: (s: string) => s,
    stripFillerSentenceStarts: (s: string) => s,
}));
// Use the real SERVICE_LABELS so the taxonomy assertion at module load does not
// fail — the taxonomy validates every trade entry against SERVICE_LABELS at
// parse time. Overriding to a single-trade list breaks that invariant.
vi.mock('@/lib/services', async () => {
    const actual = await vi.importActual<typeof import('@/lib/services')>('@/lib/services');
    return { ...actual };
});
vi.mock('@/lib/diagnosis/parse-diagnosis-from-model-response', () => ({
    parseDiagnosisFromModelResponse: vi.fn(() => ({
        thought: 'x',
        diagnosis: 'Leak under sink',
        trade: 'Plumbing',
        action_required: '',
        rejected: false,
        unserviced: false,
        requires_clarification: false,
        subcategory_id: 'leak',
        failed_component: 'pipe',
    })),
}));

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    server = mockSupabaseClient({ user: null });
    admin = mockSupabaseClient({
        tables: {
            diagnoses: {
                data: {
                    id: VALID_UUID,
                    user_id: null,
                    image_url: null,
                    image_urls: [],
                    diagnosis: { trade: 'Plumbing' },
                    initial_image_description: 'leak',
                    customer_address: null,
                    image_refinement_log: [],
                },
                error: null,
            },
        },
    });
});

describe('POST /api/diagnoses/[id]/refine', () => {
    it('returns 400 on invalid conversation id', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { additionalText: 'x' } }), ctx('bad'));
        expect(res.status).toBe(400);
    });

    it('returns 400 on invalid JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: undefined, rawBody: 'nope' }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when neither text nor images supplied', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }), ctx(VALID_UUID));
        expect(res.status).toBe(400);
    });

    it('returns 400 when additionalText exceeds 2000 chars', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { additionalText: 'x'.repeat(2001) } }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(400);
    });

    it('returns 404 when diagnosis not found', async () => {
        admin = mockSupabaseClient({
            tables: { diagnoses: { data: null, error: null } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { additionalText: 'more info' } }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(404);
    });

    it('returns 403 when user does not own the row', async () => {
        admin = mockSupabaseClient({
            tables: {
                diagnoses: {
                    data: {
                        id: VALID_UUID,
                        user_id: 'other-user',
                        image_url: null,
                        image_urls: [],
                        diagnosis: { trade: 'Plumbing' },
                        initial_image_description: 'leak',
                        image_refinement_log: [],
                    },
                    error: null,
                },
            },
        });
        server = mockSupabaseClient({ user: { id: 'requesting-user' } });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { additionalText: 'more' } }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(403);
    });
});
