import { describe, it, expect } from 'vitest';
import { buildReportShareMessage } from '../whatsapp-prefill';

const URL = 'https://mendr.co.za/report/abc-123';

describe('buildReportShareMessage', () => {
    it('produces 3 lines for a full case (title + trade + confidence)', () => {
        const out = buildReportShareMessage({
            title: 'Leaking geyser pressure valve',
            trade: 'Plumbing',
            confidence: 82,
            reportUrl: URL,
        });
        const lines = out.split('\n\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe('Mendr diagnosed my home fault: Leaking geyser pressure valve');
        expect(lines[1]).toBe('Trade needed: Plumbing. Confidence: 82%.');
        expect(lines[2]).toBe(`Full report: ${URL}`);
    });

    it('omits the trade line entirely when trade is null', () => {
        const out = buildReportShareMessage({
            title: 'Cracked tile',
            trade: null,
            confidence: 70,
            reportUrl: URL,
        });
        const lines = out.split('\n\n');
        expect(lines).toHaveLength(2);
        expect(lines[0]).toBe('Mendr diagnosed my home fault: Cracked tile');
        expect(lines[1]).toBe(`Full report: ${URL}`);
        expect(out).not.toContain('Trade needed');
        expect(out).not.toContain('Confidence');
    });

    it('also omits the trade line when trade is an empty/whitespace string', () => {
        const out = buildReportShareMessage({
            title: 'Cracked tile',
            trade: '   ',
            confidence: 70,
            reportUrl: URL,
        });
        expect(out).not.toContain('Trade needed');
    });

    it('omits the confidence portion when confidence is null', () => {
        const out = buildReportShareMessage({
            title: 'Loose gate motor mount',
            trade: 'Security',
            confidence: null,
            reportUrl: URL,
        });
        const lines = out.split('\n\n');
        expect(lines).toHaveLength(3);
        expect(lines[1]).toBe('Trade needed: Security.');
        expect(lines[1]).not.toContain('Confidence');
    });

    it('falls back to "a home issue" when title is null', () => {
        const out = buildReportShareMessage({
            title: null,
            trade: 'Electrical',
            confidence: 90,
            reportUrl: URL,
        });
        expect(out).toContain('Mendr diagnosed my home fault: a home issue');
    });

    it('falls back to "a home issue" when title is an empty/whitespace string', () => {
        const out = buildReportShareMessage({
            title: '   ',
            trade: 'Electrical',
            confidence: 90,
            reportUrl: URL,
        });
        expect(out).toContain('Mendr diagnosed my home fault: a home issue');
    });

    it('stays under 700 chars even with the longest plausible inputs', () => {
        const longTitle = 'A '.repeat(500).trim();
        const longTrade = 'B'.repeat(300);
        const longUrl = `https://mendr.co.za/report/${'c'.repeat(120)}`;
        const out = buildReportShareMessage({
            title: longTitle,
            trade: longTrade,
            confidence: 100,
            reportUrl: longUrl,
        });
        expect(out.length).toBeLessThan(700);
    });

    it('preserves the reportUrl exactly', () => {
        const url = 'https://mendr.co.za/report/some-id-with-dashes_and.dots';
        const out = buildReportShareMessage({
            title: 'Whatever',
            trade: 'Plumbing',
            confidence: 50,
            reportUrl: url,
        });
        expect(out).toContain(`Full report: ${url}`);
        // Ensure no encoding / mangling of the URL string itself
        expect(out.endsWith(url)).toBe(true);
    });

    it('rounds non-integer confidence to a whole percent', () => {
        const out = buildReportShareMessage({
            title: 'X',
            trade: 'Plumbing',
            confidence: 82.6,
            reportUrl: URL,
        });
        expect(out).toContain('Confidence: 83%.');
    });
});
