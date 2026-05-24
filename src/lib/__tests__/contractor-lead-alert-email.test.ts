import { describe, it, expect } from 'vitest';
import { contractorLeadAlertEmail } from '../resend-mail';

function makeParams(overrides: Partial<Parameters<typeof contractorLeadAlertEmail>[0]> = {}) {
    return {
        contractorName: 'Acme Plumbing',
        homeownerFirstName: 'Sipho',
        suburb: 'Sea Point',
        diagnosisTitle: 'Leaking geyser overflow pipe',
        trade: 'Plumbing',
        severity: 'medium' as const,
        reportUrl: 'https://mendr.co.za/report/abc-123',
        whatsappDeeplink: 'https://wa.me/27821234567?text=hi',
        unsubscribeUrl: 'https://mendr.co.za/api/unsubscribe?token=x',
        ...overrides,
    };
}

describe('contractorLeadAlertEmail', () => {
    it('returns both text and html strings', () => {
        const { text, html } = contractorLeadAlertEmail(makeParams());
        expect(typeof text).toBe('string');
        expect(typeof html).toBe('string');
        expect(text.length).toBeGreaterThan(0);
        expect(html.length).toBeGreaterThan(0);
    });

    it('includes the trade and suburb in the body (text + html)', () => {
        const { text, html } = contractorLeadAlertEmail(makeParams());
        expect(text).toContain('Plumbing');
        expect(text).toContain('Sea Point');
        expect(html).toContain('Plumbing');
        expect(html).toContain('Sea Point');
    });

    it('renders the WhatsApp deeplink section when provided', () => {
        const { text, html } = contractorLeadAlertEmail(makeParams());
        expect(text).toContain('https://wa.me/27821234567?text=hi');
        expect(html).toContain('Reply on WhatsApp');
        expect(html).toContain('https://wa.me/27821234567?text=hi');
    });

    it('omits the WhatsApp deeplink section when null', () => {
        const { text, html } = contractorLeadAlertEmail(
            makeParams({ whatsappDeeplink: null }),
        );
        expect(text).not.toContain('Reply on WhatsApp');
        expect(text).not.toMatch(/https:\/\/wa\.me\//);
        expect(html).not.toContain('Reply on WhatsApp');
        expect(html).not.toMatch(/https:\/\/wa\.me\//);
    });

    it('includes the unsubscribe url in the html footer', () => {
        const { html } = contractorLeadAlertEmail(makeParams());
        expect(html).toContain('https://mendr.co.za/api/unsubscribe?token=x');
    });

    it('falls back to a generic homeowner label when first name is null', () => {
        const { text } = contractorLeadAlertEmail(
            makeParams({ homeownerFirstName: null }),
        );
        expect(text).toContain('A homeowner');
    });

    it('omits the severity line when severity is null', () => {
        const { text } = contractorLeadAlertEmail(makeParams({ severity: null }));
        expect(text).not.toMatch(/Severity:/);
    });
});
