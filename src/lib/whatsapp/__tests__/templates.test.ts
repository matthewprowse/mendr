import { describe, it, expect, afterEach } from 'vitest';
import {
    resumeDiagnosisTemplate,
    leadAlertContractorTemplate,
    jobFollowupTemplate,
    linkAccountOtpTemplate,
} from '../templates';

const ENV_KEYS = ['WHATSAPP_TEMPLATE_RESUME'] as const;

const saved: Record<string, string | undefined> = {};

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
        delete saved[k];
    }
});

function noUndefined(params: { bodyParams: string[] }): boolean {
    return params.bodyParams.every((p) => typeof p === 'string' && !p.includes('undefined'));
}

describe('resumeDiagnosisTemplate', () => {
    it('returns the default template name and language and interpolates the title', () => {
        const t = resumeDiagnosisTemplate('Burst Geyser');
        expect(t.name).toBe('resume_diagnosis');
        expect(t.language).toBe('en');
        expect(t.bodyParams).toEqual(['Burst Geyser']);
        expect(noUndefined(t)).toBe(true);
    });

    it('falls back to "your repair" for an empty title', () => {
        const t = resumeDiagnosisTemplate('');
        expect(t.bodyParams[0]).toBe('your repair');
    });

    it('truncates a very long title to 120 chars', () => {
        const long = 'x'.repeat(300);
        const t = resumeDiagnosisTemplate(long);
        expect(t.bodyParams[0].length).toBe(120);
    });
});

describe('leadAlertContractorTemplate', () => {
    it('interpolates trade, area, and leads URL in order', () => {
        const t = leadAlertContractorTemplate('Plumbing', 'Claremont', 'https://x/pro/leads');
        expect(t.name).toBe('lead_alert_contractor');
        expect(t.bodyParams).toEqual(['Plumbing', 'Claremont', 'https://x/pro/leads']);
        expect(noUndefined(t)).toBe(true);
    });

    it('falls back for empty trade and area', () => {
        const t = leadAlertContractorTemplate('', '', 'https://x/pro/leads');
        expect(t.bodyParams[0]).toBe('a job');
        expect(t.bodyParams[1]).toBe('your area');
    });
});

describe('jobFollowupTemplate', () => {
    it('interpolates provider name and issue title', () => {
        const t = jobFollowupTemplate('Cape Gates', 'Broken Spring');
        expect(t.name).toBe('job_followup');
        expect(t.bodyParams).toEqual(['Cape Gates', 'Broken Spring']);
        expect(noUndefined(t)).toBe(true);
    });

    it('falls back for empty provider name and title', () => {
        const t = jobFollowupTemplate('', '');
        expect(t.bodyParams[0]).toBe('the contractor');
        expect(t.bodyParams[1]).toBe('repair');
    });
});

describe('linkAccountOtpTemplate', () => {
    it('puts the code into the single body param', () => {
        const t = linkAccountOtpTemplate('123456');
        expect(t.name).toBe('link_account_otp');
        expect(t.bodyParams).toEqual(['123456']);
        expect(noUndefined(t)).toBe(true);
    });
});

describe('template env name overrides', () => {
    it('uses an env-provided template name when set (read per call)', () => {
        saved.WHATSAPP_TEMPLATE_RESUME = process.env.WHATSAPP_TEMPLATE_RESUME;
        process.env.WHATSAPP_TEMPLATE_RESUME = 'custom_resume';
        const t = resumeDiagnosisTemplate('Title');
        expect(t.name).toBe('custom_resume');
    });
});
