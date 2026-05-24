import { describe, it, expect } from 'vitest';
import { metadata } from '../page';

describe('pricing page metadata', () => {
    it('exports a title containing "R299"', () => {
        expect(metadata.title).toBeDefined();
        expect(typeof metadata.title).toBe('string');
        expect(metadata.title as string).toContain('R299');
    });

    it('exports a description that mentions "no commission"', () => {
        expect(metadata.description).toBeDefined();
        expect((metadata.description as string).toLowerCase()).toContain('no commission');
    });

    it('exports a description that mentions the headline Pro and Business prices', () => {
        const description = metadata.description as string;
        expect(description).toContain('R699');
        expect(description).toContain('R1,499');
    });

    it('declares /pricing as the canonical URL', () => {
        expect(metadata.alternates).toBeDefined();
        expect(metadata.alternates?.canonical).toBe('/pricing');
    });
});
