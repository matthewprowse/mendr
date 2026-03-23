import type { ProviderItem } from './contracts';

function distanceKmNum(p: { distanceKm: number | null }) {
    return p.distanceKm != null ? p.distanceKm : 999;
}

export function rankProviders(providers: ProviderItem[], limit = 25): ProviderItem[] {
    const sorted = [...providers].sort((a, b) => {
        const ratingA = a.rating ?? 0;
        const ratingB = b.rating ?? 0;
        const reviewsA = a.ratingCount ?? 0;
        const reviewsB = b.ratingCount ?? 0;
        const distA = distanceKmNum(a);
        const distB = distanceKmNum(b);
        const scoreA = ratingA * 20 + Math.min(reviewsA, 100) * 0.2 - distA * 0.3;
        const scoreB = ratingB * 20 + Math.min(reviewsB, 100) * 0.2 - distB * 0.3;
        return scoreB - scoreA;
    });
    return sorted.slice(0, limit);
}
