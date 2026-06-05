/**
 * Static cost-range estimates for each taxonomy subcategory.
 * Ranges are in South African Rand, reflecting Western Cape 2025/26 market rates
 * for labour + basic materials. Large-scope jobs (extensions, full damp proofing)
 * are quoted as "from R X" since final cost depends on scale.
 *
 * Update these annually — or when the taxonomy changes.
 */

export type CostEstimate = {
    /** Lower bound in Rand (inclusive). */
    min: number;
    /** Upper bound in Rand (inclusive). null = open-ended ("from R min"). */
    max: number | null;
    /** Unit context shown to the user. */
    unit: string;
    /** Optional qualifier — e.g. "per room" or "for a standard geyser". */
    note?: string;
};

const ESTIMATES: Record<string, CostEstimate> = {
    // ── Security ──────────────────────────────────────────────────────────────

    gate_motor_fault: {
        min: 800,
        max: 3_500,
        unit: 'callout + repair',
        note: 'Full motor replacement R4,000–R8,000',
    },
    garage_door_fault: {
        min: 600,
        max: 3_500,
        unit: 'repair',
        note: 'Spring replacement R800–R2,000; full motor R2,500–R5,000',
    },
    cctv_camera_system: {
        min: 2_000,
        max: 8_000,
        unit: 'supply & installation',
        note: 'Per camera R800–R2,500 including cabling',
    },
    electric_fence_fault: {
        min: 500,
        max: 2_500,
        unit: 'repair',
        note: 'Energiser replacement R1,500–R3,500',
    },
    intercom_access_control: {
        min: 800,
        max: 4_000,
        unit: 'repair or replacement',
    },

    // ── Electrical ────────────────────────────────────────────────────────────

    db_board_tripping: {
        min: 600,
        max: 3_500,
        unit: 'diagnosis + repair',
        note: 'Full DB board replacement R4,000–R10,000',
    },
    geyser_electrical: {
        min: 800,
        max: 2_500,
        unit: 'element or thermostat replacement',
    },
    lights_wiring: {
        min: 400,
        max: 2_000,
        unit: 'repair or fitting',
        note: 'COC certificate extra R800–R1,500',
    },
    load_shedding_surge: {
        min: 1_000,
        max: 5_000,
        unit: 'assessment + surge protection',
        note: 'Appliance damage assessment varies widely',
    },
    solar_inverter: {
        min: 3_000,
        max: 25_000,
        unit: 'repair or installation',
        note: 'New battery R8,000–R18,000; inverter R4,000–R12,000',
    },

    // ── Plumbing ──────────────────────────────────────────────────────────────

    geyser_fault_plumbing: {
        min: 1_500,
        max: 6_000,
        unit: 'repair or replacement',
        note: 'New 150 L geyser installed R5,500–R9,000',
    },
    burst_pipe_leak: {
        min: 800,
        max: 4_500,
        unit: 'repair',
        note: 'Underground pipe detection extra R1,500–R3,000',
    },
    blocked_drain: {
        min: 500,
        max: 2_500,
        unit: 'unblocking',
        note: 'CCTV inspection extra R1,000–R2,500',
    },
    tap_toilet_repair: {
        min: 400,
        max: 2_000,
        unit: 'repair or replacement',
    },
    water_pressure_supply: {
        min: 800,
        max: 4_000,
        unit: 'diagnosis + repair',
        note: 'Pressure valve R400–R800; borehole pump R5,000–R15,000',
    },

    // ── Building & Construction ───────────────────────────────────────────────

    roof_leak_repair: {
        min: 2_000,
        max: 12_000,
        unit: 'repair',
        note: 'Full re-roof R15,000–R60,000+',
    },
    damp_waterproofing: {
        min: 3_000,
        max: null,
        unit: 'from',
        note: 'Rising damp R5,000–R25,000; flat roof R4,000–R20,000',
    },
    wall_crack_plastering: {
        min: 800,
        max: 5_000,
        unit: 'repair',
        note: 'Full room re-plaster R8,000–R20,000',
    },
    retaining_boundary_wall: {
        min: 5_000,
        max: null,
        unit: 'from',
        note: 'Repair R5,000–R15,000; new wall from R2,500/m',
    },
    building_extensions: {
        min: 25_000,
        max: null,
        unit: 'from',
        note: 'R6,000–R12,000 per m² for formal construction',
    },

    // ── Carpentry & Woodwork ──────────────────────────────────────────────────

    door_frame_repair: {
        min: 600,
        max: 3_000,
        unit: 'repair or replacement',
    },
    builtin_cupboard: {
        min: 2_000,
        max: 15_000,
        unit: 'repair or installation',
        note: 'New BIC from R3,500 per metre',
    },
    deck_pergola: {
        min: 10_000,
        max: null,
        unit: 'from',
        note: 'Timber decking R1,500–R3,500 per m²',
    },
    window_frame_repair: {
        min: 800,
        max: 4_000,
        unit: 'repair or replacement',
    },
    general_carpentry: {
        min: 500,
        max: 3_000,
        unit: 'per job',
    },

    // ── Flooring & Tiling ─────────────────────────────────────────────────────

    tile_repair: {
        min: 600,
        max: 4_000,
        unit: 'repair',
        note: 'Full room tiling R150–R350 per m²',
    },
    grout_sealing: {
        min: 300,
        max: 1_500,
        unit: 'per job',
    },
    laminate_vinyl_floor: {
        min: 3_000,
        max: 15_000,
        unit: 'supply & lay',
        note: 'R200–R500 per m² installed',
    },
    timber_floor: {
        min: 5_000,
        max: 25_000,
        unit: 'supply & installation',
        note: 'Sanding & sealing R80–R150 per m²',
    },
    floor_screed: {
        min: 2_000,
        max: 10_000,
        unit: 'per room',
        note: 'R120–R250 per m²',
    },

    // ── General Handyman ──────────────────────────────────────────────────────

    mounting_installation: {
        min: 300,
        max: 1_200,
        unit: 'per job',
    },
    minor_home_repairs: {
        min: 300,
        max: 1_500,
        unit: 'per job',
    },
    general_handyman_jobs: {
        min: 400,
        max: 2_000,
        unit: 'per half day',
        note: 'Full day R800–R3,500',
    },

    // ── Locksmith Services ────────────────────────────────────────────────────

    lockout_emergency: {
        min: 600,
        max: 2_000,
        unit: 'callout + entry',
        note: 'After-hours surcharge R200–R500',
    },
    lock_replacement: {
        min: 400,
        max: 1_500,
        unit: 'supply & fit',
        note: 'High-security lock R1,200–R3,500 installed',
    },
    gate_padlock_security_lock: {
        min: 300,
        max: 1_200,
        unit: 'supply & fit',
    },
    safe_installation: {
        min: 1_500,
        max: 6_000,
        unit: 'supply & installation',
    },

    // ── Painting ──────────────────────────────────────────────────────────────

    interior_painting: {
        min: 3_000,
        max: 25_000,
        unit: 'per room or area',
        note: 'R30–R65 per m²; full house quote individually',
    },
    exterior_painting: {
        min: 5_000,
        max: null,
        unit: 'from',
        note: 'R35–R80 per m² depending on surface prep required',
    },
    roof_waterproof_coating: {
        min: 3_000,
        max: 20_000,
        unit: 'application',
        note: 'R45–R120 per m²',
    },
    specialty_surface_painting: {
        min: 1_500,
        max: 8_000,
        unit: 'per surface',
        note: 'Pool interior R4,000–R10,000',
    },

    // ── Pool Maintenance ──────────────────────────────────────────────────────

    pool_chemical_balance: {
        min: 500,
        max: 2_000,
        unit: 'treatment',
        note: 'Green pool recovery R800–R2,500',
    },
    pool_pump_filter: {
        min: 1_500,
        max: 8_000,
        unit: 'repair or replacement',
        note: 'New pump motor R2,500–R5,000 installed',
    },
    pool_leak: {
        min: 3_000,
        max: 15_000,
        unit: 'repair',
        note: 'Replaster (marblite) R15,000–R35,000',
    },
    pool_cleaning: {
        min: 400,
        max: 1_500,
        unit: 'per visit',
        note: 'Monthly service contract R600–R1,200/month',
    },

    // ── Garden & Landscaping ──────────────────────────────────────────────────

    lawn_maintenance: {
        min: 400,
        max: 2_500,
        unit: 'per visit',
        note: 'Monthly contract R600–R2,000/month',
    },
    tree_arborist: {
        min: 2_000,
        max: 15_000,
        unit: 'per tree',
        note: 'Large trees R5,000–R25,000; stump grinding extra R800–R2,500',
    },
    irrigation_system: {
        min: 1_500,
        max: 8_000,
        unit: 'repair or installation',
        note: 'New system R5,000–R25,000 depending on zone count',
    },
    hedge_trimming_planting: {
        min: 500,
        max: 3_000,
        unit: 'per job',
    },
    landscaping_design: {
        min: 5_000,
        max: null,
        unit: 'from',
        note: 'Soft landscaping R250–R600 per m²',
    },

    // ── Rubble & Waste Removal ────────────────────────────────────────────────

    building_rubble_removal: {
        min: 800,
        max: 4_000,
        unit: 'per load',
        note: 'Tipper truck R1,500–R3,500 per trip',
    },
    garden_green_waste: {
        min: 500,
        max: 3_000,
        unit: 'per load',
    },
    general_junk_removal: {
        min: 600,
        max: 3_500,
        unit: 'per load',
    },

    // ── Welding ───────────────────────────────────────────────────────────────

    security_gate_fabrication: {
        min: 3_000,
        max: 15_000,
        unit: 'supply & installation',
        note: 'Burglar bars R500–R1,200 per window',
    },
    steel_fence_repair: {
        min: 1_500,
        max: 8_000,
        unit: 'repair or section replacement',
        note: 'New palisade R800–R1,800 per metre',
    },
    structural_steel: {
        min: 5_000,
        max: null,
        unit: 'from',
        note: 'Steel lintel R1,500–R4,000; beam installation quoted individually',
    },
    custom_metalwork: {
        min: 2_000,
        max: 12_000,
        unit: 'per project',
    },
};

const ZAR = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

function fmt(n: number): string {
    return ZAR.format(n);
}

export type FormattedCostEstimate = {
    label: string;
    note: string | null;
};

/**
 * Format a cost estimate into the label + note shown to the user. Shared by the
 * static lookup below and the DB-cached read path so both render identically.
 */
export function formatCostEstimate(est: CostEstimate): FormattedCostEstimate {
    let label = est.max == null ? `From ${fmt(est.min)}` : `${fmt(est.min)} – ${fmt(est.max)}`;
    if (est.unit) label += ` · ${est.unit}`;
    return { label, note: est.note ?? null };
}

/**
 * Returns a human-readable cost estimate for the given subcategory_id from the
 * static table. Returns null when no estimate is available (e.g. none_unmapped).
 */
export function getCostEstimate(
    subcategoryId: string | null | undefined,
): FormattedCostEstimate | null {
    if (!subcategoryId) return null;
    const est = ESTIMATES[subcategoryId];
    if (!est) return null;
    return formatCostEstimate(est);
}
