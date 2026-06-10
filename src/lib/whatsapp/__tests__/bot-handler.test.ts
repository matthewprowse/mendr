import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal mocks for bot-handler dependencies
// ---------------------------------------------------------------------------

const mockSession = {
    phone: '+27821234567',
    state: 'idle',
    diagnosis_id: null,
    diagnosis_data: null,
    pending_clarification: null,
    pending_address_options: null,
    pending_contractors: null,
    location: null,
    user_id: null,
    last_message_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
};

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                }),
            }),
            insert: () => ({ data: null, error: null }),
            update: () => ({ eq: () => ({ data: null, error: null }) }),
        }),
    })),
}));

vi.mock('../session-manager', () => ({
    getOrCreateSession: vi.fn(async () => mockSession),
    updateSession: vi.fn(async () => {}),
    resetSession: vi.fn(async () => {}),
    msSinceLastMessage: vi.fn(() => 0),
    RESUME_WINDOW_MS: 30 * 60 * 1000,
    GUEST_PHONE: '+27000000000',
}));

vi.mock('../diagnosis-runner', () => ({
    runWhatsappDiagnosis: vi.fn(async () => ({
        messages: [{ text: 'Diagnosis started.' }],
        diagnosisId: 'test-diagnosis-id',
    })),
    setDiagnosisLocation: vi.fn(async () => {}),
}));

vi.mock('../contractor-matcher', () => ({
    matchContractors: vi.fn(async () => []),
    logContractorLead: vi.fn(async () => {}),
}));

vi.mock('../profile', () => ({
    getSavedLocations: vi.fn(async () => []),
    saveLocationForUser: vi.fn(async () => {}),
}));

vi.mock('../geocode', () => ({
    geocodeAddress: vi.fn(async () => null),
}));

vi.mock('../intent-classifier', () => ({
    classifyIntent: vi.fn(async () => ({ intent: 'other' })),
}));

beforeEach(() => vi.clearAllMocks());

describe('extractClarificationOptions', () => {
    it('returns null when diagnosis has no clarification data', async () => {
        const { extractClarificationOptions } = await import('../bot-handler');
        // DiagnosisData with no structured_clarification and no clarification_questions
        const result = extractClarificationOptions({
            trade: 'Plumbing',
            title: 'Burst pipe',
            diagnosis: 'Water leak',
            short_summary: null,
            match_summary: null,
            severity: 'medium',
            confidence: 0.8,
            primary_trade: 'Plumbing',
            clarification_questions: [],
            recommendations: [],
            thinking: '',
            action_required: '',
        } as Parameters<typeof extractClarificationOptions>[0]);
        expect(result).toBeNull();
    });

    it('returns options from flat clarification_questions', async () => {
        const { extractClarificationOptions } = await import('../bot-handler');
        const result = extractClarificationOptions({
            trade: 'Plumbing',
            title: 'Water issue',
            diagnosis: 'Unknown',
            short_summary: null,
            match_summary: null,
            severity: 'low',
            confidence: 0.5,
            primary_trade: 'Plumbing',
            clarification_questions: ['Is it dripping?', 'Is there flooding?'],
            recommendations: [],
            thinking: '',
            action_required: '',
        } as Parameters<typeof extractClarificationOptions>[0]);
        expect(result).not.toBeNull();
        expect(result?.options).toHaveLength(2);
        expect(result?.options[0].text).toBe('Is it dripping?');
    });
});

describe('handleMessage — global commands', () => {
    it('responds to restart command by resetting session', async () => {
        const { handleMessage } = await import('../bot-handler');
        const { resetSession } = await import('../session-manager');

        const result = await handleMessage({
            from: '+27821234567',
            text: '/restart',
        });

        // Should call resetSession and return an ack message
        expect(resetSession).toHaveBeenCalled();
        expect(result.messages.length).toBeGreaterThan(0);
    });
});
