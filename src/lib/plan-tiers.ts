/**
 * Tiered plan configuration for Scandio Pro (Phase 3).
 * Fee, seat limits, and homeowner-facing badge + copy.
 */

export type PlanTierKey = 'solo_starter' | 'team_lite' | 'pro_team' | 'enterprise';

export interface PlanTierInfo {
  key: PlanTierKey;
  label: string;
  feeMonthly: number;
  feeFormatted: string;
  seatLimit: number | null; // null = unlimited
  badgeEarned: string;
  badgeCopy: string;
}

export const PLAN_TIERS: Record<PlanTierKey, PlanTierInfo> = {
  solo_starter: {
    key: 'solo_starter',
    label: 'Solo Starter',
    feeMonthly: 149,
    feeFormatted: 'R149/mo',
    seatLimit: 1,
    badgeEarned: 'ID Verified',
    badgeCopy:
      "We have their SA ID and Trade Cert on file. They are who they say they are.",
  },
  team_lite: {
    key: 'team_lite',
    label: 'Team Lite',
    feeMonthly: 399,
    feeFormatted: 'R399/mo',
    seatLimit: 3,
    badgeEarned: 'Quality Assured',
    badgeCopy:
      "This team has 5+ completed jobs on Scandio with 4+ star ratings.",
  },
  pro_team: {
    key: 'pro_team',
    label: 'Pro Team',
    feeMonthly: 799,
    feeFormatted: 'R799/mo',
    seatLimit: 6,
    badgeEarned: 'Verified Professional',
    badgeCopy:
      "Vetted for Cleanliness & Punctuality. Covered by Scandio's basic mediation.",
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise',
    feeMonthly: 1499,
    feeFormatted: 'R1,499/mo',
    seatLimit: null,
    badgeEarned: 'Scandio Elite',
    badgeCopy:
      "Top-tier reliability. Full background checks on all seats. Priority Support.",
  },
};

const DEFAULT_TIER: PlanTierKey = 'solo_starter';

/**
 * Returns plan tier info for a given tier key.
 * Falls back to solo_starter for unknown or null.
 */
export function getPlanTierInfo(
  tier: PlanTierKey | string | null | undefined
): PlanTierInfo {
  if (!tier || typeof tier !== 'string') return PLAN_TIERS[DEFAULT_TIER];
  const key = tier as PlanTierKey;
  return PLAN_TIERS[key] ?? PLAN_TIERS[DEFAULT_TIER];
}

/**
 * Whether the provider can add more seats (under limit).
 */
export function canAddSeat(
  tier: PlanTierKey | string | null | undefined,
  currentSeatCount: number
): boolean {
  const info = getPlanTierInfo(tier);
  if (info.seatLimit === null) return true;
  return currentSeatCount < info.seatLimit;
}

/**
 * Human-readable seat limit for display (e.g. "1", "Up to 3", "Unlimited").
 */
export function formatSeatLimit(
  tier: PlanTierKey | string | null | undefined
): string {
  const info = getPlanTierInfo(tier);
  if (info.seatLimit === null) return 'Unlimited';
  if (info.seatLimit === 1) return '1';
  return `Up to ${info.seatLimit}`;
}
