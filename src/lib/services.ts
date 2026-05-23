/**
 * Canonical service labels — must match the `label` column in the Supabase `services` table exactly.
 * Supabase is the source of truth. Update here whenever the DB changes.
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
