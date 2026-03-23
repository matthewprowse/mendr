export function buildSearchCacheKey(input: {
    lat: number;
    lng: number;
    tradeNorm: string;
    detailKeyForCache: string;
    radius: number;
}): string {
    const latR = Math.round(Number(input.lat) * 1000) / 1000;
    const lngR = Math.round(Number(input.lng) * 1000) / 1000;
    return `search_${latR}_${lngR}_${input.tradeNorm}_${input.detailKeyForCache}_${input.radius}`;
}
