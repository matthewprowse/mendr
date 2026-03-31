const BANNED_TYPES = new Set<string>([
    'cannabis_store',
    'marijuana_dispensary',
    'liquor_store',
    'bar',
    'restaurant',
    'cafe',
    'coffee_shop',
    'night_club',
    'spa',
    'hair_salon',
    'beauty_salon',
    'nail_salon',
    'clothing_store',
    'shoe_store',
    'supermarket',
    'grocery_or_supermarket',
]);

const BANNED_KEYWORDS = [
    'cannabis',
    'marijuana',
    'weed',
    'dispensary',
    'vape',
    'coffee',
    'restaurant',
    'bar ',
    ' bar',
    'cocktail',
    'nail bar',
    'hair salon',
    'beauty',
];

// R8: Expanded to cover trades that were incorrectly rejected by the service keyword gate.
// Missing trades included: waterproofing, damp proofing, glazing, solar, irrigation, etc.
const SERVICE_KEYWORDS = [
    'electric',
    'plumb',
    'geyser',
    'drain',
    'sewer',
    'gate',
    'garage door',
    'roof',
    'gutter',
    'tile',
    'floor',
    'flooring',
    'paint',
    'pool',
    'locksmith',
    'waste',
    'rubble',
    'removal',
    'weld',
    'carpentry',
    'woodwork',
    'builder',
    'construction',
    'contractor',
    'handyman',
    'borehole',
    'well',
    'drill',
    'pump',
    // Added in R8:
    'waterproof',
    'damp',
    'glazing',
    'glass',
    'solar',
    'irrigation',
    'insulation',
    'scaffold',
    'thatch',
    'paving',
    'concrete',
    'hvac',
    'air condition',
    'pest',
    'landscape',
    'garden',
    'fence',
    'alarm',
    'cctv',
    'render',
    'plaster',
    'ceiling',
    'gutter',
    'awning',
];

export function isProviderRelevantForTrade(params: {
    place: any;
    aiData: any;
    cached: any;
    tradeNorm: string;
    isBoreholeLikeDetail: boolean;
    mode?: 'strict' | 'relaxed';
}): boolean {
    const { place, aiData, cached, tradeNorm, isBoreholeLikeDetail, mode = 'strict' } = params;
    const typesRaw: string[] = (place.types || []).map((t: string) =>
        (t || '').toString().toLowerCase()
    );
    const typesText: string[] = typesRaw.map((t) => t.replace(/_/g, ' '));
    if (typesRaw.some((t) => BANNED_TYPES.has(t))) return false;

    const servicesFromAi = Array.isArray(aiData?.services)
        ? (aiData.services as { short?: string; full?: string }[])
        : [];
    const servicesFromCache = Array.isArray(cached?.services)
        ? (cached.services as { short?: string; full?: string }[])
        : [];
    const servicesText = [...servicesFromAi, ...servicesFromCache]
        .flatMap((s) => [s.short, s.full])
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    const name = (aiData?.name || place.displayName?.text || cached?.name || '')
        .toString()
        .toLowerCase();

    const haystack = [
        name,
        servicesText,
        ...typesRaw,
        ...typesText,
        (place.formattedAddress || '').toString().toLowerCase(),
    ]
        .join(' ')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (BANNED_KEYWORDS.some((kw) => haystack.includes(kw))) return false;
    if (mode === 'strict' && !SERVICE_KEYWORDS.some((kw) => haystack.includes(kw))) return false;

    if (tradeNorm) {
        if (tradeNorm.includes('plumb')) {
            if (isBoreholeLikeDetail) {
                const ok =
                    haystack.includes('borehole') ||
                    haystack.includes('well drill') ||
                    haystack.includes('well-drill') ||
                    (haystack.includes('well') && haystack.includes('drill')) ||
                    haystack.includes('drill') ||
                    haystack.includes('pump') ||
                    haystack.includes('water well');
                if (!ok) return false;
            } else if (
                mode === 'strict' &&
                !haystack.includes('plumb') &&
                !haystack.includes('geyser') &&
                !haystack.includes('pipe') &&
                !haystack.includes('drain') &&
                !haystack.includes('leak')
            ) {
                return false;
            }
        }
        if (mode === 'strict' && tradeNorm.includes('electric') && !haystack.includes('electric')) return false;
        if (mode === 'strict' && tradeNorm.includes('locksmith') && !haystack.includes('lock')) return false;
        if (
            mode === 'strict' &&
            (tradeNorm.includes('pool') || tradeNorm.includes('swim')) &&
            !haystack.includes('pool')
        )
            return false;
        if (mode === 'strict' && (tradeNorm.includes('paint') || tradeNorm.includes('painting')) && !haystack.includes('paint'))
            return false;

        if (tradeNorm === 'security & access' || tradeNorm.includes('security')) {
            const hasSecuritySignalInTypes = typesRaw.some((gt) => {
                const s = String(gt || '');
                return (
                    s.includes('security') ||
                    s.includes('alarm') ||
                    s.includes('surveillance') ||
                    s.includes('guard')
                );
            });
            const hasGateOrGarageSignalInTypes = typesRaw.some((gt) => {
                const s = String(gt || '');
                return s.includes('gate') || s.includes('garage_door');
            });
            if (mode === 'strict' && hasSecuritySignalInTypes && !hasGateOrGarageSignalInTypes) return false;
        }
    }

    return true;
}
