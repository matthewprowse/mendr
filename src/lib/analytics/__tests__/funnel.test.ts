/**
 * Unit tests for the durable funnel stamps.
 *
 * These verify the contract that matters: invalid ids are ignored, valid ids
 * write to `diagnosis_funnel`, and the helpers never throw into the caller path
 * (they are best-effort telemetry).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const VALID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({ tables: { diagnosis_funnel: { data: null, error: null } } });
});

describe('funnel stamps — id validation', () => {
    it('ignores a non-UUID diagnosis id without touching the database', async () => {
        const { stampDiagnosisDelivered } = await import('../funnel');
        await stampDiagnosisDelivered('not-a-uuid');
        expect(supabase.from).not.toHaveBeenCalled();
    });
});

describe('funnel stamps — happy path', () => {
    it('stampDiagnosisDelivered writes to diagnosis_funnel for a valid id', async () => {
        const { stampDiagnosisDelivered } = await import('../funnel');
        await stampDiagnosisDelivered(VALID);
        expect(supabase.from).toHaveBeenCalledWith('diagnosis_funnel');
    });

    it('stampMatchesShown writes to diagnosis_funnel for a valid id', async () => {
        const { stampMatchesShown } = await import('../funnel');
        await stampMatchesShown(VALID, 4);
        expect(supabase.from).toHaveBeenCalledWith('diagnosis_funnel');
    });

    it('stampFirstContact writes to diagnosis_funnel for a valid id', async () => {
        const { stampFirstContact } = await import('../funnel');
        await stampFirstContact(VALID);
        expect(supabase.from).toHaveBeenCalledWith('diagnosis_funnel');
    });
});

describe('funnel stamps — resilience', () => {
    it('never throws when the database layer rejects', async () => {
        supabase = mockSupabaseClient({
            tables: {
                diagnosis_funnel: () => {
                    throw new Error('db down');
                },
            },
        });
        const { stampMatchesShown } = await import('../funnel');
        await expect(stampMatchesShown(VALID, 3)).resolves.toBeUndefined();
    });
});
