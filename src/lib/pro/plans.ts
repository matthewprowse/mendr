/**
 * Mendr Pro plan tiers (Phase 10). Selection is live but BILLING IS NOT BUILT —
 * no payment is taken and nobody is charged. The limits here are enforced in the
 * app (team seats, service-area radius); see the Pro Portal plan doc, Phase 10.
 *
 * This module is the single source of truth for plan limits and copy. Tune the
 * numbers here and every enforcement point and the plan picker follow.
 */

export type PlanId = 'starter' | 'team' | 'business';

export const PLAN_IDS: readonly PlanId[] = ['starter', 'team', 'business'] as const;

export type PlanLimits = {
    /** Max team members (active + pending invites), including the owner. */
    maxSeats: number;
    /** Max service-area radius in km. */
    maxRadiusKm: number;
};

export type PlanInfo = {
    id: PlanId;
    name: string;
    /** Indicative monthly price in ZAR. Not charged yet — shown for context. */
    priceZar: number;
    blurb: string;
    limits: PlanLimits;
    features: string[];
};

export const PLANS: Record<PlanId, PlanInfo> = {
    starter: {
        id: 'starter',
        name: 'Starter',
        priceZar: 0,
        blurb: 'For a solo specialist getting started.',
        limits: { maxSeats: 1, maxRadiusKm: 20 },
        features: ['1 team seat', 'Service area up to 20 km', 'Leads, quotes and invoices'],
    },
    team: {
        id: 'team',
        name: 'Team',
        priceZar: 499,
        blurb: 'For a small crew covering more ground.',
        limits: { maxSeats: 5, maxRadiusKm: 35 },
        features: ['Up to 5 team seats', 'Service area up to 35 km', 'Everything in Starter'],
    },
    business: {
        id: 'business',
        name: 'Business',
        priceZar: 1299,
        blurb: 'For an established business across the region.',
        limits: { maxSeats: 25, maxRadiusKm: 50 },
        features: ['Up to 25 team seats', 'Service area up to 50 km', 'Everything in Team'],
    },
};

export function isPlanId(value: unknown): value is PlanId {
    return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export function planLimits(plan: PlanId): PlanLimits {
    return PLANS[plan].limits;
}

/** Normalise an unknown DB value to a plan id, defaulting to starter. */
export function toPlanId(value: unknown): PlanId {
    return isPlanId(value) ? value : 'starter';
}
