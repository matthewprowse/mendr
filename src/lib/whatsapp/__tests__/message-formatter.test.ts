import { describe, it, expect } from 'vitest';
import {
    stripMarkdown,
    firstParagraph,
    capMessage,
    formatDiagnosisSummary,
    formatClarification,
    formatContractorList,
    formatContractorContact,
    formatAddressSelection,
    formatContractorOffer,
    MAX_MESSAGE_CHARS,
} from '../message-formatter';
import type { DiagnosisData } from '@/features/diagnosis/types';
import type {
    PendingClarificationOption,
    PendingContractor,
    PendingAddressOption,
} from '../types';

describe('stripMarkdown', () => {
    it('removes bold, bullets, and headings', () => {
        expect(stripMarkdown('**Bold** text')).toBe('Bold text');
        expect(stripMarkdown('# Heading')).toBe('Heading');
        expect(stripMarkdown('- item')).toBe('item');
        expect(stripMarkdown('`code`')).toBe('code');
    });
});

describe('firstParagraph', () => {
    it('returns only the first paragraph', () => {
        const msg = 'Para one is the teaching diagnosis.\n\nPara two is a hazard note.';
        expect(firstParagraph(msg)).toBe('Para one is the teaching diagnosis.');
    });
});

describe('capMessage', () => {
    it('passes short text through', () => {
        expect(capMessage('hello')).toBe('hello');
    });
    it('caps long text at a sentence boundary', () => {
        const long = 'A. ' + 'word '.repeat(400) + 'B.';
        const out = capMessage(long, 100);
        expect(out.length).toBeLessThanOrEqual(101);
    });
    it('never exceeds the default max meaningfully', () => {
        const long = 'x'.repeat(5000);
        const out = capMessage(long);
        expect(out.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS + 1);
    });
});

describe('formatDiagnosisSummary', () => {
    const data: Partial<DiagnosisData> = {
        diagnosis: 'Broken Torsion Spring',
        message:
            'The left torsion spring has snapped, which is why the door no longer lifts evenly.\n\nStop operating the door until it is repaired.',
        thinking:
            'This is the internal reasoning trace which must NOT appear in the summary.',
    };

    it('uses the title + first paragraph of message, not the thought', () => {
        const msgs = formatDiagnosisSummary(data as DiagnosisData, 'abc-123');
        expect(msgs).toHaveLength(2);
        expect(msgs[0]).toContain('Broken Torsion Spring');
        expect(msgs[0]).toContain('The left torsion spring has snapped');
        // The hazard paragraph (para 2) is excluded from message 1.
        expect(msgs[0]).not.toContain('Stop operating the door');
        // The internal thought is never surfaced.
        expect(msgs[0]).not.toContain('internal reasoning trace');
    });

    it('message 2 is the report link', () => {
        const msgs = formatDiagnosisSummary(data as DiagnosisData, 'abc-123');
        expect(msgs[1]).toContain('/report/abc-123');
        expect(msgs[1].toLowerCase()).toContain('full diagnosis');
    });
});

describe('formatClarification', () => {
    const options: PendingClarificationOption[] = [
        { index: 1, hypothesisId: 'h1', chipId: 'c1', text: 'Too heavy to lift' },
        { index: 2, hypothesisId: 'h1', chipId: 'c2', text: 'Lifts but drops fast' },
        { index: 3, hypothesisId: 'h2', chipId: 'c1', text: 'Something else' },
    ];
    it('numbers the options and invites free text', () => {
        const out = formatClarification('A quick question:', options);
        expect(out).toContain('1. Too heavy to lift');
        expect(out).toContain('2. Lifts but drops fast');
        expect(out).toContain('3. Something else');
        expect(out.toLowerCase()).toContain('your own words');
    });
});

describe('formatContractorList', () => {
    const contractors: PendingContractor[] = [
        { index: 1, providerId: 'p1', name: 'Cape Gates', address: 'Claremont', phone: '021 555 0123', email: null, website: null },
        { index: 2, providerId: null, name: 'SecureFix', address: 'Kenilworth', phone: null, email: null, website: null },
    ];
    it('lists contractors with closest wording', () => {
        const out = formatContractorList('Broken Torsion Spring', contractors);
        expect(out).toContain('closest contractors for Broken Torsion Spring');
        expect(out).toContain('1. Cape Gates, Claremont');
        expect(out).toContain('2. SecureFix, Kenilworth');
        expect(out).not.toContain('available');
        expect(out.toLowerCase()).toContain('reply with a number');
    });
});

describe('formatContractorContact', () => {
    const contractor: PendingContractor = {
        index: 1,
        providerId: 'p1',
        name: 'Cape Gates',
        address: 'Claremont',
        phone: '021 555 0123',
        email: 'hello@capegates.co.za',
        website: 'https://capegates.co.za',
    };
    it('includes the shared-with-them line only when notified', () => {
        const notified = formatContractorContact(contractor, { notified: true });
        expect(notified).toContain('Cape Gates');
        expect(notified).toContain('021 555 0123');
        expect(notified).toContain('shared with them');

        const notNotified = formatContractorContact(contractor, { notified: false });
        expect(notNotified).not.toContain('shared with them');
    });
});

describe('formatAddressSelection', () => {
    const options: PendingAddressOption[] = [
        { index: 1, id: 'a', label: 'Home', address: '14 Balmoral Road, Claremont', lat: 1, lng: 2 },
        { index: 2, id: '__other__', label: 'Enter a different address', address: '', lat: null, lng: null, isOther: true },
    ];
    it('numbers saved addresses and the other row', () => {
        const out = formatAddressSelection(options);
        expect(out).toContain('Which address should I search near?');
        expect(out).toContain('1. Home — 14 Balmoral Road, Claremont');
        expect(out).toContain('2. Enter a different address');
    });
});

describe('formatContractorOffer', () => {
    it('asks Yes or No without pushing', () => {
        expect(formatContractorOffer()).toContain('Yes or No');
    });
});
