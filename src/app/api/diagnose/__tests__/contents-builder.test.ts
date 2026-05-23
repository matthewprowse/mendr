/**
 * Unit tests for the contents-builder extracted from /api/diagnose/route.ts.
 *
 * Covers the four call shapes:
 *   - text-only first message
 *   - text-only follow-up (with optional new attachments)
 *   - image first message
 *   - image follow-up
 *
 * Image-loading is exercised via data URIs (no http fetching) so the test
 * runs without a network or mock.
 */
import { describe, it, expect } from 'vitest';
import { buildDiagnoseContents } from '../contents-builder';

const DATA_PNG = 'data:image/png;base64,iVBORw0KGgoAAA';

describe('buildDiagnoseContents — text-only first message', () => {
    it('emits a single user turn with the text prompt', async () => {
        const result = await buildDiagnoseContents({
            image: null,
            attachmentImages: [],
            textQuery: 'my tap is dripping',
            history: [],
            initialImageDescription: '',
            instructionPrefix: 'SYSTEM\n\n',
            isTextOnly: true,
            isProviderHydration: false,
            hasUserContext: false,
            userSelectedTrade: null,
        });
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].role).toBe('user');
        expect(result.contents[0].parts.some((p) => p.text?.includes('my tap is dripping')))
            .toBe(true);
        expect(result.imagesInRequest).toBe(0);
    });

    it('prefixes with an initial_image_description block when supplied', async () => {
        const result = await buildDiagnoseContents({
            image: null,
            attachmentImages: [],
            textQuery: 'follow-up',
            history: [],
            initialImageDescription: 'A leaking tap',
            instructionPrefix: 'SYSTEM\n\n',
            isTextOnly: true,
            isProviderHydration: false,
            hasUserContext: false,
            userSelectedTrade: null,
        });
        expect(result.contents[0].parts[0].text).toContain('[Initial image: A leaking tap]');
    });
});

describe('buildDiagnoseContents — text-only follow-up', () => {
    it('emits history turns + final user turn with new instruction prefix', async () => {
        const result = await buildDiagnoseContents({
            image: null,
            attachmentImages: [],
            textQuery: 'another question',
            history: [
                { role: 'user', content: 'first message' },
                { role: 'assistant', content: 'first reply' },
            ],
            initialImageDescription: '',
            instructionPrefix: 'SYSTEM\n\n',
            isTextOnly: true,
            isProviderHydration: false,
            hasUserContext: false,
            userSelectedTrade: null,
        });
        // history(2) + final user
        expect(result.contents.length).toBe(3);
        expect(result.contents[0].role).toBe('user');
        expect(result.contents[1].role).toBe('model');
        const last = result.contents[result.contents.length - 1];
        expect(last.role).toBe('user');
        expect(last.parts[last.parts.length - 1].text).toContain('another question');
    });

    it('includes new attachment images when present on a follow-up', async () => {
        const result = await buildDiagnoseContents({
            image: null,
            attachmentImages: [DATA_PNG],
            textQuery: 'see this',
            history: [{ role: 'user', content: 'first' }],
            initialImageDescription: '',
            instructionPrefix: 'SYSTEM\n\n',
            isTextOnly: true,
            isProviderHydration: false,
            hasUserContext: false,
            userSelectedTrade: null,
        });
        expect(result.imagesInRequest).toBe(1);
        expect(result.imagesAfterTier).toBe(1);
    });
});

describe('buildDiagnoseContents — image first message', () => {
    it('emits a user turn with inline image data + image prompt text', async () => {
        const result = await buildDiagnoseContents({
            image: DATA_PNG,
            attachmentImages: [],
            textQuery: 'spot the leak',
            history: [],
            initialImageDescription: '',
            instructionPrefix: 'SYSTEM\n\n',
            isTextOnly: false,
            isProviderHydration: false,
            hasUserContext: false,
            userSelectedTrade: null,
        });
        expect(result.imagesInRequest).toBe(1);
        expect(result.imagesAfterTier).toBe(1);
        const userTurn = result.contents.find((c) => c.role === 'user');
        expect(userTurn?.parts.some((p) => p.inlineData)).toBe(true);
        expect(userTurn?.parts.some((p) => typeof p.text === 'string' && p.text.includes('SYSTEM')))
            .toBe(true);
    });

    it('includes attachments alongside the primary image', async () => {
        const result = await buildDiagnoseContents({
            image: DATA_PNG,
            attachmentImages: [DATA_PNG, DATA_PNG],
            textQuery: 'multiple shots',
            history: [],
            initialImageDescription: '',
            instructionPrefix: 'SYSTEM\n\n',
            isTextOnly: false,
            isProviderHydration: false,
            hasUserContext: false,
            userSelectedTrade: null,
        });
        expect(result.imagesInRequest).toBe(3);
    });
});

describe('buildDiagnoseContents — image follow-up', () => {
    it('appends history turns after the image turn', async () => {
        const result = await buildDiagnoseContents({
            image: DATA_PNG,
            attachmentImages: [],
            textQuery: 'follow up with new photo',
            history: [
                { role: 'user', content: 'previous message' },
                { role: 'assistant', content: 'previous answer' },
            ],
            initialImageDescription: '',
            instructionPrefix: 'SYSTEM\n\n',
            isTextOnly: false,
            isProviderHydration: false,
            hasUserContext: false,
            userSelectedTrade: null,
        });
        // image turn + 2 history turns
        const userTurns = result.contents.filter((c) => c.role === 'user');
        const modelTurns = result.contents.filter((c) => c.role === 'model');
        expect(userTurns.length).toBeGreaterThanOrEqual(2);
        expect(modelTurns.length).toBe(1);
    });
});

describe('buildDiagnoseContents — provider hydration', () => {
    it('uses the hydration prompt when isProviderHydration is true and no history', async () => {
        const result = await buildDiagnoseContents({
            image: DATA_PNG,
            attachmentImages: [],
            textQuery: 'show me providers',
            history: [],
            initialImageDescription: '',
            instructionPrefix: 'SYSTEM\n\n',
            isTextOnly: false,
            isProviderHydration: true,
            hasUserContext: false,
            userSelectedTrade: null,
        });
        const userTurn = result.contents.find((c) => c.role === 'user');
        expect(userTurn).toBeDefined();
        // Provider hydration prompt is distinct from regular image-first prompt;
        // we just verify the call shape produces at least one text part.
        expect(
            userTurn?.parts.some((p) => typeof p.text === 'string' && p.text.length > 0),
        ).toBe(true);
    });
});
