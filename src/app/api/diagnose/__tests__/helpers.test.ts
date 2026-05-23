/**
 * Unit tests for the pure helpers extracted from /api/diagnose/route.ts in Phase 2.
 *
 * Covers:
 *   - `extractThoughtText` — multiple tag variants, fenced code, fallback to
 *     pre-JSON prefix.
 *   - `extractPartialThoughtInner` — open-tag-only and complete-tag cases used
 *     during streaming.
 *   - `isAllowedImageUrl` — invalid URLs, allow-list match.
 *   - `normaliseDiagnoseImageInputs` — precedence across the 4 input shapes.
 *   - `recordStage` / `diagnoseAiLogMeta` / `buildDiagnoseSuccessMeta` —
 *     structured logging shape.
 */
import { describe, it, expect } from 'vitest';
import {
    buildDiagnoseSuccessMeta,
    diagnoseAiLogMeta,
    extractPartialThoughtInner,
    extractThoughtText,
    isAllowedImageUrl,
    normaliseDiagnoseImageInputs,
    recordStage,
} from '../helpers';

describe('extractThoughtText', () => {
    it('extracts content from <thought> tags', () => {
        expect(extractThoughtText('<thought>this is a thought</thought><json>{}</json>'))
            .toBe('this is a thought');
    });

    it('extracts content from <thinking> tags', () => {
        expect(extractThoughtText('<thinking>some reasoning</thinking>'))
            .toBe('some reasoning');
    });

    it('extracts content from <thought_process> tags', () => {
        expect(extractThoughtText('<thought_process>step one, step two</thought_process>'))
            .toBe('step one, step two');
    });

    it('falls back to a markdown code fence', () => {
        expect(extractThoughtText('```thought\nfenced thought\n```'))
            .toBe('fenced thought');
    });

    it('returns the prefix before <json> when no thought tags', () => {
        expect(
            extractThoughtText('Plain text reasoning here\n<json>{}</json>'),
        ).toBe('Plain text reasoning here');
    });

    it('returns the empty string for an empty input', () => {
        expect(extractThoughtText('')).toBe('');
    });
});

describe('extractPartialThoughtInner', () => {
    it('returns the inner text while the close tag is still streaming', () => {
        expect(extractPartialThoughtInner('<thought>partial chunk so far')).toBe(
            'partial chunk so far',
        );
    });

    it('returns the inner text once the close tag arrives', () => {
        expect(extractPartialThoughtInner('<thought>final text</thought>')).toBe('final text');
    });

    it('returns null when no open tag has arrived yet', () => {
        expect(extractPartialThoughtInner('no tags here')).toBeNull();
    });

    it('handles <thinking> as an alternate tag name', () => {
        expect(extractPartialThoughtInner('prefix <thinking>x')).toBe('x');
    });
});

describe('isAllowedImageUrl', () => {
    const ALLOWED = ['https://example.supabase.co'];

    it('accepts a URL with a matching origin', () => {
        expect(
            isAllowedImageUrl('https://example.supabase.co/storage/v1/object/public/foo.jpg', ALLOWED),
        ).toBe(true);
    });

    it('rejects a URL with a different origin', () => {
        expect(
            isAllowedImageUrl('https://evil.example.com/foo.jpg', ALLOWED),
        ).toBe(false);
    });

    it('rejects a malformed URL', () => {
        expect(isAllowedImageUrl('not a url at all', ALLOWED)).toBe(false);
    });

    it('rejects when the allow-list is empty', () => {
        expect(isAllowedImageUrl('https://example.supabase.co/x.jpg', [])).toBe(false);
    });
});

describe('normaliseDiagnoseImageInputs', () => {
    it('prefers imageUrls when provided', () => {
        expect(
            normaliseDiagnoseImageInputs({
                imageUrls: ['a', 'b'],
                images: ['c'],
                imageUrl: 'd',
                image: 'e',
                attachments: ['f'],
            }),
        ).toEqual(['a', 'b']);
    });

    it('falls back to images[] when imageUrls is missing', () => {
        expect(
            normaliseDiagnoseImageInputs({ images: ['c'], image: 'e', attachments: ['f'] }),
        ).toEqual(['c']);
    });

    it('uses imageUrl + attachments when neither imageUrls nor images present', () => {
        expect(
            normaliseDiagnoseImageInputs({ imageUrl: 'first', attachments: ['extra1', 'extra2'] }),
        ).toEqual(['first', 'extra1', 'extra2']);
    });

    it('uses legacy image field when imageUrl is missing', () => {
        expect(
            normaliseDiagnoseImageInputs({ image: 'first', attachments: ['extra'] }),
        ).toEqual(['first', 'extra']);
    });

    it('filters out non-string entries from imageUrls', () => {
        expect(
            normaliseDiagnoseImageInputs({ imageUrls: ['ok', '', null, 42, 'x'] as unknown[] }),
        ).toEqual(['ok', 'x']);
    });

    it('returns an empty array when nothing supplied', () => {
        expect(normaliseDiagnoseImageInputs({})).toEqual([]);
    });

    it('trims whitespace from entries', () => {
        expect(
            normaliseDiagnoseImageInputs({ images: ['  hello  ', '\nbye\n'] }),
        ).toEqual(['hello', 'bye']);
    });
});

describe('recordStage', () => {
    it('records the elapsed time since startedAt under the given key', () => {
        const timings: Record<string, number> = {};
        const start = Date.now() - 50;
        recordStage(timings, 'foo_ms', start);
        expect(timings.foo_ms).toBeGreaterThanOrEqual(40);
        expect(timings.foo_ms).toBeLessThan(2000);
    });
});

describe('diagnoseAiLogMeta', () => {
    it('always includes promptVersion and model', () => {
        const meta = diagnoseAiLogMeta();
        expect(meta).toHaveProperty('promptVersion');
        expect(meta).toHaveProperty('model');
    });

    it('merges extras on top of the defaults', () => {
        const meta = diagnoseAiLogMeta({ custom: 'value' });
        expect(meta.custom).toBe('value');
        expect(meta).toHaveProperty('promptVersion');
    });
});

describe('buildDiagnoseSuccessMeta', () => {
    const base = {
        isTextOnly: false,
        isFollowUp: false,
        hasUserContext: false,
        hasImage: true,
        attachmentCount: 1,
        historyLength: 2,
        pipeline: 'v2-classify-prose',
        tieringLogMeta: { imagesInRequest: 1, imagesAfterTier: 1 },
    };

    it('always sets usedGenerateContentFallback false and spreads tieringLogMeta', () => {
        const meta = buildDiagnoseSuccessMeta(base);
        expect(meta.usedGenerateContentFallback).toBe(false);
        expect(meta.imagesInRequest).toBe(1);
    });

    it('includes ndjsonStream true only when streaming', () => {
        expect(buildDiagnoseSuccessMeta({ ...base, ndjsonStream: true }).ndjsonStream).toBe(true);
        expect(buildDiagnoseSuccessMeta(base).ndjsonStream).toBeUndefined();
    });

    it('renames attachmentCount to attachmentsCount in the output meta', () => {
        const meta = buildDiagnoseSuccessMeta(base);
        expect(meta.attachmentsCount).toBe(1);
    });
});
