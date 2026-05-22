export type ConsolidatedRatingInput = {
    googleRating: number | null;
    googleReviewCount: number;
    scandioRating: number | null;
    scandioReviewCount: number;
};

export function getTotalReviewCount(input: ConsolidatedRatingInput): number {
    return Math.max(0, Number(input.googleReviewCount || 0) + Number(input.scandioReviewCount || 0));
}

/**
 * Weighted combined rating across Google + Mendr sources.
 * Falls back to whichever source has a valid rating when only one exists.
 */
export function getConsolidatedRating(input: ConsolidatedRatingInput): number | null {
    const googleCount = Math.max(0, Number(input.googleReviewCount || 0));
    const scandioCount = Math.max(0, Number(input.scandioReviewCount || 0));
    const total = googleCount + scandioCount;

    const hasGoogle = typeof input.googleRating === 'number' && Number.isFinite(input.googleRating);
    const hasScandio = typeof input.scandioRating === 'number' && Number.isFinite(input.scandioRating);

    if (total <= 0) {
        if (hasGoogle) return input.googleRating as number;
        if (hasScandio) return input.scandioRating as number;
        return null;
    }

    const googleWeighted = hasGoogle ? (input.googleRating as number) * googleCount : 0;
    const scandioWeighted = hasScandio ? (input.scandioRating as number) * scandioCount : 0;
    const weightedTotal = googleWeighted + scandioWeighted;

    if (weightedTotal <= 0 && !hasGoogle && !hasScandio) return null;
    return weightedTotal / total;
}
