import { describe, it, expect } from 'vitest';
import {
    newLeadNotificationText,
    type NewLeadNotificationEmailProps,
} from '@/lib/email/templates/new-lead-notification';

function makeParams(
    overrides: Partial<NewLeadNotificationEmailProps> = {},
): NewLeadNotificationEmailProps {
    return {
        contractorFirstName: 'Acme Plumbing',
        homeownerSuburb: 'Sea Point',
        faultTitle: 'Leaking geyser overflow pipe',
        faultCategory: 'Plumbing',
        urgency: 'moderate',
        leadUrl: 'https://mendr.co.za/report/abc-123',
        unsubscribeUrl: 'https://mendr.co.za/api/unsubscribe?token=x',
        whatsappUrl: 'https://wa.me/27821234567?text=hi',
        ...overrides,
    };
}

describe('newLeadNotificationText', () => {
    it('returns a non-empty string', () => {
        const text = newLeadNotificationText(makeParams());
        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(0);
    });

    it('includes the trade category and suburb', () => {
        const text = newLeadNotificationText(makeParams());
        expect(text).toContain('Plumbing');
        expect(text).toContain('Sea Point');
    });

    it('renders the WhatsApp deeplink when provided', () => {
        const text = newLeadNotificationText(makeParams());
        expect(text).toContain('https://wa.me/27821234567?text=hi');
        expect(text).toContain('Reply on WhatsApp');
    });

    it('omits the WhatsApp deeplink when undefined', () => {
        const text = newLeadNotificationText(makeParams({ whatsappUrl: undefined }));
        expect(text).not.toContain('Reply on WhatsApp');
        expect(text).not.toMatch(/https:\/\/wa\.me\//);
    });

    it('includes the unsubscribe url', () => {
        const text = newLeadNotificationText(makeParams());
        expect(text).toContain('https://mendr.co.za/api/unsubscribe?token=x');
    });
});
