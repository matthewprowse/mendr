/**
 * Canonical service labels. This TypeScript constant is the single source of
 * truth (the Supabase `services` table was removed). The diagnosis classifier,
 * taxonomy, provider matching, and stats all derive from this list.
 */
export const SERVICE_LABELS = [
    'Electrical',
    'Plumbing',
    'Security',
    'Building & Construction',
    'Carpentry & Woodwork',
    'Flooring & Tiling',
    'Garden & Landscaping',
    'General Handyman',
    'Locksmith Services',
    'Painting',
    'Pool Maintenance',
    'Rubble & Waste Removal',
    'Welding',
    'Appliance Repair',
    'Air Conditioning',
    'Glazing, Glass & Aluminium',
    'Borehole, Water & Pumps',
    'Pest Control',
    'Waterproofing',
    'Solar & Backup Power',
    'Roofing',
    'Paving & Driveways',
    'Gas Installation & Repair',
] as const;

/** Maps AI trade variations (lowercase keywords) to canonical Supabase service label. */
const TRADE_TO_SERVICE: Record<string, (typeof SERVICE_LABELS)[number]> = {
    electrical: 'Electrical',
    electrician: 'Electrical',
    plumbing: 'Plumbing',
    plumber: 'Plumbing',
    geyser: 'Plumbing',
    drain: 'Plumbing',
    pipe: 'Plumbing',
    security: 'Security',
    'security & access': 'Security',
    'security and access': 'Security',
    gate: 'Security',
    garage: 'Security',
    'garage door': 'Security',
    'garage doors': 'Security',
    'garage spring': 'Security',
    'garage springs': 'Security',
    'torsion spring': 'Security',
    'extension spring': 'Security',
    'up and over': 'Security',
    'tilt door': 'Security',
    'canopy door': 'Security',
    'roller shutter': 'Security',
    'roller shutters': 'Security',
    'shutter door': 'Security',
    shutter: 'Security',
    'gate track': 'Security',
    'gate roller': 'Security',
    'gate hinge': 'Security',
    'gate arm': 'Security',
    automation: 'Security',
    'gate motor': 'Security',
    cctv: 'Security',
    alarm: 'Security',
    fencing: 'Security',
    intercom: 'Security',
    'building & construction': 'Building & Construction',
    'building and construction': 'Building & Construction',
    builder: 'Building & Construction',
    contractor: 'Building & Construction',
    'carpentry & woodwork': 'Carpentry & Woodwork',
    'carpentry and woodwork': 'Carpentry & Woodwork',
    carpenter: 'Carpentry & Woodwork',
    'flooring & tiling': 'Flooring & Tiling',
    'flooring and tiling': 'Flooring & Tiling',
    tiler: 'Flooring & Tiling',
    flooring: 'Flooring & Tiling',
    tiling: 'Flooring & Tiling',
    'garden & landscaping': 'Garden & Landscaping',
    'garden and landscaping': 'Garden & Landscaping',
    garden: 'Garden & Landscaping',
    landscaping: 'Garden & Landscaping',
    gardener: 'Garden & Landscaping',
    'garden service': 'Garden & Landscaping',
    'tree felling': 'Garden & Landscaping',
    'tree cutting': 'Garden & Landscaping',
    arborist: 'Garden & Landscaping',
    irrigation: 'Garden & Landscaping',
    'lawn care': 'Garden & Landscaping',
    'general handyman': 'General Handyman',
    handyman: 'General Handyman',
    'locksmith services': 'Locksmith Services',
    locksmith: 'Locksmith Services',
    painting: 'Painting',
    painter: 'Painting',
    'pool maintenance': 'Pool Maintenance',
    pool: 'Pool Maintenance',
    'rubble & waste removal': 'Rubble & Waste Removal',
    'rubble and waste removal': 'Rubble & Waste Removal',
    waste: 'Rubble & Waste Removal',
    'waste removal': 'Rubble & Waste Removal',
    rubble: 'Rubble & Waste Removal',
    welding: 'Welding',
    welder: 'Welding',
    // Gap fixes for existing trades (previously fell through to null).
    construction: 'Building & Construction',
    carpentry: 'Carpentry & Woodwork',
    'home maintenance': 'General Handyman',
    'general home maintenance': 'General Handyman',
    // Appliance Repair
    appliance: 'Appliance Repair',
    'appliance repair': 'Appliance Repair',
    fridge: 'Appliance Repair',
    refrigerator: 'Appliance Repair',
    freezer: 'Appliance Repair',
    'washing machine': 'Appliance Repair',
    'tumble dryer': 'Appliance Repair',
    dishwasher: 'Appliance Repair',
    microwave: 'Appliance Repair',
    oven: 'Appliance Repair',
    stove: 'Appliance Repair',
    // Air Conditioning (gas variants below win by longest-match)
    'air conditioning': 'Air Conditioning',
    'air conditioner': 'Air Conditioning',
    aircon: 'Air Conditioning',
    hvac: 'Air Conditioning',
    'heat pump': 'Air Conditioning',
    // Glazing, Glass & Aluminium
    glazing: 'Glazing, Glass & Aluminium',
    glazier: 'Glazing, Glass & Aluminium',
    glass: 'Glazing, Glass & Aluminium',
    'window glass': 'Glazing, Glass & Aluminium',
    'broken window': 'Glazing, Glass & Aluminium',
    'aluminium window': 'Glazing, Glass & Aluminium',
    'aluminium door': 'Glazing, Glass & Aluminium',
    'shower door': 'Glazing, Glass & Aluminium',
    mirror: 'Glazing, Glass & Aluminium',
    // Borehole, Water & Pumps
    borehole: 'Borehole, Water & Pumps',
    'submersible pump': 'Borehole, Water & Pumps',
    'pressure pump': 'Borehole, Water & Pumps',
    'booster pump': 'Borehole, Water & Pumps',
    'water pump': 'Borehole, Water & Pumps',
    'water tank pump': 'Borehole, Water & Pumps',
    rainwater: 'Borehole, Water & Pumps',
    'water filtration': 'Borehole, Water & Pumps',
    // Pest Control
    pest: 'Pest Control',
    'pest control': 'Pest Control',
    rodent: 'Pest Control',
    termite: 'Pest Control',
    borer: 'Pest Control',
    cockroach: 'Pest Control',
    fumigation: 'Pest Control',
    'bee removal': 'Pest Control',
    wasp: 'Pest Control',
    pigeon: 'Pest Control',
    // Waterproofing
    waterproofing: 'Waterproofing',
    waterproof: 'Waterproofing',
    'damp proofing': 'Waterproofing',
    'rising damp': 'Waterproofing',
    'penetrating damp': 'Waterproofing',
    damp: 'Waterproofing',
    'torch-on': 'Waterproofing',
    membrane: 'Waterproofing',
    // Solar & Backup Power
    solar: 'Solar & Backup Power',
    'solar panel': 'Solar & Backup Power',
    'solar geyser': 'Solar & Backup Power',
    inverter: 'Solar & Backup Power',
    'battery backup': 'Solar & Backup Power',
    'backup power': 'Solar & Backup Power',
    'ups system': 'Solar & Backup Power',
    // Roofing
    roof: 'Roofing',
    roofing: 'Roofing',
    'roof leak': 'Roofing',
    'roof repair': 'Roofing',
    'roof tiles': 'Roofing',
    gutter: 'Roofing',
    gutters: 'Roofing',
    ibr: 'Roofing',
    fascia: 'Roofing',
    ridging: 'Roofing',
    // Paving & Driveways
    paving: 'Paving & Driveways',
    driveway: 'Paving & Driveways',
    cobble: 'Paving & Driveways',
    cobblestone: 'Paving & Driveways',
    asphalt: 'Paving & Driveways',
    'tar surfacing': 'Paving & Driveways',
    'concrete driveway': 'Paving & Driveways',
    // Gas Installation & Repair (longest-match beats appliance/geyser/plumbing keywords)
    gas: 'Gas Installation & Repair',
    'gas installation': 'Gas Installation & Repair',
    'gas geyser': 'Gas Installation & Repair',
    'gas hob': 'Gas Installation & Repair',
    'gas stove': 'Gas Installation & Repair',
    'gas oven': 'Gas Installation & Repair',
    'gas fireplace': 'Gas Installation & Repair',
    'gas leak': 'Gas Installation & Repair',
    lpg: 'Gas Installation & Repair',
};

/**
 * Maps AI trade string (e.g. "Garage Door Installation") to canonical Supabase service label.
 * Returns the service label if found, otherwise null.
 */
export function tradeToServiceLabel(trade: string | null | undefined): string | null {
    if (!trade?.trim() || trade === 'N/A') return null;
    const t = trade.trim();
    // Exact match (case-insensitive) against canonical labels
    const exact = SERVICE_LABELS.find((s) => s.toLowerCase() === t.toLowerCase());
    if (exact) return exact;
    // Keyword match: check longest phrases first so "garage door" matches before "garage"
    const lower = t.toLowerCase();
    const entries = Object.entries(TRADE_TO_SERVICE).sort((a, b) => b[0].length - a[0].length);
    for (const [keyword, label] of entries) {
        if (lower === keyword || lower.includes(keyword)) return label;
    }
    return null;
}

/** Converts a string to Title Case (e.g. "garage door repair" → "Garage Door Repair"). */
export function toTitleCase(str: string | null | undefined): string {
    if (!str?.trim()) return str ?? '';
    return str
        .trim()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}
