const GENERIC_PLACE_TYPES = new Set([
    'point_of_interest',
    'establishment',
    'place',
    'store',
    'local_business',
    'place_of_worship',
    'food',
]);

const TYPE_TO_LABEL: Record<string, string> = {
    plumber: 'Plumber',
    plumbing_contractor: 'Plumbing',
    electrician: 'Electrician',
    electrical_contractor: 'Electrical',
    general_contractor: 'General Contractor',
    roofing_contractor: 'Roofing',
    painter: 'Painter',
    moving_company: 'Moving',
    locksmith: 'Locksmith',
    handyman: 'Handyman',
    carpenter: 'Carpenter',
    real_estate_agency: 'Real Estate',
    hvac_contractor: 'HVAC',
    swimming_pool_contractor: 'Pool Service',
    pest_control: 'Pest Control',
    landscaping: 'Landscaping',
    garage_door_repair: 'Garage Door',
    appliance_repair: 'Appliance Repair',
    flooring_store: 'Flooring',
    tile_store: 'Tiling',
    roofing: 'Roofing',
    painter_decorator: 'Painting',
    waste_management: 'Waste Removal',
    rubbish_dump: 'Waste Removal',
};

export function getPlaceServices(types: string[] | undefined): { short: string; full: string }[] {
    if (!Array.isArray(types) || types.length === 0) return [];
    const seen = new Set<string>();
    return types
        .filter((t) => t && !GENERIC_PLACE_TYPES.has(t))
        .map((t: string) => {
            const key = t.toLowerCase().replace(/\s+/g, '_');
            const label =
                TYPE_TO_LABEL[key] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            return { short: label, full: label };
        })
        .filter((s) => {
            if (seen.has(s.short)) return false;
            seen.add(s.short);
            return true;
        });
}
