/**
 * Ported from scripts/test-match-flow.ts — withTimeout race semantics.
 */
import { describe, it, expect } from 'vitest';
import { withTimeout } from '../review-enrichment';

describe('withTimeout', () => {
    it('resolves to null when the underlying promise exceeds the deadline', async () => {
        const slow = withTimeout(
            new Promise<string>((resolve) => setTimeout(() => resolve('late'), 40)),
            5
        );
        expect(await slow).toBeNull();
    });

    it('resolves with the value when the promise settles before the deadline', async () => {
        const fast = withTimeout(Promise.resolve('ok'), 50);
        expect(await fast).toBe('ok');
    });
});
