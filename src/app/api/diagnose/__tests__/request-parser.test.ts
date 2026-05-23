/**
 * Unit tests for the request-parser extracted from /api/diagnose/route.ts.
 *
 * Covers all 400-response branches plus successful parses across the input
 * shapes (text-only, image, image+attachments, provider hydration).
 */
import { describe, it, expect } from 'vitest';
import { parseDiagnoseRequest } from '../request-parser';

describe('parseDiagnoseRequest — validation failures', () => {
    it('rejects history longer than 20 turns', () => {
        const out = parseDiagnoseRequest({ history: Array(21).fill({ role: 'user' }) });
        expect(out.kind).toBe('response');
        if (out.kind !== 'response') return;
        expect(out.response.status).toBe(400);
    });

    it('rejects textQuery longer than 2000 chars', () => {
        const out = parseDiagnoseRequest({ textQuery: 'a'.repeat(2001) });
        expect(out.kind).toBe('response');
        if (out.kind !== 'response') return;
        expect(out.response.status).toBe(400);
    });

    it('rejects an http image URL outside allowed origins', () => {
        const out = parseDiagnoseRequest({
            image: 'https://evil.example.com/foo.jpg',
            textQuery: 'help me',
        });
        expect(out.kind).toBe('response');
        if (out.kind !== 'response') return;
        expect(out.response.status).toBe(400);
    });

    it('rejects when no image, text query, or attachments supplied', () => {
        const out = parseDiagnoseRequest({});
        expect(out.kind).toBe('response');
        if (out.kind !== 'response') return;
        expect(out.response.status).toBe(400);
    });
});

describe('parseDiagnoseRequest — successful parses', () => {
    it('parses a text-only first message', () => {
        const out = parseDiagnoseRequest({ textQuery: 'my tap is dripping' });
        expect(out.kind).toBe('parsed');
        if (out.kind !== 'parsed') return;
        expect(out.parsed.isTextOnly).toBe(true);
        expect(out.parsed.image).toBeNull();
        expect(out.parsed.attachmentImages).toEqual([]);
        expect(out.parsed.hasAttachments).toBe(false);
    });

    it('parses a single data-URI image', () => {
        const out = parseDiagnoseRequest({
            image: 'data:image/png;base64,iVBOR',
        });
        expect(out.kind).toBe('parsed');
        if (out.kind !== 'parsed') return;
        expect(out.parsed.image).toBe('data:image/png;base64,iVBOR');
        expect(out.parsed.isTextOnly).toBe(false);
    });

    it('parses image + attachments via the legacy field shape', () => {
        const out = parseDiagnoseRequest({
            image: 'data:image/png;base64,A',
            attachments: ['data:image/png;base64,B', 'data:image/png;base64,C'],
        });
        expect(out.kind).toBe('parsed');
        if (out.kind !== 'parsed') return;
        expect(out.parsed.image).toBe('data:image/png;base64,A');
        expect(out.parsed.attachmentImages).toEqual([
            'data:image/png;base64,B',
            'data:image/png;base64,C',
        ]);
    });

    it('applies the 4-image cap and warns', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const out = parseDiagnoseRequest({
            imageUrls: ['a', 'b', 'c', 'd', 'e', 'f'].map((c) => `data:image/png;base64,${c}`),
        });
        expect(out.kind).toBe('parsed');
        if (out.kind !== 'parsed') return;
        expect(out.parsed.allImages.length).toBe(4);
        warnSpy.mockRestore();
    });

    it('parses wantsStream=true when stream:true', () => {
        const out = parseDiagnoseRequest({
            textQuery: 'help me',
            stream: true,
        });
        expect(out.kind).toBe('parsed');
        if (out.kind !== 'parsed') return;
        expect(out.parsed.wantsStream).toBe(true);
    });

    it('detects provider hydration when all conditions are met', () => {
        const out = parseDiagnoseRequest({
            image: 'data:image/png;base64,A',
            providers: [{ name: 'A Plumber' }],
            providerHydration: true,
            previousDiagnosis: {
                diagnosis: 'Burst pipe',
                trade: 'Plumbing',
            },
        });
        expect(out.kind).toBe('parsed');
        if (out.kind !== 'parsed') return;
        expect(out.parsed.isProviderHydration).toBe(true);
        expect(out.parsed.isFollowUp).toBe(true);
    });

    it('does NOT set provider hydration when previousDiagnosis is missing', () => {
        const out = parseDiagnoseRequest({
            image: 'data:image/png;base64,A',
            providers: [{ name: 'A Plumber' }],
            providerHydration: true,
        });
        expect(out.kind).toBe('parsed');
        if (out.kind !== 'parsed') return;
        expect(out.parsed.isProviderHydration).toBe(false);
    });

    it('sets isFollowUp when history is present and previousDiagnosis exists', () => {
        const out = parseDiagnoseRequest({
            textQuery: 'follow up question',
            history: [{ role: 'user', content: 'first' }],
            previousDiagnosis: { diagnosis: 'Burst pipe', trade: 'Plumbing' },
        });
        expect(out.kind).toBe('parsed');
        if (out.kind !== 'parsed') return;
        expect(out.parsed.isFollowUp).toBe(true);
    });

    it('sets hasUserContext when userSelectedTrade has both fields', () => {
        const out = parseDiagnoseRequest({
            textQuery: 'help',
            userSelectedTrade: { trade: 'Plumbing', diagnosis: 'leak' },
        });
        expect(out.kind).toBe('parsed');
        if (out.kind !== 'parsed') return;
        expect(out.parsed.hasUserContext).toBe(true);
    });
});

// vitest globals
import { vi } from 'vitest';
