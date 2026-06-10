import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the heavy pipeline + prompt dependencies ────────────────────────────
const runPipeline = vi.fn();
const buildContents = vi.fn<(...args: unknown[]) => Promise<{ contents: unknown[]; imagesAfterTier: number }>>(
    async () => ({ contents: [], imagesAfterTier: 0 }),
);

vi.mock('@/app/api/diagnose/pipeline-runner', () => ({
    runDiagnosePipelineNonStreaming: (...args: unknown[]) => runPipeline(...args),
}));
vi.mock('@/app/api/diagnose/contents-builder', () => ({
    buildDiagnoseContents: (...args: unknown[]) => buildContents(...args),
}));
vi.mock('@/features/diagnosis/prompts/composer', () => ({
    buildSystemInstruction: () => 'SYSTEM',
    buildProseBaseInstruction: () => 'PROSE',
}));
vi.mock('@/lib/service-catalog-server', () => ({
    getServiceCatalogLabelsCached: async () => ['Plumbing', 'Electrical'],
}));
vi.mock('@/lib/services', () => ({ SERVICE_LABELS: ['Plumbing'] }));

// ── Supabase admin mock ───────────────────────────────────────────────────────
type Result = { data?: unknown; error?: unknown; count?: number };
const dr: {
    countResult: Result;
    insertResult: Result;
    updates: Array<Record<string, unknown>>;
    inserts: Array<Record<string, unknown>>;
} = { countResult: { count: 0, error: null }, insertResult: { data: { id: 'd-new' }, error: null }, updates: [], inserts: [] };

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => ({
        from: (_table: string) => {
            let op: 'select' | 'insert' | 'update' = 'select';
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                gte: () => Promise.resolve(dr.countResult),
                insert(payload: Record<string, unknown>) {
                    op = 'insert';
                    dr.inserts.push(payload);
                    return builder;
                },
                update(payload: Record<string, unknown>) {
                    op = 'update';
                    dr.updates.push(payload);
                    return builder;
                },
                single: () => Promise.resolve(op === 'insert' ? dr.insertResult : { data: null }),
            };
            // update().eq() resolves directly
            const origEq = builder.eq;
            builder.eq = () => {
                if (op === 'update') return Promise.resolve(dr.updates.length ? { error: null } : { error: null });
                return (origEq as () => unknown)();
            };
            return builder;
        },
    })),
}));

import {
    parsePipelineResponse,
    runWhatsappDiagnosis,
    setDiagnosisLocation,
    WHATSAPP_DAILY_QUOTA,
} from '../diagnosis-runner';

beforeEach(() => {
    runPipeline.mockReset();
    buildContents.mockClear();
    dr.countResult = { count: 0, error: null };
    dr.insertResult = { data: { id: 'd-new' }, error: null };
    dr.updates = [];
    dr.inserts = [];
    vi.clearAllMocks();
});

const PIPELINE_BODY =
    '<thought>my reasoning</thought><json>{"diagnosis":"Burst Pipe","trade":"Plumbing","trade_detail":"Copper"}</json>';

describe('parsePipelineResponse', () => {
    it('extracts the JSON block and fills thinking from the thought tag', () => {
        const data = parsePipelineResponse(PIPELINE_BODY);
        expect(data.diagnosis).toBe('Burst Pipe');
        expect(data.thinking).toBe('my reasoning');
    });

    it('prefers an explicit thinking field in the JSON over the thought tag', () => {
        const body =
            '<thought>tag thought</thought><json>{"diagnosis":"X","thinking":"json thought"}</json>';
        expect(parsePipelineResponse(body).thinking).toBe('json thought');
    });

    it('throws when there is no json block', () => {
        expect(() => parsePipelineResponse('<thought>only</thought>')).toThrow(/missing <json>/);
    });
});

describe('runWhatsappDiagnosis', () => {
    it('runs the pipeline, persists the diagnosis, and returns the new id + data', async () => {
        runPipeline.mockResolvedValue({ responseText: PIPELINE_BODY });
        const outcome = await runWhatsappDiagnosis({
            phoneNumber: '27821234567',
            userId: 'user-1',
            text: 'pipe burst',
        });
        expect(outcome.ok).toBe(true);
        if (outcome.ok) {
            expect(outcome.result.diagnosisId).toBe('d-new');
            expect(outcome.result.data.diagnosis).toBe('Burst Pipe');
        }
        // Persisted with user_id + device marker.
        expect(dr.inserts[0]).toMatchObject({ user_id: 'user-1', device: 'whatsapp' });
    });

    it('returns quota_exceeded when the user is at the daily cap', async () => {
        dr.countResult = { count: WHATSAPP_DAILY_QUOTA, error: null };
        const outcome = await runWhatsappDiagnosis({
            phoneNumber: '27821234567',
            userId: 'user-1',
            text: 'pipe burst',
        });
        expect(outcome).toEqual({ ok: false, reason: 'quota_exceeded' });
        expect(runPipeline).not.toHaveBeenCalled();
    });

    it('does not enforce quota for unlinked numbers (null userId)', async () => {
        dr.countResult = { count: 999, error: null };
        runPipeline.mockResolvedValue({ responseText: PIPELINE_BODY });
        const outcome = await runWhatsappDiagnosis({
            phoneNumber: 'guest',
            userId: null,
            text: 'pipe burst',
        });
        expect(outcome.ok).toBe(true);
    });

    it('returns a typed error when the pipeline throws', async () => {
        runPipeline.mockRejectedValue(new Error('pipeline boom'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const outcome = await runWhatsappDiagnosis({
            phoneNumber: '27821234567',
            userId: 'user-1',
            text: 'pipe burst',
        });
        expect(outcome).toMatchObject({ ok: false, reason: 'error', message: 'pipeline boom' });
        errSpy.mockRestore();
    });

    it('returns a typed error when persistence fails', async () => {
        runPipeline.mockResolvedValue({ responseText: PIPELINE_BODY });
        dr.insertResult = { data: null, error: { message: 'insert failed' } };
        const outcome = await runWhatsappDiagnosis({
            phoneNumber: '27821234567',
            userId: 'user-1',
            text: 'pipe burst',
        });
        expect(outcome).toMatchObject({ ok: false, reason: 'error', message: 'insert failed' });
    });
});

describe('setDiagnosisLocation', () => {
    it('updates the diagnosis row with the chosen coordinates', async () => {
        await setDiagnosisLocation('d1', { lat: -33.9, lng: 18.4, address: '12 Main Rd' });
        expect(dr.updates[0]).toMatchObject({
            customer_lat: -33.9,
            customer_lng: 18.4,
            customer_address: '12 Main Rd',
        });
    });
});
