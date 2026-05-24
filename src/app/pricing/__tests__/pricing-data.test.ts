import { describe, it, expect } from 'vitest';
import {
    PRICING_TIERS,
    VERIFIED_ADD_ON,
    PRICING_FAQS,
} from '../pricing-data';

describe('PRICING_TIERS', () => {
    it('contains exactly 4 tiers', () => {
        expect(PRICING_TIERS).toHaveLength(4);
    });

    it('lists the canonical four tier names in canonical order', () => {
        expect(PRICING_TIERS.map((t) => t.name)).toEqual([
            'Free',
            'Starter',
            'Pro',
            'Business',
        ]);
    });

    it('uses the strategy-doc prices: 0, 299, 699, 1499', () => {
        expect(PRICING_TIERS.map((t) => t.price)).toEqual([0, 299, 699, 1499]);
    });

    it('flags Pro as the featured "Most popular" tier', () => {
        const pro = PRICING_TIERS.find((t) => t.name === 'Pro');
        expect(pro).toBeDefined();
        expect(pro?.featured).toBe(true);
        expect(pro?.badge).toBeTruthy();
    });

    it('flags no other tier as featured', () => {
        const featured = PRICING_TIERS.filter((t) => t.featured);
        expect(featured).toHaveLength(1);
        expect(featured[0].name).toBe('Pro');
    });

    it('gives every tier an included list of at least 4 items', () => {
        for (const tier of PRICING_TIERS) {
            expect(Array.isArray(tier.included)).toBe(true);
            expect(tier.included.length).toBeGreaterThanOrEqual(4);
        }
    });

    it('attaches an annual price (with saving) to every paid tier', () => {
        const paidTiers = PRICING_TIERS.filter((t) => t.price > 0);
        for (const tier of paidTiers) {
            expect(tier.annualPrice).toBeDefined();
            expect(tier.annualSaving).toBeDefined();
            expect(tier.annualPrice).toBeGreaterThan(0);
            expect(tier.annualSaving).toBeGreaterThan(0);
        }
    });

    it('points every tier CTA at the contractor application flow', () => {
        for (const tier of PRICING_TIERS) {
            expect(tier.ctaHref).toBe('/contractors/network');
            expect(tier.ctaLabel.toLowerCase()).toContain('apply');
        }
    });
});

describe('VERIFIED_ADD_ON', () => {
    it('is exposed as a separate const, not as a fifth tier', () => {
        const names = PRICING_TIERS.map((t) => t.name);
        expect(names).not.toContain('Verified');
        expect(VERIFIED_ADD_ON.name).toBe('Verified');
    });

    it('is priced at R400 / month', () => {
        expect(VERIFIED_ADD_ON.price).toBe(400);
    });

    it('declares at least 3 verification capabilities', () => {
        expect(VERIFIED_ADD_ON.included.length).toBeGreaterThanOrEqual(3);
    });

    it('routes its CTA to the contractor application flow', () => {
        expect(VERIFIED_ADD_ON.ctaHref).toBe('/contractors/network');
    });
});

describe('PRICING_FAQS', () => {
    it('contains at least 4 questions', () => {
        expect(PRICING_FAQS.length).toBeGreaterThanOrEqual(4);
    });

    it('answers the no-commission question', () => {
        const hit = PRICING_FAQS.some(
            (faq) => faq.q.toLowerCase().includes('commission') || faq.a.toLowerCase().includes('commission')
        );
        expect(hit).toBe(true);
    });
});
