import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WhatsappSession } from '../types';

// ── Mutable session the mocked session-manager returns ────────────────────────
let currentSession: WhatsappSession;
const sessionUpdates: Array<Record<string, unknown>> = [];
const resetCalls: Array<{ phone: string; opts: unknown }> = [];

function makeSession(over: Partial<WhatsappSession> = {}): WhatsappSession {
    return {
        id: 's1',
        phone_number: '27821234567',
        user_id: 'user-1',
        state: 'idle',
        active_diagnosis_id: null,
        pending_contractors: null,
        pending_address: null,
        pending_clarification: null,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        resume_prompted_at: null,
        ...over,
    };
}

vi.mock('../session-manager', () => ({
    getOrCreateSession: vi.fn(async () => currentSession),
    updateSession: vi.fn(async (_phone: string, patch: Record<string, unknown>) => {
        sessionUpdates.push(patch);
        currentSession = { ...currentSession, ...patch } as WhatsappSession;
        return currentSession;
    }),
    resetSession: vi.fn(async (phone: string, opts: unknown) => {
        resetCalls.push({ phone, opts });
        return currentSession;
    }),
    msSinceLastMessage: vi.fn(() => 0),
    RESUME_WINDOW_MS: 72 * 60 * 60 * 1000,
    GUEST_PHONE: 'guest',
}));

const runWhatsappDiagnosis = vi.fn<(...a: unknown[]) => unknown>();
const setDiagnosisLocation = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
vi.mock('../diagnosis-runner', () => ({
    runWhatsappDiagnosis: (...a: unknown[]) => runWhatsappDiagnosis(...a),
    setDiagnosisLocation: (...a: unknown[]) => setDiagnosisLocation(...a),
}));

const matchContractors = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);
const logContractorLead = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => true);
vi.mock('../contractor-matcher', () => ({
    matchContractors: (...a: unknown[]) => matchContractors(...a),
    logContractorLead: (...a: unknown[]) => logContractorLead(...a),
}));

const getSavedLocations = vi.fn<(...a: unknown[]) => Promise<Array<Record<string, unknown>>>>(
    async () => [],
);
const saveLocationForUser = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
vi.mock('../profile', () => ({
    getSavedLocations: (...a: unknown[]) => getSavedLocations(...a),
    saveLocationForUser: (...a: unknown[]) => saveLocationForUser(...a),
}));

const geocodeAddress = vi.fn<(...a: unknown[]) => Promise<null | Record<string, unknown>>>(
    async () => null,
);
vi.mock('../geocode', () => ({
    geocodeAddress: (...a: unknown[]) => geocodeAddress(...a),
}));

const createMagicLink = vi.fn<(...a: unknown[]) => Promise<string>>(
    async () => 'https://mendr.test/api/whatsapp/link?token=abc',
);
const findUserByVerifiedPhone = vi.fn<(...a: unknown[]) => Promise<string | null>>(
    async () => null,
);
vi.mock('../linking', () => ({
    createMagicLink: (...a: unknown[]) => createMagicLink(...a),
    findUserByVerifiedPhone: (...a: unknown[]) => findUserByVerifiedPhone(...a),
    normalisePhone: (raw: string) => raw.replace(/[^\d]/g, '') || null,
}));

const recordOptOut = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
vi.mock('../opt-out', () => ({ recordOptOut: (...a: unknown[]) => recordOptOut(...a) }));

const sendOutbound = vi.fn<(...a: unknown[]) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
vi.mock('../outbox', () => ({ sendOutbound: (...a: unknown[]) => sendOutbound(...a) }));

const channelConfigured = vi.fn<() => boolean>(() => false);
vi.mock('../channel/meta-cloud', () => ({ channelConfigured: () => channelConfigured() }));
vi.mock('../templates', () => ({
    leadAlertContractorTemplate: () => ({ name: 'lead_alert_contractor', language: 'en', bodyParams: [] }),
}));
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://mendr.test', getAppOrigin: () => 'https://mendr.test' }));

// Supabase admin used by loadDiagnosis + scheduleJobFollowup.
let loadedDiagnosis: Record<string, unknown> | null = null;
const followupInserts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => ({
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: loadedDiagnosis ? { diagnosis: loadedDiagnosis } : null, error: null }),
                }),
            }),
            insert: (payload: Record<string, unknown>) => {
                if (table === 'whatsapp_followups') followupInserts.push(payload);
                return Promise.resolve({ data: null, error: null });
            },
        }),
    })),
}));

// Deterministic classifier so layer-2 never calls the network.
const classifier = vi.fn(async () => null);

import { handleMessage, extractClarificationOptions, handleContractorOfferReply } from '../bot-handler';
import type { DiagnosisData } from '@/features/diagnosis/types';

beforeEach(() => {
    currentSession = makeSession();
    sessionUpdates.length = 0;
    resetCalls.length = 0;
    followupInserts.length = 0;
    loadedDiagnosis = null;
    vi.clearAllMocks();
    classifier.mockResolvedValue(null);
    matchContractors.mockResolvedValue([]);
    logContractorLead.mockResolvedValue(true);
    getSavedLocations.mockResolvedValue([]);
    geocodeAddress.mockResolvedValue(null);
    findUserByVerifiedPhone.mockResolvedValue(null);
    channelConfigured.mockReturnValue(false);
});

const committedDiagnosis = {
    diagnosis: 'Detached Tension Spring',
    trade: 'Garage Doors',
    message: 'The spring snapped.\n\nDo not operate the door.',
    requires_clarification: false,
    failed_component: 'tension spring',
} as unknown as DiagnosisData;

describe('extractClarificationOptions', () => {
    it('returns null when there is no clarification data', () => {
        expect(
            extractClarificationOptions({ clarification_questions: [] } as unknown as DiagnosisData),
        ).toBeNull();
    });

    it('flattens flat clarification_questions into numbered options', () => {
        const res = extractClarificationOptions({
            clarification_questions: ['Is it dripping?', 'Is it flooding?'],
        } as unknown as DiagnosisData);
        expect(res?.options).toHaveLength(2);
        expect(res?.options[0]).toMatchObject({ index: 1, text: 'Is it dripping?' });
    });

    it('flattens structured_clarification hypotheses + chips', () => {
        const res = extractClarificationOptions({
            structured_clarification: {
                intro: 'One question:',
                hypotheses: [
                    { id: 'h1', answer_chips: [{ id: 'c1', text: 'Heavy' }, { id: 'c2', text: 'Drops' }] },
                ],
            },
        } as unknown as DiagnosisData);
        expect(res?.intro).toBe('One question:');
        expect(res?.options.map((o) => o.text)).toEqual(['Heavy', 'Drops']);
    });
});

describe('global commands (bypass the state machine)', () => {
    it('start over resets the session and clears the diagnosis', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'start over' });
        expect(resetCalls[0].opts).toEqual({ clearDiagnosis: true });
        expect(res.state).toBe('idle');
        expect(res.messages[0].text.toLowerCase()).toContain('start fresh');
    });

    it('stop records an opt-out and replies with the stop copy', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'stop' });
        expect(recordOptOut).toHaveBeenCalledWith('27821234567');
        // The stop acknowledgement explains how to switch updates back on.
        expect(res.messages[0].text).toContain('Reply START');
    });

    it('help returns the menu without resetting', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'help' });
        expect(res.messages[0].text).toContain('Here is what I can do');
        expect(resetCalls).toHaveLength(0);
    });

    it('human escape replies with the hand-off copy', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'talk to a person' });
        expect(res.messages[0].text).toContain('pass this to a person');
    });
});

describe('registration gate', () => {
    it('sends a magic link to an unknown real number and does not diagnose', async () => {
        currentSession = makeSession({ user_id: null });
        const res = await handleMessage({ from: '27821234567', text: 'my geyser leaks' });
        expect(createMagicLink).toHaveBeenCalled();
        expect(res.messages[0].text).toContain('token=abc');
        expect(runWhatsappDiagnosis).not.toHaveBeenCalled();
    });

    it('uses the plain register URL for the guest sentinel', async () => {
        currentSession = makeSession({ user_id: null, phone_number: 'guest' });
        const res = await handleMessage({ from: 'guest', text: 'help me' });
        expect(createMagicLink).not.toHaveBeenCalled();
        expect(res.messages[0].text).toContain('/register');
    });
});

describe('first contact / non-English', () => {
    it('replies with first-contact copy when nothing actionable is sent', async () => {
        const res = await handleMessage({ from: '27821234567', text: '' });
        expect(res.messages[0].text).toContain('Mendr repair assistant');
    });

    it('nudges to English on a non-English greeting at idle', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'sawubona' });
        expect(res.messages[0].text).toContain('English');
        expect(runWhatsappDiagnosis).not.toHaveBeenCalled();
    });
});

describe('idle → diagnosing', () => {
    it('runs a diagnosis and presents a committed summary + contractor offer', async () => {
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd1', data: committedDiagnosis },
        });
        const res = await handleMessage({ from: '27821234567', text: 'spring snapped on my garage door' });
        expect(runWhatsappDiagnosis).toHaveBeenCalled();
        expect(res.state).toBe('idle');
        // last message is the contractor offer with Yes/No options.
        const offer = res.messages.at(-1)!;
        expect(offer.text).toContain('Yes or No');
        expect(offer.options?.map((o) => o.id)).toEqual(['yes', 'no']);
    });

    it('routes to clarification when the pipeline requires it', async () => {
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: {
                diagnosisId: 'd2',
                data: {
                    diagnosis: 'Unspecified Fault',
                    requires_clarification: true,
                    clarification_questions: ['Is it leaking?', 'Is it noisy?'],
                } as unknown as DiagnosisData,
            },
        });
        const res = await handleMessage({ from: '27821234567', text: 'something is wrong' });
        expect(res.state).toBe('awaiting_clarification');
        expect(res.messages[0].text).toContain('1. Is it leaking?');
    });

    it('returns the quota message on quota_exceeded', async () => {
        runWhatsappDiagnosis.mockResolvedValue({ ok: false, reason: 'quota_exceeded' });
        const res = await handleMessage({ from: '27821234567', text: 'diagnose this' });
        expect(res.state).toBe('idle');
        expect(res.messages[0].text).toContain('daily diagnosis limit');
    });

    it('returns an apology and resets to idle on a pipeline error', async () => {
        runWhatsappDiagnosis.mockResolvedValue({ ok: false, reason: 'error', message: 'boom' });
        const res = await handleMessage({ from: '27821234567', text: 'diagnose this' });
        expect(res.state).toBe('idle');
        expect(res.messages[0].text).toContain('Something went wrong');
    });
});

describe('contractor offer reply (pending offer in idle)', () => {
    beforeEach(() => {
        currentSession = makeSession({
            state: 'idle',
            active_diagnosis_id: 'd1',
            pending_contractors: { contractors: [], trade: 'Garage Doors' },
        });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
    });

    it('a "yes" begins address selection (free-text entry when no saved addresses)', async () => {
        getSavedLocations.mockResolvedValue([]);
        const res = await handleMessage({ from: '27821234567', text: 'yes please' });
        expect(res.state).toBe('awaiting_address');
        expect(res.messages[0].text).toContain('What address should I search near?');
    });

    it('a "no" closes the offer and stays idle', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'no thanks' });
        expect(res.state).toBe('idle');
        expect(res.messages[0].text).toContain('Your diagnosis is saved');
    });

    it('an unclear reply that is not a new problem re-asks the offer', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'hmm maybe' });
        expect(res.state).toBe('idle');
        expect(res.messages[0].text).toContain('did not quite catch that');
    });

    it('a reply that looks like a new problem surfaces the topic-change offer', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'actually my geyser is also leaking badly' });
        expect(res.state).toBe('idle');
        expect(res.messages[0].text).toContain('look at this new problem');
    });
});

describe('awaiting_clarification', () => {
    beforeEach(() => {
        currentSession = makeSession({
            state: 'awaiting_clarification',
            active_diagnosis_id: 'd1',
            pending_clarification: {
                intro: 'One question:',
                escapePrompt: 'Tell me more',
                options: [
                    { index: 1, hypothesisId: 'h1', chipId: 'c1', text: 'Heavy to lift' },
                    { index: 2, hypothesisId: 'h1', chipId: 'c2', text: 'Drops fast' },
                ],
            },
        });
    });

    it('a question is answered then re-asked, staying in clarification', async () => {
        const res = await handleMessage(
            { from: '27821234567', text: 'why does that matter?' },
            { classifier },
        );
        expect(res.state).toBe('awaiting_clarification');
        expect(res.messages[0].text).toContain('Good question');
    });

    it('an unclear reply re-prompts without resetting', async () => {
        const res = await handleMessage(
            { from: '27821234567', text: 'asdkjfh' },
            { classifier },
        );
        expect(res.state).toBe('awaiting_clarification');
        expect(res.messages[0].text).toContain('did not quite catch that');
    });

    it('a numeric selection feeds the chip into a refinement diagnosis', async () => {
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd2', data: committedDiagnosis },
        });
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(runWhatsappDiagnosis).toHaveBeenCalled();
        const call = runWhatsappDiagnosis.mock.calls[0][0] as { text: string };
        expect(call.text).toBe('Heavy to lift');
        expect(res.state).toBe('idle');
    });
});

describe('awaiting_address (saved options)', () => {
    beforeEach(() => {
        currentSession = makeSession({
            state: 'awaiting_address',
            active_diagnosis_id: 'd1',
            pending_address: {
                options: [
                    { index: 1, id: 'l1', label: 'Home', address: '12 Main Rd', lat: -33.9, lng: 18.4 },
                    { index: 2, id: '__other__', label: 'Enter a different address', address: '', lat: null, lng: null, isOther: true },
                ],
                trade: 'Garage Doors',
                tradeDetail: '',
            },
        });
    });

    it('choosing a saved address with coordinates runs the contractor search', async () => {
        matchContractors.mockResolvedValue([
            { index: 1, providerId: 'p1', name: 'Cape Gates', address: 'Claremont', phone: null, email: null, website: null },
        ]);
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(setDiagnosisLocation).toHaveBeenCalled();
        expect(matchContractors).toHaveBeenCalled();
        expect(res.state).toBe('awaiting_contractor_choice');
        expect(res.messages[0].text).toContain('1. Cape Gates');
    });

    it('choosing the "other" row switches to free-text entry mode', async () => {
        const res = await handleMessage({ from: '27821234567', text: '2' }, { classifier });
        expect(res.state).toBe('awaiting_address');
        expect(res.messages[0].text).toContain('What address should I search near?');
    });

    it('an unclear reply re-prompts the address list', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'zzzz' }, { classifier });
        expect(res.state).toBe('awaiting_address');
        expect(res.messages[0].text).toContain('did not quite catch that');
    });

    it('no contractors found resets to idle with a gentle message', async () => {
        matchContractors.mockResolvedValue([]);
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(res.state).toBe('idle');
        expect(res.messages[0].text).toContain('could not find contractors');
    });
});

describe('awaiting_address (free-text entry mode)', () => {
    beforeEach(() => {
        currentSession = makeSession({
            state: 'awaiting_address',
            active_diagnosis_id: 'd1',
            pending_address: { options: [], trade: 'Garage Doors', tradeDetail: '' },
        });
    });

    it('geocodes a typed address, saves it, and searches', async () => {
        geocodeAddress.mockResolvedValue({ lat: -33.9, lng: 18.4, address: '12 Main Rd, Claremont' });
        matchContractors.mockResolvedValue([
            { index: 1, providerId: 'p1', name: 'A', address: null, phone: null, email: null, website: null },
        ]);
        const res = await handleMessage(
            { from: '27821234567', text: '12 Main Road, Claremont' },
            { classifier },
        );
        expect(saveLocationForUser).toHaveBeenCalled();
        expect(res.state).toBe('awaiting_contractor_choice');
    });

    it('replies with address-not-found when geocoding fails', async () => {
        geocodeAddress.mockResolvedValue(null);
        const res = await handleMessage(
            { from: '27821234567', text: 'somewhere vague' },
            { classifier },
        );
        expect(res.state).toBe('awaiting_address');
        expect(res.messages[0].text).toContain('could not find that address');
    });
});

describe('awaiting_contractor_choice', () => {
    const contractors = [
        { index: 1, providerId: 'p1', name: 'Cape Gates', address: 'Claremont', phone: '021 555 0123', email: null, website: 'https://cg.co.za' },
        { index: 2, providerId: null, name: 'Google Listing', address: 'Kenilworth', phone: null, email: null, website: null },
        { index: 3, providerId: 'p3', name: 'Third', address: 'Newlands', phone: null, email: null, website: null },
        { index: 4, providerId: 'p4', name: 'Fourth', address: 'Rondebosch', phone: null, email: null, website: null },
    ];

    beforeEach(() => {
        currentSession = makeSession({
            state: 'awaiting_contractor_choice',
            active_diagnosis_id: 'd1',
            pending_contractors: { contractors, trade: 'Garage Doors', page: 0 },
        });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
    });

    it('selecting a registered provider logs a lead and shows contact details', async () => {
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(logContractorLead).toHaveBeenCalledWith(
            expect.objectContaining({ providerId: 'p1', diagnosisId: 'd1' }),
        );
        expect(res.state).toBe('contact_initiated');
        expect(res.messages[0].text).toContain('Cape Gates');
        expect(res.messages[0].text).toContain('shared with them');
        // The follow-up is scheduled via a fire-and-forget (void) promise, so
        // flush pending microtasks before asserting the insert landed.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(followupInserts).toHaveLength(1);
        expect(followupInserts[0]).toMatchObject({ kind: 'job_followup' });
    });

    it('selecting a non-registered listing does not log a lead', async () => {
        const res = await handleMessage({ from: '27821234567', text: '2' }, { classifier });
        expect(logContractorLead).not.toHaveBeenCalled();
        expect(res.state).toBe('contact_initiated');
        expect(res.messages[0].text).not.toContain('shared with them');
    });

    it('MORE advances to the next page of contractors', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'more' }, { classifier });
        expect(res.state).toBe('awaiting_contractor_choice');
        expect(res.messages[0].text).toContain('Fourth');
    });

    it('an out-of-range / unclear selection re-sends the list', async () => {
        const res = await handleMessage({ from: '27821234567', text: '99' }, { classifier });
        expect(res.state).toBe('awaiting_contractor_choice');
        expect(res.messages[0].text).toContain('did not quite catch that');
    });
});

describe('handleContractorOfferReply (exported)', () => {
    it('returns null for an unclear reply', async () => {
        const session = makeSession({ active_diagnosis_id: 'd1' });
        const res = await handleContractorOfferReply(session, 'maybe later', classifier, {});
        expect(res).toBeNull();
    });

    it('returns the "no" closure for a negative reply', async () => {
        const session = makeSession({ active_diagnosis_id: 'd1' });
        const res = await handleContractorOfferReply(session, 'no', classifier, {});
        expect(res?.state).toBe('idle');
        expect(res?.messages[0].text).toContain('saved');
    });

    it('a "yes" with no active diagnosis still begins address selection', async () => {
        const session = makeSession({ active_diagnosis_id: null });
        const res = await handleContractorOfferReply(session, 'yes', classifier, {});
        expect(res?.state).toBe('awaiting_address');
    });
});

// ── Additional branch coverage ────────────────────────────────────────────────

describe('extractClarificationOptions edge cases', () => {
    it('returns null when structured_clarification has hypotheses but no usable chips', () => {
        const res = extractClarificationOptions({
            structured_clarification: {
                hypotheses: [
                    { id: 'h1', answer_chips: [{ id: 'c1', text: '   ' }, { id: 'c2' }] },
                ],
            },
        } as unknown as DiagnosisData);
        expect(res).toBeNull();
    });

    it('falls back to generated ids/intro when fields are missing or non-string', () => {
        const res = extractClarificationOptions({
            structured_clarification: {
                hypotheses: [
                    { answer_chips: [{ text: 'Heavy' }] },
                ],
            },
        } as unknown as DiagnosisData);
        expect(res?.intro).toBe('');
        expect(res?.options[0]).toMatchObject({ index: 1, hypothesisId: 'h1', chipId: 'c1', text: 'Heavy' });
        expect(res?.escapePrompt).toContain("Doesn't match?");
    });

    it('uses the structured escape prompt when provided', () => {
        const res = extractClarificationOptions({
            structured_clarification: {
                intro: 'Pick one:',
                escape: { prompt: 'Custom escape' },
                hypotheses: [{ id: 'h1', answer_chips: [{ id: 'c1', text: 'A' }] }],
            },
        } as unknown as DiagnosisData);
        expect(res?.escapePrompt).toBe('Custom escape');
    });

    it('skips non-string entries in flat clarification_questions', () => {
        const res = extractClarificationOptions({
            clarification_questions: ['Is it dripping?', '', 42, null],
        } as unknown as DiagnosisData);
        expect(res?.options).toHaveLength(1);
        expect(res?.options[0].text).toBe('Is it dripping?');
    });
});

describe('global commands — menu and unknown fallthrough', () => {
    it('menu returns the help text without resetting', async () => {
        const res = await handleMessage({ from: '27821234567', text: 'menu' });
        expect(res.messages[0].text).toContain('Here is what I can do');
        expect(resetCalls).toHaveLength(0);
    });

    it('stop on the guest sentinel does not record an opt-out', async () => {
        currentSession = makeSession({ phone_number: 'guest', user_id: 'user-1' });
        const res = await handleMessage({ from: 'guest', text: 'stop' });
        expect(recordOptOut).not.toHaveBeenCalled();
        expect(res.messages[0].text).toContain('Reply START');
    });
});

describe('resolveUserId paths', () => {
    it('treats a UUID "from" as the profile id directly (simulator)', async () => {
        const uuid = '11111111-2222-3333-4444-555555555555';
        currentSession = makeSession({ user_id: uuid, phone_number: uuid });
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd1', data: committedDiagnosis },
        });
        const res = await handleMessage({ from: uuid, text: 'my garage door spring snapped' });
        expect(findUserByVerifiedPhone).not.toHaveBeenCalled();
        expect(res.state).toBe('idle');
    });

    it('resolves a verified real number to its user and proceeds past the gate', async () => {
        currentSession = makeSession({ user_id: 'verified-user' });
        findUserByVerifiedPhone.mockResolvedValue('verified-user');
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd1', data: committedDiagnosis },
        });
        const res = await handleMessage({ from: '27821234567', text: 'spring snapped on my garage door' });
        expect(findUserByVerifiedPhone).toHaveBeenCalled();
        expect(runWhatsappDiagnosis).toHaveBeenCalled();
        expect(res.state).toBe('idle');
    });
});

describe('resume nudge clearing', () => {
    it('clears a pending resume nudge when the user replies', async () => {
        currentSession = makeSession({
            resume_prompted_at: new Date().toISOString(),
        });
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd1', data: committedDiagnosis },
        });
        await handleMessage({ from: '27821234567', text: 'my garage door spring snapped' });
        expect(sessionUpdates.some((u) => u.resume_prompted_at === null)).toBe(true);
    });
});

describe('first contact with no text and no images', () => {
    it('replies with first-contact copy when both text and images are empty', async () => {
        const res = await handleMessage({ from: '27821234567', text: '', imageDataUri: [] });
        expect(res.messages[0].text).toContain('Mendr repair assistant');
    });
});

describe('contact_initiated and unknown states', () => {
    it('treats a new message after contact as a fresh diagnosis', async () => {
        currentSession = makeSession({ state: 'contact_initiated', active_diagnosis_id: 'd1' });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd2', data: committedDiagnosis },
        });
        const res = await handleMessage({ from: '27821234567', text: 'my gate is also broken now' });
        expect(runWhatsappDiagnosis).toHaveBeenCalled();
        expect(res.state).toBe('idle');
    });

    it('falls through to a fresh diagnosis for an unrecognised state', async () => {
        currentSession = makeSession({ state: 'weird_state' as unknown as WhatsappSession['state'] });
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd3', data: committedDiagnosis },
        });
        const res = await handleMessage({ from: '27821234567', text: 'something is broken' });
        expect(runWhatsappDiagnosis).toHaveBeenCalled();
        expect(res.state).toBe('idle');
    });
});

describe('presentDiagnosis — photo-request fallback', () => {
    it('re-prompts for a photo and stays diagnosing when clarification has no usable options', async () => {
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: {
                diagnosisId: 'd1',
                data: {
                    diagnosis: 'Unspecified Fault',
                    requires_clarification: true,
                    clarification_questions: [],
                    photo_request: 'the area around the hinge',
                } as unknown as DiagnosisData,
            },
        });
        const res = await handleMessage({ from: '27821234567', text: 'something is broken' });
        expect(res.state).toBe('diagnosing');
        expect(res.messages[0].text).toContain('hinge');
    });
});

describe('beginAddressSelection — saved locations list', () => {
    it('presents a numbered address list (plus the "other" row) when saved addresses exist', async () => {
        currentSession = makeSession({
            state: 'idle',
            active_diagnosis_id: 'd1',
            pending_contractors: { contractors: [], trade: 'Garage Doors' },
        });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
        getSavedLocations.mockResolvedValue([
            { id: 'l1', label: 'Home', address: '12 Main Rd', lat: -33.9, lng: 18.4 },
        ]);
        const res = await handleMessage({ from: '27821234567', text: 'yes please' });
        expect(res.state).toBe('awaiting_address');
        expect(res.messages[0].text).toContain('1. Home');
        expect(res.messages[0].text).toContain('2. Enter a different address');
    });
});

describe('runContractorSearch — geocode-on-the-fly', () => {
    beforeEach(() => {
        currentSession = makeSession({
            state: 'awaiting_address',
            active_diagnosis_id: 'd1',
            pending_address: {
                options: [
                    { index: 1, id: 'l1', label: 'Work', address: '5 Long St', lat: null, lng: null },
                    { index: 2, id: '__other__', label: 'Enter a different address', address: '', lat: null, lng: null, isOther: true },
                ],
                trade: 'Garage Doors',
                tradeDetail: '',
            },
        });
    });

    it('geocodes a saved address that has no coordinates, then searches', async () => {
        geocodeAddress.mockResolvedValue({ lat: -33.9, lng: 18.4, address: '5 Long St, CBD' });
        matchContractors.mockResolvedValue([
            { index: 1, providerId: 'p1', name: 'A', address: null, phone: null, email: null, website: null },
        ]);
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(geocodeAddress).toHaveBeenCalled();
        expect(setDiagnosisLocation).toHaveBeenCalled();
        expect(res.state).toBe('awaiting_contractor_choice');
    });

    it('returns address-not-found when geocoding a coordinate-less option fails', async () => {
        geocodeAddress.mockResolvedValue(null);
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(res.state).toBe('awaiting_address');
        expect(res.messages[0].text).toContain('could not find that address');
    });
});

describe('awaiting_address — free-text "ready" and questions', () => {
    it('"ready" re-loads saved locations and re-presents the address selection', async () => {
        currentSession = makeSession({
            state: 'awaiting_address',
            active_diagnosis_id: 'd1',
            pending_address: { options: [], trade: 'Garage Doors', tradeDetail: '' },
        });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
        getSavedLocations.mockResolvedValue([
            { id: 'l1', label: 'Home', address: '12 Main Rd', lat: -33.9, lng: 18.4 },
        ]);
        const res = await handleMessage({ from: '27821234567', text: 'ready' }, { classifier });
        expect(res.state).toBe('awaiting_address');
        expect(res.messages[0].text).toContain('1. Home');
    });

    it('a question while choosing a saved address re-shows the list', async () => {
        currentSession = makeSession({
            state: 'awaiting_address',
            active_diagnosis_id: 'd1',
            pending_address: {
                options: [
                    { index: 1, id: 'l1', label: 'Home', address: '12 Main Rd', lat: -33.9, lng: 18.4 },
                ],
                trade: 'Garage Doors',
                tradeDetail: '',
            },
        });
        const res = await handleMessage({ from: '27821234567', text: 'which one do you mean?' }, { classifier });
        expect(res.state).toBe('awaiting_address');
        expect(res.messages[0].text).toContain('which address to search near');
    });
});

describe('awaiting_clarification — image and stuck-state paths', () => {
    it('a new photo mid-clarification runs a fresh diagnosis turn', async () => {
        currentSession = makeSession({
            state: 'awaiting_clarification',
            active_diagnosis_id: 'd1',
            pending_clarification: {
                intro: 'One question:',
                escapePrompt: 'Tell me more',
                options: [{ index: 1, hypothesisId: 'h1', chipId: 'c1', text: 'Heavy' }],
            },
        });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd2', data: committedDiagnosis },
        });
        const res = await handleMessage(
            { from: '27821234567', text: '', imageDataUri: ['data:image/jpeg;base64,abc'] },
            { classifier },
        );
        expect(runWhatsappDiagnosis).toHaveBeenCalled();
        expect(res.state).toBe('idle');
    });

    it('a stuck clarification with no options re-orients via a fresh diagnosis', async () => {
        currentSession = makeSession({
            state: 'awaiting_clarification',
            active_diagnosis_id: 'd1',
            pending_clarification: null,
        });
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd2', data: committedDiagnosis },
        });
        const res = await handleMessage({ from: '27821234567', text: 'the spring is broken' }, { classifier });
        expect(runWhatsappDiagnosis).toHaveBeenCalled();
        expect(res.state).toBe('idle');
    });

    it('returns an apology and resets to idle when the refinement diagnosis errors', async () => {
        currentSession = makeSession({
            state: 'awaiting_clarification',
            active_diagnosis_id: 'd1',
            pending_clarification: {
                intro: 'One question:',
                escapePrompt: 'Tell me more',
                options: [{ index: 1, hypothesisId: 'h1', chipId: 'c1', text: 'Heavy' }],
            },
        });
        runWhatsappDiagnosis.mockResolvedValue({ ok: false, reason: 'error' });
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(res.state).toBe('idle');
        expect(res.messages[0].text).toContain('Something went wrong');
    });
});

describe('awaiting_contractor_choice — stuck, last page, confused', () => {
    const contractors = [
        { index: 1, providerId: 'p1', name: 'One', address: 'A', phone: '021 555 0001', email: null, website: null },
        { index: 2, providerId: null, name: 'Two', address: 'B', phone: null, email: null, website: null },
        { index: 3, providerId: 'p3', name: 'Three', address: 'C', phone: null, email: null, website: null },
    ];

    it('a stuck contractor-choice state re-orients via a fresh diagnosis', async () => {
        currentSession = makeSession({
            state: 'awaiting_contractor_choice',
            pending_contractors: null,
        });
        runWhatsappDiagnosis.mockResolvedValue({
            ok: true,
            result: { diagnosisId: 'd2', data: committedDiagnosis },
        });
        const res = await handleMessage({ from: '27821234567', text: 'my pipe is leaking' }, { classifier });
        expect(runWhatsappDiagnosis).toHaveBeenCalled();
        expect(res.state).toBe('idle');
    });

    it('MORE on the last page says "that is everyone" and re-shows the page', async () => {
        currentSession = makeSession({
            state: 'awaiting_contractor_choice',
            active_diagnosis_id: 'd1',
            pending_contractors: { contractors, trade: 'Garage Doors', page: 0 },
        });
        const res = await handleMessage({ from: '27821234567', text: 'more' }, { classifier });
        expect(res.state).toBe('awaiting_contractor_choice');
        expect(res.messages[0].text).toContain('That is everyone');
    });

    it('a confused/question reply repeats the list with guidance', async () => {
        currentSession = makeSession({
            state: 'awaiting_contractor_choice',
            active_diagnosis_id: 'd1',
            pending_contractors: { contractors, trade: 'Garage Doors', page: 0 },
        });
        const res = await handleMessage({ from: '27821234567', text: 'what do you mean?' }, { classifier });
        expect(res.state).toBe('awaiting_contractor_choice');
        expect(res.messages[0].text).toContain('Reply with the number');
    });

    it('defaults page to 0 when pending_contractors has no page set', async () => {
        currentSession = makeSession({
            state: 'awaiting_contractor_choice',
            active_diagnosis_id: 'd1',
            pending_contractors: { contractors, trade: 'Garage Doors' },
        });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(res.state).toBe('contact_initiated');
        expect(res.messages[0].text).toContain('One');
    });
});

describe('contractor lead — provider WhatsApp alert', () => {
    const contractors = [
        { index: 1, providerId: 'p1', name: 'Cape Gates', address: 'Claremont', phone: '27821110000', email: null, website: null },
    ];

    beforeEach(() => {
        currentSession = makeSession({
            state: 'awaiting_contractor_choice',
            active_diagnosis_id: 'd1',
            pending_contractors: { contractors, trade: 'Garage Doors', page: 0 },
        });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
    });

    it('fires the lead-alert template to the provider when the channel is configured', async () => {
        channelConfigured.mockReturnValue(true);
        logContractorLead.mockResolvedValue(true);
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(res.state).toBe('contact_initiated');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(sendOutbound).toHaveBeenCalledWith(
            expect.objectContaining({ to: '27821110000', kind: 'proactive' }),
        );
    });

    it('does not fire the provider alert when the lead was not logged', async () => {
        channelConfigured.mockReturnValue(true);
        logContractorLead.mockResolvedValue(false);
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(res.state).toBe('contact_initiated');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(sendOutbound).not.toHaveBeenCalled();
        expect(res.messages[0].text).not.toContain('shared with them');
    });

    it('does not schedule a follow-up for the guest sentinel', async () => {
        currentSession = makeSession({
            state: 'awaiting_contractor_choice',
            phone_number: 'guest',
            user_id: 'user-1',
            active_diagnosis_id: 'd1',
            pending_contractors: { contractors, trade: 'Garage Doors', page: 0 },
        });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
        await handleMessage({ from: 'guest', text: '1' }, { classifier });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(followupInserts).toHaveLength(0);
        // The lead itself records a null homeowner number for guests.
        expect(logContractorLead).toHaveBeenCalledWith(
            expect.objectContaining({ homeownerWhatsapp: null }),
        );
    });
});

describe('scheduleJobFollowup error handling', () => {
    it('swallows an insert failure without throwing', async () => {
        const contractors = [
            { index: 1, providerId: 'p1', name: 'Cape Gates', address: 'Claremont', phone: null, email: null, website: null },
        ];
        currentSession = makeSession({
            state: 'awaiting_contractor_choice',
            active_diagnosis_id: 'd1',
            pending_contractors: { contractors, trade: 'Garage Doors', page: 0 },
        });
        loadedDiagnosis = committedDiagnosis as unknown as Record<string, unknown>;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        // Force the followups insert (inside scheduleJobFollowup) to reject.
        const supa = await import('@/lib/auth/supabase-server');
        const mocked = supa.createSupabaseAdminClient as unknown as ReturnType<typeof vi.fn>;
        const original = mocked.getMockImplementation();
        mocked.mockImplementation(async () => ({
            from: () => ({
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({ data: { diagnosis: committedDiagnosis }, error: null }),
                    }),
                }),
                insert: () => Promise.reject(new Error('insert boom')),
            }),
        }));
        const res = await handleMessage({ from: '27821234567', text: '1' }, { classifier });
        expect(res.state).toBe('contact_initiated');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(errSpy).toHaveBeenCalledWith(
            '[whatsapp/bot] scheduleJobFollowup failed',
            expect.any(Error),
        );
        if (original) mocked.mockImplementation(original);
        errSpy.mockRestore();
    });
});
