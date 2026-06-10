const TRADE_QUERY_MAP: Record<string, string> = {
    electrical: 'Electrician',
    plumbing: 'Plumber',
    // R10: Security is split at the buildProviderQuery level by tradeDetail.
    // This entry is only used as a fallback when tradeDetail is absent.
    security: 'Gate and garage door contractor',
    'security & access': 'Gate and garage door contractor',
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
    // New canonical trades.
    'appliance repair': 'Appliance Repair Technician',
    appliance: 'Appliance Repair Technician',
    'glazing, glass & aluminium': 'Glazier',
    glazing: 'Glazier',
    glazier: 'Glazier',
    'borehole, water & pumps': 'Borehole and pump contractor',
    borehole: 'Borehole and pump contractor',
    'pest control': 'Pest Control Service',
    pest: 'Pest Control Service',
    waterproofing: 'Waterproofing contractor',
    'solar & backup power': 'Solar installer',
    solar: 'Solar installer',
    'paving & driveways': 'Paving Contractor',
    'gas installation & repair': 'Gas Installer',
    gas: 'Gas Installer',
};

const TRADE_SERVICE_LABEL_MAP: Record<string, string> = {
    electrical: 'Electrical',
    plumbing: 'Plumbing',
    security: 'Security',
    'security & access': 'Security',
    'building & construction': 'Building & Construction',
    'carpentry & woodwork': 'Carpentry & Woodwork',
    'flooring & tiling': 'Flooring & Tiling',
    'general handyman': 'General Handyman',
    'locksmith services': 'Locksmith Services',
    painting: 'Painting',
    'pool maintenance': 'Pool Maintenance',
    'rubble & waste removal': 'Rubble & Waste Removal',
    welding: 'Welding',
    'appliance repair': 'Appliance Repair',
    'air conditioning': 'Air Conditioning',
    'glazing, glass & aluminium': 'Glazing, Glass & Aluminium',
    'borehole, water & pumps': 'Borehole, Water & Pumps',
    'pest control': 'Pest Control',
    waterproofing: 'Waterproofing',
    'solar & backup power': 'Solar & Backup Power',
    roofing: 'Roofing',
    'paving & driveways': 'Paving & Driveways',
    'gas installation & repair': 'Gas Installation & Repair',
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

    // R10: Security — differentiate gate motor vs. garage door based on tradeDetail.
    // A gate motor specialist (CENTURION system technician) is a different contractor from a
    // garage door installer. Using a single query for both wastes result slots.
    function resolveSecurityAccessQuery(): string {
        if (!tradeNorm.includes('security')) return '';
        if (tradeDetailNorm.includes('gate') || tradeDetailNorm.includes('motor')) {
            return 'Gate motor repair contractor';
        }
        if (tradeDetailNorm.includes('garage')) {
            return 'Garage door repair contractor';
        }
        if (tradeDetailNorm.includes('intercom') || tradeDetailNorm.includes('buzzer')) {
            return 'Intercom and access control contractor';
        }
        return 'Gate and garage door contractor';
    }

    const securityQuery = resolveSecurityAccessQuery();

    function overrideBaseQueryFromDetail(): string {
        if (!tradeDetailNorm) return '';
        // For plumbing diagnoses, generic "leak" wording is common and should
        // not override away from plumber-focused search queries.
        if (tradeNorm.includes('plumb')) return '';

        const overrides: Array<{ keywords: string[]; query: string }> = [
            { keywords: ['roof', 'roofer', 'gutter', 'guttering', 'thatch'], query: 'Roofing Contractor' },
            { keywords: ['waterproof', 'damp proof', 'damp'], query: 'Waterproofing contractor' },
            { keywords: ['glazing', 'glass', 'window', 'windows'], query: 'Glazier' },
            { keywords: ['paving', 'concrete', 'slab', 'driveway'], query: 'Paving Contractor' },
            { keywords: ['plaster', 'render', 'ceiling', 'drywall'], query: 'Plasterer' },
            { keywords: ['solar', 'inverter', 'battery'], query: 'Solar installer' },
            { keywords: ['irrigation', 'sprinkler', 'borehole pump', 'pump'], query: 'Irrigation contractor' },
            { keywords: ['fence', 'fencing', 'gate'], query: 'Fencing contractor' },
            { keywords: ['aircon', 'air conditioning', 'hvac'], query: 'Air conditioning contractor' },
        ];

        for (const o of overrides) {
            if (o.keywords.some((k) => tradeDetailNorm.includes(k))) return o.query;
        }
        return '';
    }

    const detailOverrideQuery = overrideBaseQueryFromDetail();

    const baseSearchQuery = isBoreholeLikeDetail
        ? 'Borehole drilling contractor'
        : securityQuery || detailOverrideQuery || TRADE_QUERY_MAP[tradeNorm] || input.trade;

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
