import { describe, it, expect } from 'vitest';
import { PLAN_IDS, PLANS, isPlanId, planLimits, toPlanId, type PlanId } from '@/lib/pro/plans';

describe('PLAN_IDS', () => {
    it('is exactly the three known tiers in order', () => {
        expect(PLAN_IDS).toEqual(['starter', 'team', 'business']);
    });
});

describe('isPlanId', () => {
    it('accepts the three known plan ids', () => {
        expect(isPlanId('starter')).toBe(true);
        expect(isPlanId('team')).toBe(true);
        expect(isPlanId('business')).toBe(true);
    });

    it('rejects unknown strings and non-strings', () => {
        expect(isPlanId('premium')).toBe(false);
        expect(isPlanId('')).toBe(false);
        expect(isPlanId(null)).toBe(false);
        expect(isPlanId(undefined)).toBe(false);
        expect(isPlanId(123)).toBe(false);
        expect(isPlanId({})).toBe(false);
    });
});

describe('toPlanId', () => {
    it('returns the value when it is a valid plan id', () => {
        expect(toPlanId('starter')).toBe('starter');
        expect(toPlanId('team')).toBe('team');
        expect(toPlanId('business')).toBe('business');
    });

    it('defaults to starter for anything unknown', () => {
        expect(toPlanId('premium')).toBe('starter');
        expect(toPlanId(null)).toBe('starter');
        expect(toPlanId(undefined)).toBe('starter');
        expect(toPlanId(42)).toBe('starter');
    });
});

describe('planLimits', () => {
    it('returns the seat and radius limits for each tier', () => {
        expect(planLimits('starter')).toEqual({ maxSeats: 1, maxRadiusKm: 20 });
        expect(planLimits('team')).toEqual({ maxSeats: 5, maxRadiusKm: 35 });
        expect(planLimits('business')).toEqual({ maxSeats: 25, maxRadiusKm: 50 });
    });

    it('limits increase monotonically across tiers', () => {
        const order: PlanId[] = ['starter', 'team', 'business'];
        for (let i = 1; i < order.length; i++) {
            expect(planLimits(order[i]).maxSeats).toBeGreaterThan(
                planLimits(order[i - 1]).maxSeats,
            );
            expect(planLimits(order[i]).maxRadiusKm).toBeGreaterThanOrEqual(
                planLimits(order[i - 1]).maxRadiusKm,
            );
        }
    });
});

describe('PLANS metadata', () => {
    it('keys match each plan id and the starter tier is free', () => {
        for (const id of PLAN_IDS) {
            expect(PLANS[id].id).toBe(id);
            expect(typeof PLANS[id].name).toBe('string');
            expect(PLANS[id].features.length).toBeGreaterThan(0);
        }
        expect(PLANS.starter.priceZar).toBe(0);
        expect(PLANS.team.priceZar).toBeGreaterThan(0);
        expect(PLANS.business.priceZar).toBeGreaterThan(PLANS.team.priceZar);
    });
});
