import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface MaybeSingleResult {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
}

type TableHandler = (filters: Record<string, unknown>) => MaybeSingleResult;

const tables: Record<string, TableHandler> = {};

function makeAdminClient() {
    function from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {
            select(_cols?: string) {
                return builder;
            },
            eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
            },
            maybeSingle() {
                const handler = tables[table];
                if (!handler) return Promise.resolve({ data: null, error: null });
                return Promise.resolve(handler(filters));
            },
        };
        return builder;
    }
    return { from } as unknown as Awaited<
        ReturnType<typeof import('@/lib/auth/supabase-server').createSupabaseAdminClient>
    >;
}

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => makeAdminClient()),
}));

type SendArgs = Parameters<typeof import('@/lib/resend-mail').sendScandioEmail>;
type SendResult = Awaited<ReturnType<typeof import('@/lib/resend-mail').sendScandioEmail>>;
const sendScandioEmailMock = vi.fn(async (..._args: SendArgs): Promise<SendResult> => ({
    ok: true,
}));
vi.mock('@/lib/resend-mail', async () => {
    const actual = await vi.importActual<typeof import('@/lib/resend-mail')>(
        '@/lib/resend-mail',
    );
    return {
        ...actual,
        sendScandioEmail: (...args: SendArgs) => sendScandioEmailMock(...args),
    };
});

vi.mock('@/lib/site-url', () => ({
    getSiteUrl: () => 'https://mendr.test',
}));

import { notifyContractorOfLead } from '../notify-contractor-of-lead';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupHappyPath(overrides: { provider?: Record<string, unknown>; diagnosis?: Record<string, unknown> } = {}) {
    tables.providers = () => ({
        data: {
            id: 'prov-1',
            name: 'Acme Plumbing',
            email: 'acme@example.com',
            notify_realtime: true,
            is_active: true,
            ...overrides.provider,
        },
        error: null,
    });
    tables.email_suppressions = () => ({ data: null, error: null });
    tables.diagnoses = () => ({
        data: {
            user_id: 'user-1',
            customer_address: '12 Main Rd, Sea Point, Cape Town, 8005',
            diagnosis: {
                title: 'Leaking geyser overflow pipe',
                trade: 'Plumbing',
                severity: 'medium',
            },
            ...overrides.diagnosis,
        },
        error: null,
    });
    tables.profiles = () => ({ data: { first_name: 'Sipho' }, error: null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    sendScandioEmailMock.mockClear();
    sendScandioEmailMock.mockResolvedValue({ ok: true });
});

describe('notifyContractorOfLead', () => {
    it('returns { ok: false, reason: "inactive" } when provider is not active', async () => {
        setupHappyPath({ provider: { is_active: false } });
        const result = await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: null,
        });
        expect(result).toEqual({ ok: false, reason: 'inactive' });
        expect(sendScandioEmailMock).not.toHaveBeenCalled();
    });

    it('returns { ok: false, reason: "suppressed" } when contractor email is on the suppression list', async () => {
        setupHappyPath();
        tables.email_suppressions = () => ({
            data: { email: 'acme@example.com' },
            error: null,
        });
        const result = await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: null,
        });
        expect(result).toEqual({ ok: false, reason: 'suppressed' });
        expect(sendScandioEmailMock).not.toHaveBeenCalled();
    });

    it('returns { ok: false, reason: "opted_out" } when notify_realtime is false', async () => {
        setupHappyPath({ provider: { notify_realtime: false } });
        const result = await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: null,
        });
        expect(result).toEqual({ ok: false, reason: 'opted_out' });
        expect(sendScandioEmailMock).not.toHaveBeenCalled();
    });

    it('returns { ok: true } and sends an email when all conditions are met', async () => {
        setupHappyPath();
        const result = await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: '+27821234567',
        });
        expect(result).toEqual({ ok: true });
        expect(sendScandioEmailMock).toHaveBeenCalledTimes(1);
        const payload = sendScandioEmailMock.mock.calls[0]![0] as {
            to: { email: string };
            subject: string;
        };
        expect(payload.to.email).toBe('acme@example.com');
        expect(payload.subject).toMatch(/^New Mendr lead — Plumbing in Sea Point/);
    });

    it('builds the wa.me deeplink correctly when homeownerWhatsapp is provided', async () => {
        setupHappyPath();
        await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: '0821234567', // SA local-format number
        });
        const payload = sendScandioEmailMock.mock.calls[0]![0] as {
            text: string;
            html: string;
        };
        // Should normalise 0XXXXXXXXX → 27XXXXXXXXX.
        expect(payload.text).toContain('https://wa.me/27821234567');
        expect(payload.html).toContain('https://wa.me/27821234567');
        expect(payload.html).toContain('Reply on WhatsApp');
    });

    it('omits the wa.me deeplink when homeownerWhatsapp is null', async () => {
        setupHappyPath();
        await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: null,
        });
        const payload = sendScandioEmailMock.mock.calls[0]![0] as {
            text: string;
            html: string;
        };
        expect(payload.text).not.toMatch(/https:\/\/wa\.me\//);
        expect(payload.html).not.toMatch(/https:\/\/wa\.me\//);
        expect(payload.html).not.toContain('Reply on WhatsApp');
    });

    it('returns { ok: false, reason: "not_found" } when the provider row is missing', async () => {
        tables.providers = () => ({ data: null, error: null });
        const result = await notifyContractorOfLead({
            contractorId: 'missing',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: null,
        });
        expect(result).toEqual({ ok: false, reason: 'not_found' });
        expect(sendScandioEmailMock).not.toHaveBeenCalled();
    });

    it('returns { ok: false, reason: "no_email" } when the provider has no email', async () => {
        setupHappyPath({ provider: { email: null } });
        const result = await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: null,
        });
        expect(result).toEqual({ ok: false, reason: 'no_email' });
        expect(sendScandioEmailMock).not.toHaveBeenCalled();
    });

    it('returns { ok: false, reason: "diagnosis_not_found" } when the diagnosis is missing', async () => {
        setupHappyPath();
        tables.diagnoses = () => ({ data: null, error: null });
        const result = await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'gone',
            homeownerWhatsapp: null,
        });
        expect(result).toEqual({ ok: false, reason: 'diagnosis_not_found' });
        expect(sendScandioEmailMock).not.toHaveBeenCalled();
    });

    it('surfaces the provider query error message', async () => {
        tables.providers = () => ({ data: null, error: { message: 'db down' } });
        const result = await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: null,
        });
        expect(result).toEqual({ ok: false, reason: 'db down' });
    });

    it('still sends when notify_realtime is absent (opt-out defaults to opted-in)', async () => {
        // notify_realtime is only blocking when explicitly false.
        setupHappyPath({ provider: { notify_realtime: null } });
        const result = await notifyContractorOfLead({
            contractorId: 'prov-1',
            diagnosisId: 'diag-1',
            homeownerWhatsapp: null,
        });
        expect(result).toEqual({ ok: true });
        expect(sendScandioEmailMock).toHaveBeenCalledTimes(1);
    });
});
