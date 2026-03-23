const TRADE_QUERY_MAP: Record<string, string> = {
    electrical: 'Electrician',
    plumbing: 'Plumber',
    'security & access': 'Garage door repair contractor',
    'building & construction': 'Builder',
    'carpentry & woodwork': 'Carpenter',
    'flooring & tiling': 'Flooring Contractor',
    'general handyman': 'Handyman',
    'locksmith services': 'Locksmith',
    painting: 'Painter',
    'pool maintenance': 'Pool Service',
    'rubble & waste removal': 'Waste Removal',
    welding: 'Welder',
    plumber: 'Plumber',
    'leaking pipe': 'Plumber',
    electrician: 'Electrician',
    'gate technician': 'Gate Repair Service',
    'gate repair': 'Gate Repair Service',
    'gate motor': 'Gate Repair Service',
    'garage door': 'Garage door repair contractor',
    'garage doors': 'Garage door repair contractor',
    roofing: 'Roofing Contractor',
    roofer: 'Roofing Contractor',
    guttering: 'Roofing Contractor',
    painter: 'Painter',
    carpenter: 'Carpenter',
    handyman: 'Handyman',
    'air conditioning': 'AC Repair',
    'ac repair': 'AC Repair',
    locksmith: 'Locksmith',
    tiler: 'Tiler',
    paving: 'Paving Contractor',
    pool: 'Pool Service',
    'water damage': 'Water Damage Restoration',
    builder: 'Builder',
    contractor: 'Building Contractor',
};

const TRADE_SERVICE_LABEL_MAP: Record<string, string> = {
    electrical: 'Electrical',
    plumbing: 'Plumbing',
    'security & access': 'Security & Access',
    'building & construction': 'Building & Construction',
    'carpentry & woodwork': 'Carpentry & Woodwork',
    'flooring & tiling': 'Flooring & Tiling',
    'general handyman': 'General Handyman',
    'locksmith services': 'Locksmith Services',
    painting: 'Painting',
    'pool maintenance': 'Pool Maintenance',
    'rubble & waste removal': 'Rubble & Waste Removal',
    welding: 'Welding',
};

export function buildProviderQuery(input: {
    trade: string;
    providedSearchQuery?: string;
    tradeDetail?: string;
}): {
    tradeNorm: string;
    tradeDetailRaw: string;
    tradeDetailNorm: string;
    detailKeyForCache: string;
    baseSearchQuery: string;
    searchQuery: string;
    canonicalServiceLabel: string | null;
    isBoreholeLikeDetail: boolean;
} {
    const tradeNorm = String(input.trade).toLowerCase().trim();
    const tradeDetailRaw = typeof input.tradeDetail === 'string' ? input.tradeDetail.trim() : '';
    const tradeDetailNorm = tradeDetailRaw.toLowerCase();
    const detailKeyForCache = tradeDetailNorm
        ? tradeDetailNorm.replace(/[^a-z0-9]+/g, '_').slice(0, 48)
        : 'none';

    const isBoreholeLikeDetail =
        tradeNorm.includes('plumb') &&
        (tradeDetailNorm.includes('borehole') ||
            tradeDetailNorm.includes('well') ||
            tradeDetailNorm.includes('drill'));

    const baseSearchQuery = isBoreholeLikeDetail
        ? 'Borehole drilling contractor'
        : TRADE_QUERY_MAP[tradeNorm] || input.trade;

    let searchQuery = input.providedSearchQuery || baseSearchQuery;
    if (!input.providedSearchQuery && tradeDetailNorm) {
        const detail = tradeDetailNorm.replace(/\s+/g, ' ').slice(0, 120);
        searchQuery = `${baseSearchQuery} ${detail}`.trim();
        if (searchQuery.length > 200) searchQuery = searchQuery.slice(0, 200);
    }

    const canonicalServiceLabel =
        TRADE_SERVICE_LABEL_MAP[tradeNorm] || TRADE_SERVICE_LABEL_MAP[searchQuery.toLowerCase()] || null;

    return {
        tradeNorm,
        tradeDetailRaw,
        tradeDetailNorm,
        detailKeyForCache,
        baseSearchQuery,
        searchQuery,
        canonicalServiceLabel,
        isBoreholeLikeDetail,
    };
}
