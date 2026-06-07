/**
 * Static trade ↔ subcategory routing for Agent 2a + reconcile guard.
 *
 * Classification strategy: scope-based, not keyword-based.
 * The AI matches by asking "what component or system is broken?" and finding the
 * subcategory whose `scope` description best covers it. This handles the full
 * natural-language variation in how people describe faults — regardless of the
 * specific words used.
 *
 * `inferenceAnchors` are used ONLY by the non-AI keyword fallback
 * (inferTradeFromSignals) — the safety-net path when the AI call fails.
 * They are not sent to the AI.
 *
 * `excludes` lists the explicit boundaries with adjacent subcategories.
 * Include whenever a reasonable person could confuse two categories.
 *
 * South African / Cape Town context is woven into scope descriptions throughout.
 * Local terms: geyser, DB board, load shedding, inverter, slam lock, BIC, palisade,
 * burglar bars, marblite, JoJo tank, screed, Wendy house, braai, damp.
 */

import { SERVICE_LABELS as SERVICE_LABELS_ARR } from '@/lib/services';

/** When no taxonomy row fits; coercion is skipped for trade/trade_detail. */
export const TAXONOMY_NONE_ID = 'none_unmapped' as const;

export type CanonicalTradeLabel = (typeof SERVICE_LABELS_ARR)[number];

export interface TaxonomySubcategory {
    readonly id: string;
    readonly label: string;
    readonly trade: CanonicalTradeLabel;
    /**
     * Semantic scope sent to the AI classifier.
     * Describes what belongs here in plain English — the AI reasons against this,
     * not against keyword lists. Write it as a trade professional would define the job.
     */
    readonly scope: string;
    /**
     * What explicitly does NOT belong here, to prevent AI over-matching.
     * Optional — only needed when the boundary with another category is non-obvious.
     */
    readonly excludes?: readonly string[];
    /**
     * Anchor terms used ONLY by the non-AI keyword fallback (inferTradeFromSignals).
     * Keep short — these are safety-net terms for when the AI call fails, not
     * classification logic. Longest-match-wins applies here.
     */
    readonly inferenceAnchors: readonly string[];
    /**
     * Structured failure-mode catalog for Agent 2b prompt injection (Phase 2 of the
     * Diagnostic-Accuracy-Hardening-Plan). Optional during rollout — when absent,
     * the failure-mode serialiser returns an empty string and Agent 2b falls back
     * to general-knowledge reasoning.
     */
    readonly failureModes?: readonly FailureMode[];
}

/** One failure mode in the SA-residential catalog for a subcategory. */
export interface FailureMode {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly diagnosticCues: ReadonlyArray<{ type: string; description: string }>;
    readonly urgency: 'now' | 'soon' | 'when_convenient' | 'planned';
    readonly typicalRepair: {
        readonly summary: string;
        readonly costBand: 'minor' | 'medium' | 'major' | 'replacement';
    };
}

function assertKnownTrades(rows: TaxonomySubcategory[]): void {
    const set = new Set<string>(SERVICE_LABELS_ARR);
    for (const r of rows) {
        if (!set.has(r.trade)) {
            throw new Error(`Taxonomy row ${r.id} has unknown trade "${r.trade}"`);
        }
    }
}

/**
 * Full taxonomy across all 23 platform service categories.
 * Ordered by trade, then specificity within each trade.
 */
export const TAXONOMY_SUBCATEGORIES: readonly TaxonomySubcategory[] = (
    [

        // ── Security ──────────────────────────────────────────────────────────────

        {
            id: 'gate_motor_fault',
            label: 'Gate Motor / Gate Fault',
            trade: 'Security',
            scope: 'Any fault with a residential or commercial driveway gate — including the motor unit, gearbox, control board, remote receiver, limit switches, physical gate arm, gate rail or track, hinges, or the gate leaf itself failing to open, close, or hold position. Covers both sliding and swing gates. Includes popular South African brands: Centurion, ET Systems, DTS, Hansa.',
            excludes: [
                'Garage doors on ceiling track (→ garage_door_fault)',
                'Intercom or access control panels (→ intercom_access_control)',
                'Mechanical gate lock or padlock faults (→ Locksmith Services)',
            ],
            inferenceAnchors: ['gate motor', 'gate not opening', 'centurion motor', 'dts gate', 'sliding gate', 'swing gate', 'gate arm'],
        },
        {
            id: 'garage_door_fault',
            label: 'Garage Door Fault / Repair',
            trade: 'Security',
            scope: 'Any mechanical, electrical, or operational fault with a residential garage door — including motor failure, spring breakage or displacement, snapped or frayed cable, bent or broken connecting rod, damaged track or rail, panel damage, hinge failure, counterbalance system failure, remote or sensor faults, and any inability to open or close the door. Covers all garage door types: sectional overhead, roller, tilt-up.',
            excludes: [
                'Painting or repainting the garage door exterior (→ Painting)',
            ],
            inferenceAnchors: ['garage door', 'garage motor', 'roller door', 'sectional door', 'tilt door', 'garage spring'],
        },
        {
            id: 'cctv_camera_system',
            label: 'CCTV / Camera System',
            trade: 'Security',
            scope: 'Any fault with a residential or commercial surveillance system — including cameras not recording, cameras offline, DVR/NVR failure, corrupted or missing footage, cable or power faults affecting cameras, and new camera installations.',
            inferenceAnchors: ['cctv', 'security camera', 'dvr', 'nvr', 'camera system', 'surveillance camera'],
        },
        {
            id: 'electric_fence_fault',
            label: 'Electric Fence Fault',
            trade: 'Security',
            scope: 'Any fault with a residential electric fence perimeter system — including energiser failure, fence alarm triggering constantly, broken or shorting fence wire, earth leakage from the fence circuit, and faulty fence zones. Electric fences are a standard perimeter security feature in South African homes and trigger frequently after load shedding.',
            inferenceAnchors: ['electric fence', 'energiser', 'energizer', 'fence alarm', 'fence shorting'],
        },
        {
            id: 'intercom_access_control',
            label: 'Intercom / Access Control',
            trade: 'Security',
            scope: 'Any fault with an intercom, video doorbell, keypad, biometric reader, or building access control system — including no audio or video on handset, failed door release, offline control panels, and damaged or unpowered handsets.',
            inferenceAnchors: ['intercom', 'access control', 'keypad entry', 'biometric reader', 'door release', 'video doorbell'],
        },

        // ── Electrical ────────────────────────────────────────────────────────────

        {
            id: 'db_board_tripping',
            label: 'DB Board / Tripping',
            trade: 'Electrical',
            scope: 'Any fault with the main distribution board (DB board) — including tripping breakers, repeated earth leakage trips, no power to specific circuits, burning smell from the board, and full power outages originating from the DB board. Includes faults with prepaid electricity meters and Eskom supply connections.',
            excludes: [
                'Geyser element or thermostat faults (→ geyser_electrical)',
                'Load shedding damage to appliances (→ load_shedding_surge)',
            ],
            inferenceAnchors: ['db board', 'tripping breaker', 'distribution board', 'earth leakage', 'no power', 'prepaid meter'],
        },
        {
            id: 'geyser_electrical',
            label: 'Geyser Electrical',
            trade: 'Electrical',
            scope: 'Electrical faults specific to a geyser — including a failed heating element, faulty thermostat, geyser circuit breaker tripping repeatedly, and geyser not heating despite the water supply being fine.',
            excludes: [
                'Geyser leaking, burst tank, or dripping pressure valve (→ geyser_fault_plumbing)',
            ],
            inferenceAnchors: ['geyser element', 'geyser thermostat', 'geyser breaker', 'geyser not heating', 'geyser electrical'],
        },
        {
            id: 'lights_wiring',
            label: 'Lights and Wiring',
            trade: 'Electrical',
            scope: 'Any fault with light fittings, switches, plug sockets, or fixed wiring — including flickering or dead lights, failed downlights, broken socket outlets, wiring faults behind walls, ceiling rose replacements, and light fitting installations.',
            excludes: [
                'Swapping a light bulb or resetting a single tripped plug with no wiring fault (→ minor_home_repairs in General Handyman)',
            ],
            inferenceAnchors: ['light fitting', 'downlights', 'plug socket', 'wiring fault', 'ceiling rose', 'light switch', 'no lights'],
        },
        {
            id: 'load_shedding_surge',
            label: 'Load Shedding Damage / Surge Protection',
            trade: 'Electrical',
            scope: 'Electrical damage caused by load shedding power cuts or power surges — including appliances or electronics damaged when power returns, surge protection device installation, and damage to pumps, geysers, motors, or alarm systems caused by voltage spikes during load shedding. Load shedding is a daily reality in South Africa and is the leading cause of residential electrical damage.',
            inferenceAnchors: ['load shedding', 'power surge', 'loadshedding', 'surge damage', 'power cut damage', 'surge protector'],
        },
        {
            id: 'solar_inverter',
            label: 'Solar Panel / Inverter System',
            trade: 'Solar & Backup Power',
            scope: 'Any fault with a residential solar panel system, inverter, or battery backup installation — including inverter not switching to backup power during load shedding, solar panels not generating, battery not holding charge, inverter alarm codes, and new solar or backup power installations. Solar adoption has accelerated significantly in South Africa due to load shedding.',
            inferenceAnchors: ['solar panel', 'inverter', 'solar system', 'battery backup', 'backup power', 'ups system', 'solar fault'],
        },

        // ── Plumbing ──────────────────────────────────────────────────────────────

        {
            id: 'geyser_fault_plumbing',
            label: 'Geyser Fault',
            trade: 'Plumbing',
            scope: 'Any fault with a hot water geyser or cylinder on the water and plumbing side — including leaking, burst tank, dripping or continuously open pressure relief valve, no hot water due to a plumbing fault, corroded tank body, and failed inlet or outlet valves. Geysers are the single most common source of water damage in South African homes.',
            excludes: [
                'Geyser element or thermostat faults (→ geyser_electrical)',
            ],
            inferenceAnchors: ['geyser leaking', 'geyser burst', 'hot water cylinder', 'geyser dripping', 'pressure valve', 'burst geyser'],
        },
        {
            id: 'burst_pipe_leak',
            label: 'Burst Pipe / Major Leak',
            trade: 'Plumbing',
            scope: 'Any active water leak from a supply pipe — including burst pipes above and below ground, leaking pipe joints or couplings, water main damage, water seeping through walls or ceilings from a pipe, and a geyser overflow pipe that is continuously discharging. Includes supply plumbing for JoJo tanks and rainwater harvesting systems.',
            inferenceAnchors: ['burst pipe', 'water leak', 'water main', 'pipe burst', 'geyser overflow', 'leaking pipe'],
        },
        {
            id: 'blocked_drain',
            label: 'Blocked Drain',
            trade: 'Plumbing',
            scope: 'Any blocked or slow-draining waste or sewer line — including blocked kitchen, bathroom, or outdoor drains, sewage backing up into the property, foul smell from drains, blocked stormwater channels, and blocked or collapsed underground sewer pipes.',
            inferenceAnchors: ['blocked drain', 'backing up', 'sewage smell', 'slow drain', 'sewer blocked', 'outside drain blocked'],
        },
        {
            id: 'tap_toilet_repair',
            label: 'Tap / Toilet / Fitting Repair',
            trade: 'Plumbing',
            scope: 'Any fault with a tap, mixer, toilet cistern, shower fitting, or basin — including dripping taps, seized or stiff mixer handles, broken tap spindles, running or non-flushing toilets, toilet cistern fill and flush valve faults, and leaking under-sink or washing machine connections.',
            inferenceAnchors: ['dripping tap', 'mixer tap', 'toilet not flushing', 'toilet cistern', 'shower fitting', 'running toilet'],
        },
        {
            id: 'water_pressure_supply',
            label: 'Water Pressure / Supply Issue',
            trade: 'Plumbing',
            scope: 'Any issue with low or high water pressure throughout a property, unexplained water supply interruptions, pressure reducing valve faults, borehole pump faults, and water storage tank supply issues. Borehole systems are common in the Western Cape; JoJo and storage tanks are widely used for water security.',
            inferenceAnchors: ['low water pressure', 'no water', 'borehole pump', 'pressure valve', 'jojo tank', 'water tank supply'],
        },

        // ── Building & Construction ───────────────────────────────────────────────

        {
            id: 'roof_leak_repair',
            label: 'Roof Leak / Repair',
            trade: 'Roofing',
            scope: 'Any fault with a residential roof — including active leaks during or after rain, missing, cracked, or broken roof tiles, damaged IBR or corrugated iron sheeting, failed ridging or flashing, leaking skylights, damaged roof trusses or battens, fascia and barge board damage, and gutters that are detached or directing water into the structure. Cape Town\'s wet winter rainfall makes roof leaks one of the most frequent building faults.',
            excludes: [
                'Waterproofing coatings applied to flat roofs as paint (→ roof_waterproof_coating in Painting)',
            ],
            inferenceAnchors: ['roof leak', 'roof tiles', 'leaking roof', 'roof repair', 'gutters', 'ibr sheeting', 'corrugated roof', 'ridging'],
        },
        {
            id: 'damp_waterproofing',
            label: 'Damp / Waterproofing',
            trade: 'Waterproofing',
            scope: 'Any damp, moisture, or water ingress problem in the building fabric — including rising damp in walls, penetrating damp after rain, persistently wet walls, damp patches on ceilings or floors, efflorescence on brickwork, mould caused by structural moisture, and waterproofing of flat roofs, parapets, balconies, retaining walls, and below-ground walls. Damp is a pervasive issue in Cape Town due to the wet south-west winter climate.',
            excludes: [
                'Roof tile or structural roof leaks (→ roof_leak_repair)',
                'Surface waterproof paint or coating application only (→ roof_waterproof_coating in Painting)',
            ],
            inferenceAnchors: ['damp', 'rising damp', 'wet wall', 'damp patch', 'waterproofing', 'mould damp', 'efflorescence'],
        },
        {
            id: 'wall_crack_plastering',
            label: 'Wall Crack / Plastering',
            trade: 'Building & Construction',
            scope: 'Any cracked, damaged, or failing plasterwork on internal or external walls and ceilings — including hairline cracks, structural cracks, spalling or hollow plaster, damaged cornices, full re-plastering, and minor brickwork repairs or hole patching.',
            excludes: [
                'Minor filler patching of a single small hole or hairline crack with no structural cause (→ minor_home_repairs in General Handyman)',
            ],
            inferenceAnchors: ['wall crack', 'cracked plaster', 'plaster repair', 'ceiling crack', 'brickwork repair', 'hollow plaster', 'hole in wall'],
        },
        {
            id: 'retaining_boundary_wall',
            label: 'Retaining Wall / Boundary Wall',
            trade: 'Building & Construction',
            scope: 'Any fault with a retaining wall, boundary wall, garden wall, or brick perimeter fence — including cracks, bulging, partial collapse, leaning, foundation failure, and new wall construction. Retaining walls are particularly common on the sloped terrain of Cape Town suburbs and frequently fail after winter rain.',
            inferenceAnchors: ['retaining wall', 'boundary wall', 'garden wall', 'wall collapsing', 'wall leaning', 'brick wall cracking'],
        },
        {
            id: 'building_extensions',
            label: 'General Building / Extensions',
            trade: 'Building & Construction',
            scope: 'General building and construction work — including room additions, garage and outbuilding construction, Wendy house upgrades to permanent structures, carport construction, foundation repairs, slab cracking, and any significant structural changes to a property.',
            inferenceAnchors: ['room extension', 'wendy house', 'carport building', 'foundation', 'structural repair', 'new room', 'outbuilding'],
        },

        // ── Carpentry & Woodwork ──────────────────────────────────────────────────

        {
            id: 'door_frame_repair',
            label: 'Door / Frame Repair',
            trade: 'Carpentry & Woodwork',
            scope: 'Any fault with a wooden or hollow-core internal door or its frame — including doors that stick or will not close, warped or cracked door panels, broken door frames, split architraves, and damaged door stops. Includes fitting of new internal doors and frames.',
            excludes: [
                'Lock or handle mechanism faults (→ Locksmith Services)',
                'Steel security gates or doors (→ Welding or Security & Access)',
                'A loose handle, squeaky hinge, or latch adjustment only (→ minor_home_repairs in General Handyman)',
            ],
            inferenceAnchors: ['door sticking', 'door frame', 'warped door', 'door repair', 'hollow door', 'door not closing'],
        },
        {
            id: 'builtin_cupboard',
            label: 'Built-in Cupboard / Wardrobe',
            trade: 'Carpentry & Woodwork',
            scope: 'Any fault with built-in cupboards, wardrobes (BICs), or fitted cabinetry — including doors that will not close or hang crookedly, broken sliding rails, damaged shelving or carcasses, loose hinges, and new built-in cupboard installations. BICs (built-in cupboards) are standard in South African bedrooms and kitchens.',
            inferenceAnchors: ['built-in cupboard', 'bic', 'wardrobe door', 'cupboard door', 'fitted cupboard', 'built in cupboard'],
        },
        {
            id: 'deck_pergola',
            label: 'Wooden Deck / Pergola',
            trade: 'Carpentry & Woodwork',
            scope: 'Any fault with an outdoor wooden deck, pergola, or timber entertainment area — including rotting deck boards, structurally unstable posts or bearers, damaged balustrades or handrails, and new deck or pergola installations.',
            excludes: [
                'Soft landscaping, planting, or garden design around the deck (→ Garden & Landscaping)',
                'Outdoor paving or concrete slabs under the structure (→ Flooring & Tiling)',
            ],
            inferenceAnchors: ['wooden deck', 'deck boards', 'pergola', 'outdoor deck', 'deck repair', 'timber deck', 'deck rotting'],
        },
        {
            id: 'window_frame_repair',
            label: 'Window Frame / Sill Repair',
            trade: 'Carpentry & Woodwork',
            scope: 'Any fault with a wooden window frame, sill, or shutter — including rotting or swollen frames that will not open or close, cracked sills, and fitting of new wooden window frames. Includes wooden shutters and louvre fittings.',
            excludes: [
                'Aluminium or steel window frames (→ Building & Construction)',
                'Broken window glass (→ Building & Construction)',
            ],
            inferenceAnchors: ['window frame', 'window sill', 'wooden window', 'rotten frame', 'window shutter', 'swollen window'],
        },
        {
            id: 'general_carpentry',
            label: 'General Carpentry / Custom Woodwork',
            trade: 'Carpentry & Woodwork',
            scope: 'Custom woodwork and general carpentry not covered by more specific subcategories — including shelving installations, skirting boards, timber wall cladding, wooden staircase repairs, bespoke furniture construction, and any other custom timber fabrication.',
            excludes: [
                'Re-fixing a single loose skirting length or minor trim with no fabrication (→ minor_home_repairs in General Handyman)',
            ],
            inferenceAnchors: ['skirting board', 'shelving', 'timber cladding', 'wooden staircase', 'custom woodwork', 'bespoke carpentry'],
        },

        // ── Flooring & Tiling ─────────────────────────────────────────────────────

        {
            id: 'tile_repair',
            label: 'Tile Repair / Replacement',
            trade: 'Flooring & Tiling',
            scope: 'Any fault with floor or wall tiles — including cracked, chipped, or hollow-sounding tiles, tiles lifting from the substrate, adhesion failure, and replacement of individual tiles or full tiling of rooms. Covers ceramic and porcelain tiles, which are the dominant flooring and wall finish in South African bathrooms, kitchens, and outdoor areas.',
            inferenceAnchors: ['cracked tile', 'tile repair', 'floor tile', 'wall tile', 'tile replacement', 'hollow tile', 'tile lifting'],
        },
        {
            id: 'grout_sealing',
            label: 'Grout Repair / Re-Grouting',
            trade: 'Flooring & Tiling',
            scope: 'Any fault with grout lines or tile sealing — including crumbling, discoloured, or mouldy grout, cracked grout allowing water ingress in wet areas, and full re-grouting of tiled surfaces. Often follows damp ingress in bathrooms.',
            inferenceAnchors: ['grout repair', 'crumbling grout', 'mouldy grout', 're-grout', 'regrout', 'grouting'],
        },
        {
            id: 'laminate_vinyl_floor',
            label: 'Laminate / Vinyl / Click Flooring',
            trade: 'Flooring & Tiling',
            scope: 'Any fault with laminate, vinyl plank, or click-lock floating floors — including planks lifting, warping, or buckling, damaged or water-damaged sections, hollow-sounding areas, and new laminate or luxury vinyl tile (LVT) installations.',
            inferenceAnchors: ['laminate flooring', 'vinyl plank', 'click floor', 'lvt flooring', 'floating floor', 'floor lifting', 'laminate warping'],
        },
        {
            id: 'timber_floor',
            label: 'Timber / Wooden Floor',
            trade: 'Flooring & Tiling',
            scope: 'Any fault with solid timber, parquet, or engineered wood flooring — including squeaking floorboards, boards lifting or separating, damaged sections, sanding and refinishing of worn floors, and new timber floor installations.',
            inferenceAnchors: ['wooden floor', 'parquet', 'timber floor', 'squeaking floor', 'floor sanding', 'engineered wood', 'wood floor'],
        },
        {
            id: 'floor_screed',
            label: 'Screed / Floor Levelling',
            trade: 'Flooring & Tiling',
            scope: 'Any work involving floor screed or levelling — including cracked or hollow screed, uneven concrete floors that require levelling before tiling, and new screed layers. Includes minor concrete floor slab repairs prior to a floor covering installation.',
            inferenceAnchors: ['floor screed', 'screed repair', 'floor levelling', 'uneven floor', 'concrete floor crack'],
        },

        // ── General Handyman ──────────────────────────────────────────────────────

        {
            id: 'mounting_installation',
            label: 'Mounting and Installation',
            trade: 'General Handyman',
            scope: 'Fixing or installing household items that require drilling, fastening, or basic connections — including TV and monitor wall mounting, shelf installation, curtain rail and blind fitting, towel rail and coat hook installation, mirror hanging, and similar tasks that require tools but not a licensed trade.',
            inferenceAnchors: ['tv mounting', 'tv mount', 'shelf installation', 'curtain rail', 'blind fitting', 'towel rail', 'wall mounting'],
        },
        {
            id: 'minor_home_repairs',
            label: 'Minor Home Repairs',
            trade: 'General Handyman',
            scope: 'Small maintenance jobs that require practical skill but do not warrant a specialist trade — including loose door handles, stiff or squeaking hinges, broken fly screens, cracked silicone sealing around baths or basins, draughty door seals, broken skirting, and similar minor household repairs.',
            inferenceAnchors: ['door handle loose', 'fly screen', 'silicone seal', 'bath seal', 'door seal', 'minor repair', 'hinge squeaking'],
        },
        {
            id: 'general_handyman_jobs',
            label: 'General Handyman Jobs',
            trade: 'General Handyman',
            scope: 'Mixed or general maintenance tasks that span multiple small jobs or do not fit neatly into a specialist trade category — including property maintenance rounds, punch-list repairs, small patching and touch-up work, and general odd-job requests where a licensed specialist is not required.',
            inferenceAnchors: ['handyman', 'odd job', 'general maintenance', 'property maintenance', 'punch list', 'odd jobs'],
        },

        // ── Locksmith Services ────────────────────────────────────────────────────

        {
            id: 'lockout_emergency',
            label: 'Lockout / Emergency Entry',
            trade: 'Locksmith Services',
            scope: 'Any situation where a person is locked out of their home, room, or safe — including house lockouts, broken keys in locks, jammed or seized locks, and emergency entry after a lock fails or is damaged. Locksmith emergency call-outs are common in South Africa, particularly following attempted break-ins where door frames or locks are damaged.',
            inferenceAnchors: ['locked out', 'lockout', 'key stuck', 'key broken in lock', 'locked inside', 'cant get in'],
        },
        {
            id: 'lock_replacement',
            label: 'Lock Replacement / Upgrade',
            trade: 'Locksmith Services',
            scope: 'Replacing or upgrading a door lock — including worn or faulty mortice locks, cylinder lock replacement, deadbolt installation, slam lock fitting, and re-keying after a break-in or lost key. Slam locks are widely used on South African security doors. Includes upgrading to higher-security locks after a break-in.',
            inferenceAnchors: ['lock replacement', 'change lock', 'deadbolt', 'slam lock', 'cylinder lock', 'rekey', 'new lock'],
        },
        {
            id: 'gate_padlock_security_lock',
            label: 'Gate Lock / Padlock / Security Lock',
            trade: 'Locksmith Services',
            scope: 'Mechanical lock faults on gates, pedestrian doors, outbuildings, or security doors — including broken padlocks, faulty gate slam locks, security door lock replacement, and fitting of new padlocks or hasps. Covers the mechanical lock mechanism only.',
            excludes: [
                'Gate motor or electronic gate issues (→ gate_motor_fault in Security & Access)',
            ],
            inferenceAnchors: ['gate lock', 'padlock', 'security door lock', 'gate slam lock', 'lock on gate', 'hasp'],
        },
        {
            id: 'safe_installation',
            label: 'Safe / High-Security Lock',
            trade: 'Locksmith Services',
            scope: 'Installation or repair of home safes, safe combination resets, multi-point locking system installation or repair, and security door lock upgrades beyond standard cylinder replacement.',
            inferenceAnchors: ['safe installation', 'safe combination', 'home safe', 'multipoint lock', 'high security lock', 'safe not opening'],
        },

        // ── Painting ──────────────────────────────────────────────────────────────

        {
            id: 'interior_painting',
            label: 'Interior Painting',
            trade: 'Painting',
            scope: 'Painting of interior walls, ceilings, doors, trims, and skirting boards — including full repaints, single feature walls, touch-up painting after repairs, and all preparation work such as filling, sanding, and priming. Covers all interior residential and light commercial surfaces.',
            inferenceAnchors: ['interior painting', 'paint walls', 'ceiling paint', 'room painting', 'interior repaint', 'paint inside'],
        },
        {
            id: 'exterior_painting',
            label: 'Exterior / Façade Painting',
            trade: 'Painting',
            scope: 'Painting of exterior walls, façades, boundary walls, outbuildings, and garage doors — including full repaints, flaking or peeling paint removal, anti-damp primer application, and all exterior surface preparation. Cape Town\'s UV exposure and wet winters accelerate exterior paint degradation significantly.',
            inferenceAnchors: ['exterior painting', 'outside wall paint', 'facade painting', 'boundary wall paint', 'exterior repaint', 'outside painting'],
        },
        {
            id: 'roof_waterproof_coating',
            label: 'Roof Paint / Waterproofing Coat',
            trade: 'Waterproofing',
            scope: 'Application of waterproofing coatings, roof sealers, or speciality paints to flat or low-pitch roofs, parapets, and balconies — including acrylic waterproofing membranes, bitumen-based sealants, and surface-applied coating systems. This is a paint application trade, not structural waterproofing.',
            excludes: [
                'Structural damp penetrating through walls or foundations (→ damp_waterproofing in Building & Construction)',
            ],
            inferenceAnchors: ['roof paint', 'waterproof coating', 'flat roof sealing', 'acrylic waterproofing', 'parapet coating', 'roof sealant'],
        },
        {
            id: 'specialty_surface_painting',
            label: 'Specialty Surface Painting',
            trade: 'Painting',
            scope: 'Painting of non-standard or specialised surfaces — including steel gates, burglar bars, railings, swimming pool interiors, floor paint, and epoxy coatings. Includes all surface preparation and priming for metal or concrete surfaces prior to painting.',
            inferenceAnchors: ['gate painting', 'burglar bar paint', 'pool paint', 'floor paint', 'epoxy coating', 'paint metal', 'steel painting'],
        },

        // ── Pool Maintenance ──────────────────────────────────────────────────────

        {
            id: 'pool_chemical_balance',
            label: 'Pool Chemical Balancing',
            trade: 'Pool Maintenance',
            scope: 'Any issue with pool water chemistry — including green or cloudy water, algae growth, incorrect pH or chlorine levels, scaling on pool surfaces, and regular chemical treatment and balancing services. Green pools following load shedding pump outages are extremely common in Cape Town and often require professional chemical remediation.',
            inferenceAnchors: ['green pool', 'pool algae', 'pool chemicals', 'cloudy pool', 'pool ph', 'pool chlorine', 'pool water green'],
        },
        {
            id: 'pool_pump_filter',
            label: 'Pool Pump / Filter Fault',
            trade: 'Pool Maintenance',
            scope: 'Any fault with pool circulation or filtration equipment — including pump motor failure, pump not priming, filter housing cracks, backwash valve faults, automatic chlorinator faults, and heat pump issues. Pump damage from load shedding power surges is a common occurrence.',
            inferenceAnchors: ['pool pump', 'pool filter', 'pump not working', 'pool motor', 'pool equipment fault', 'backwash valve'],
        },
        {
            id: 'pool_leak',
            label: 'Pool Leak / Structural Repair',
            trade: 'Pool Maintenance',
            scope: 'Any structural fault with a pool — including water loss beyond normal evaporation, cracked pool shell, leaking return jets or skimmer boxes, failed underwater light fittings, damaged plaster or marblite surface, and pool replastering. Marblite is the standard pool interior finish in South Africa.',
            inferenceAnchors: ['pool leak', 'pool losing water', 'cracked pool', 'pool plaster', 'skimmer box leak', 'marblite', 'pool shell'],
        },
        {
            id: 'pool_cleaning',
            label: 'Pool Cleaning / Maintenance Service',
            trade: 'Pool Maintenance',
            scope: 'Regular or once-off pool cleaning, vacuuming, brushing, backwashing, and general upkeep — including debris removal, tile brushing, and inspection visits. Also covers assessment and minor adjustments as part of a routine maintenance service.',
            inferenceAnchors: ['pool cleaning', 'pool vacuum', 'clean pool', 'pool service', 'pool maintenance', 'dirty pool'],
        },

        // ── Garden & Landscaping ──────────────────────────────────────────────────
        //
        // BOUNDARY RULES — where Garden & Landscaping starts and ends:
        //
        // Garden & Landscaping OWNS: all living plant work (lawn, trees, hedges,
        //   planting), irrigation systems, soft landscaping design, and specialist
        //   arborist tasks (tree felling, pruning, stump grinding).
        //
        // Building & Construction OWNS: any hard landscaping with masonry —
        //   paving foundations, retaining walls, brick raised beds, concrete drainage.
        //
        // Carpentry & Woodwork OWNS: timber structures IN the garden — wooden decks,
        //   pergolas, wooden raised beds, timber garden sheds.
        //
        // Rubble & Waste Removal OWNS: simply carting away cut branches or garden
        //   waste with no horticultural skill required (→ garden_green_waste).
        //
        // Flooring & Tiling OWNS: laying paving slabs or tiles outdoors — the
        //   paving itself, not the garden around it.
        //
        // Plumbing OWNS: a leaking outdoor tap, geyser-side irrigation supply
        //   pipe, or mains connection — the fitting side of outdoor water supply.
        //   Garden & Landscaping OWNS irrigation zone controllers, drip systems,
        //   pop-up sprinklers, and pump-fed systems that are part of the garden.
        //
        // Electrical OWNS: outdoor lighting circuits, COC-required electrical
        //   work in the garden. Garden & Landscaping does NOT do licensed electrical.

        {
            id: 'lawn_maintenance',
            label: 'Lawn Mowing / Lawn Care',
            trade: 'Garden & Landscaping',
            scope: 'Regular or once-off lawn mowing, edging, scarifying, top-dressing, lawn repair, and general grass upkeep. Includes kikuyu, LM Berea, buffalo, and fine-leaf lawns common in the Western Cape. Also covers lawn diseases (dollar spot, brown patch) and lawn renovation after drought or load-shedding pump failure.',
            excludes: [
                'Cutting and removing branches or green waste only (→ garden_green_waste in Rubble & Waste Removal)',
            ],
            inferenceAnchors: ['lawn mowing', 'lawn care', 'grass cutting', 'lawn repair', 'lawn service', 'kikuyu', 'lm lawn', 'lawn dying'],
        },
        {
            id: 'tree_arborist',
            label: 'Tree Felling / Arborist',
            trade: 'Garden & Landscaping',
            scope: 'Professional tree felling, pruning, crown reduction, deadwood removal, and stump grinding. Covers large trees requiring a climber or machinery, storm-damaged trees requiring urgent safe removal, trees threatening foundations or structures, and municipal permit-required tree work. Cape Town\'s south-easter and winter storms regularly bring down large trees and branches.',
            excludes: [
                'Simply carting away already-cut branches or green waste with no skill (→ garden_green_waste in Rubble & Waste Removal)',
            ],
            inferenceAnchors: ['tree felling', 'tree cutting', 'tree removal', 'stump removal', 'arborist', 'tree pruning', 'tree too big', 'branch removal', 'fallen tree'],
        },
        {
            id: 'irrigation_system',
            label: 'Garden Irrigation System',
            trade: 'Garden & Landscaping',
            scope: 'Installation, repair, or programming of garden irrigation systems — including pop-up sprinklers, drip irrigation, soaker hoses, zone controllers, irrigation timers, and pump-fed garden water systems. Covers burst or blocked irrigation lines within the garden bed, blocked emitters, and faulty zone valves.',
            excludes: [
                'Leaking mains outdoor tap or supply pipe fitting (→ tap_toilet_repair or burst_pipe_leak in Plumbing)',
            ],
            inferenceAnchors: ['irrigation system', 'sprinkler', 'drip irrigation', 'irrigation timer', 'garden irrigation', 'zone controller', 'irrigation line', 'pop-up sprinkler'],
        },
        {
            id: 'hedge_trimming_planting',
            label: 'Hedge Trimming / Planting',
            trade: 'Garden & Landscaping',
            scope: 'Trimming, shaping, or reducing hedges, shrubs, and bushes. Includes removal and replanting of established plants, garden bed establishment, mulching, and seasonal planting or replanting. Covers all hedge types common in Cape Town including ficus, box, laurel, and restio-based plantings.',
            inferenceAnchors: ['hedge trimming', 'hedge cutting', 'plant removal', 'garden planting', 'shrub trimming', 'bush cutting', 'garden clean up', 'overgrown hedge'],
        },
        {
            id: 'landscaping_design',
            label: 'Landscaping / Garden Design',
            trade: 'Garden & Landscaping',
            scope: 'Full garden design, soft landscaping, and established garden makeovers — including garden layout planning, planting schemes, raised bed installation, path or stepping-stone installation in garden beds, and water-wise or fynbos garden conversions. Fynbos and water-wise gardens are increasingly popular in the drought-prone Western Cape.',
            excludes: [
                'Paving, concrete patios, or hard outdoor surfaces (→ Flooring & Tiling)',
                'Masonry retaining walls or brick raised beds (→ Building & Construction)',
                'Timber decks or pergolas (→ Carpentry & Woodwork)',
            ],
            inferenceAnchors: ['garden design', 'landscaping', 'garden makeover', 'fynbos garden', 'water-wise', 'raised garden bed', 'garden path', 'stepping stones'],
        },

        // ── Rubble & Waste Removal ────────────────────────────────────────────────

        {
            id: 'building_rubble_removal',
            label: 'Building Rubble Removal',
            trade: 'Rubble & Waste Removal',
            scope: 'Removal of construction waste, demolition rubble, and building materials — including broken tiles, bricks, concrete, sand bags, and mixed building debris after renovation or construction work. Standard requirement after any tiling, plastering, or building project.',
            inferenceAnchors: ['rubble removal', 'building rubble', 'demolition waste', 'construction waste', 'brick rubble', 'tile rubble'],
        },
        {
            id: 'garden_green_waste',
            label: 'Garden / Green Waste Removal',
            trade: 'Rubble & Waste Removal',
            scope: 'Removal of already-cut garden and plant waste — including branches, tree stumps, hedge cuttings, grass clippings, and green waste from garden clean-ups. The material is already cut and only needs loading and carting. Frequent in Cape Town after south-easter and winter storms.',
            excludes: [
                'Professional tree felling or arborist work requiring skill (→ tree_arborist in Garden & Landscaping)',
                'Hedge trimming or garden upkeep with horticulture skill (→ hedge_trimming_planting in Garden & Landscaping)',
            ],
            inferenceAnchors: ['garden waste', 'green waste', 'tree branches', 'tree stump removal', 'hedge cuttings', 'garden clean up'],
        },
        {
            id: 'general_junk_removal',
            label: 'General Junk / Household Removal',
            trade: 'Rubble & Waste Removal',
            scope: 'Removal of unwanted household items, old furniture, appliances, and general accumulated junk — including clearing outbuildings, garages, or properties prior to sale or rental. Includes skip-load equivalent services for mixed household and light construction waste.',
            inferenceAnchors: ['junk removal', 'furniture removal', 'household waste', 'clear garage', 'skip hire', 'rubbish removal', 'clear out'],
        },

        // ── Welding ───────────────────────────────────────────────────────────────

        {
            id: 'security_gate_fabrication',
            label: 'Security Gate / Burglar Bar Fabrication',
            trade: 'Welding',
            scope: 'Fabrication, installation, or repair of steel security gates (including internal slam-lock security doors between rooms), burglar bars on windows, and custom steel security doors. Burglar bars and internal security gates are standard in South African homes and are fabricated from welded mild steel.',
            inferenceAnchors: ['burglar bars', 'security gate welding', 'burglar bar', 'steel security gate', 'weld security gate', 'slam lock gate'],
        },
        {
            id: 'steel_fence_repair',
            label: 'Steel Fence / Palisade Repair',
            trade: 'Welding',
            scope: 'Repair or installation of steel palisade fencing, tubular steel fences, or wrought iron perimeter fencing — including bent or damaged palisade spears, broken welds, gate post repairs, and new palisade sections. Palisade fencing is the dominant perimeter fencing type in South African residential estates and homes.',
            inferenceAnchors: ['palisade fence', 'steel fence', 'palisade repair', 'fence repair welding', 'iron fence', 'tubular fence'],
        },
        {
            id: 'structural_steel',
            label: 'Structural Steel / Beam Work',
            trade: 'Welding',
            scope: 'Structural steel fabrication and repair — including steel lintels above doors and windows, steel RSJ or I-beam installation for structural support, steel carport frame construction, steel stair stringers, and repairs to existing structural steel elements.',
            inferenceAnchors: ['steel lintel', 'steel beam', 'rsj beam', 'i-beam', 'steel carport', 'structural steel', 'steel stringer'],
        },
        {
            id: 'custom_metalwork',
            label: 'Custom Metalwork / Fabrication',
            trade: 'Welding',
            scope: 'Custom steel or metal fabrication not covered by the security gate or structural categories — including steel balustrades, staircase handrails, custom steel frames, braai stand fabrication, decorative metalwork, and steel-framed garden structures. Braai (barbecue) stands and entertainment area metalwork are frequently commissioned in Cape Town.',
            inferenceAnchors: ['steel balustrade', 'handrail welding', 'steel fabrication', 'braai stand', 'custom metalwork', 'custom steel frame'],
        },

        // ── Appliance Repair ──────────────────────────────────────────────────────

        {
            id: 'large_kitchen_appliance',
            label: 'Fridge / Freezer / Oven / Stove',
            trade: 'Appliance Repair',
            scope: 'Faults with major kitchen appliances including fridges, freezers, electric ovens, stoves and hobs, and dishwashers, such as not cooling, not heating, leaking water, or showing error codes.',
            excludes: [
                'Gas hobs, gas ovens, or gas stoves (→ Gas Installation & Repair)',
                'The cabinetry or built-in unit around the appliance (→ Carpentry & Woodwork)',
            ],
            inferenceAnchors: ['fridge', 'refrigerator', 'freezer', 'electric oven', 'dishwasher', 'stove not working', 'appliance repair'],
        },
        {
            id: 'laundry_appliance',
            label: 'Washing Machine / Tumble Dryer',
            trade: 'Appliance Repair',
            scope: 'Faults with washing machines and tumble dryers, such as not draining, not spinning, leaking, not heating, or showing error codes.',
            excludes: [
                'A blocked waste or drain line behind the machine (→ blocked_drain in Plumbing)',
                'A dead wall socket feeding the machine (→ lights_wiring in Electrical)',
            ],
            inferenceAnchors: ['washing machine', 'tumble dryer', 'washer not draining', 'dryer not heating', 'machine not spinning'],
        },
        {
            id: 'small_appliance',
            label: 'Microwave / Small Appliance',
            trade: 'Appliance Repair',
            scope: 'Faults with microwaves and other plug-in household appliances.',
            inferenceAnchors: ['microwave', 'small appliance', 'kettle', 'toaster', 'appliance not switching on'],
        },

        // ── Air Conditioning ──────────────────────────────────────────────────────

        {
            id: 'aircon_cooling_fault',
            label: 'AC Not Cooling or Heating',
            trade: 'Air Conditioning',
            scope: 'Split or window air conditioners with weak or no cooling or heating, ice forming on the unit, bad smells, or error codes, including a gas regas.',
            excludes: [
                'A tripped breaker or isolator with no AC fault (→ db_board_tripping in Electrical)',
            ],
            inferenceAnchors: ['aircon not cooling', 'air conditioner', 'ac not cold', 'aircon icing', 'aircon regas', 'hvac'],
        },
        {
            id: 'aircon_install',
            label: 'AC Installation or Relocation',
            trade: 'Air Conditioning',
            scope: 'Supply and installation of a new air conditioner, or relocating an existing indoor or outdoor unit.',
            inferenceAnchors: ['aircon installation', 'install air conditioner', 'aircon relocation', 'new aircon'],
        },
        {
            id: 'aircon_service_leak',
            label: 'AC Service, Leak or Smell',
            trade: 'Air Conditioning',
            scope: 'Routine air conditioner servicing, water dripping from the indoor unit, a blocked condensate drain, or a musty smell from the unit.',
            excludes: [
                'A ceiling water stain from the roof or a pipe rather than the AC (→ roof_leak_repair in Roofing or burst_pipe_leak in Plumbing)',
            ],
            inferenceAnchors: ['aircon service', 'aircon leaking water', 'aircon smell', 'aircon dripping', 'aircon drain'],
        },
        {
            id: 'heat_pump',
            label: 'Heat Pump',
            trade: 'Air Conditioning',
            scope: 'Heat pumps for geyser hot water or pool heating that are not heating, short cycling, or showing fault codes.',
            excludes: [
                'A standard geyser element or thermostat (→ geyser_electrical in Electrical)',
                'Pool circulation or filtration only (→ pool_pump_filter in Pool Maintenance)',
            ],
            inferenceAnchors: ['heat pump', 'heat pump not heating', 'geyser heat pump', 'pool heat pump'],
        },

        // ── Glazing, Glass & Aluminium ────────────────────────────────────────────

        {
            id: 'broken_window_glass',
            label: 'Broken or Cracked Glass',
            trade: 'Glazing, Glass & Aluminium',
            scope: 'Cracked or shattered window panes and glass replacement, including safety glass after a break-in or storm.',
            inferenceAnchors: ['broken window', 'cracked glass', 'shattered window', 'window glass', 'replace glass', 'broken pane'],
        },
        {
            id: 'aluminium_window_door',
            label: 'Aluminium Window or Door',
            trade: 'Glazing, Glass & Aluminium',
            scope: 'Aluminium-framed windows and sliding doors that stick, jam, will not lock, have worn rollers, or need new installation.',
            excludes: [
                'Wooden window or door frames (→ window_frame_repair or door_frame_repair in Carpentry & Woodwork)',
            ],
            inferenceAnchors: ['aluminium window', 'aluminium door', 'sliding door stuck', 'aluminium frame', 'sliding door roller'],
        },
        {
            id: 'shower_glass_mirror',
            label: 'Shower Door, Frameless Glass and Mirror',
            trade: 'Glazing, Glass & Aluminium',
            scope: 'Frameless shower enclosures, glass shower doors, mirrors, and glass splashbacks, for installation or replacement.',
            inferenceAnchors: ['shower door', 'frameless glass', 'shower glass', 'mirror', 'glass splashback'],
        },
        {
            id: 'glass_balustrade',
            label: 'Glass Balustrade or Pool Fence',
            trade: 'Glazing, Glass & Aluminium',
            scope: 'Glass balustrades and frameless glass pool safety fencing, for installation, repair, or panel replacement.',
            excludes: [
                'Steel or aluminium balustrades and railings (→ custom_metalwork in Welding)',
            ],
            inferenceAnchors: ['glass balustrade', 'glass pool fence', 'glass railing', 'frameless balustrade'],
        },

        // ── Borehole, Water & Pumps ───────────────────────────────────────────────

        {
            id: 'borehole_pump',
            label: 'Borehole or Submersible Pump',
            trade: 'Borehole, Water & Pumps',
            scope: 'Borehole and submersible pumps not pumping, low yield, motor failure, or pressure tank faults. Boreholes are widely used for water security in the Western Cape.',
            excludes: [
                'A swimming pool pump (→ pool_pump_filter in Pool Maintenance)',
            ],
            inferenceAnchors: ['borehole', 'borehole pump', 'submersible pump', 'borehole not pumping', 'well pump'],
        },
        {
            id: 'pressure_tank_pump',
            label: 'Tank or Pressure Pump System',
            trade: 'Borehole, Water & Pumps',
            scope: 'JoJo tank pressure pumps, booster pumps, float valves, and water storage tank installation and repair.',
            excludes: [
                'A leaking supply pipe or fitting on the mains (→ burst_pipe_leak in Plumbing)',
            ],
            inferenceAnchors: ['pressure pump', 'booster pump', 'jojo tank pump', 'water tank pump', 'float valve'],
        },
        {
            id: 'water_filtration',
            label: 'Water Filtration and Treatment',
            trade: 'Borehole, Water & Pumps',
            scope: 'Water filtration, UV treatment, and softener systems for borehole or municipal water, including installation, servicing, and filter replacement.',
            inferenceAnchors: ['water filtration', 'water filter', 'water softener', 'uv water treatment', 'water purifier'],
        },
        {
            id: 'rainwater_harvesting',
            label: 'Rainwater Harvesting',
            trade: 'Borehole, Water & Pumps',
            scope: 'Rainwater harvesting systems from gutter to tank, including first-flush diverters and harvesting pumps.',
            inferenceAnchors: ['rainwater harvesting', 'rainwater tank', 'gutter to tank', 'rainwater pump'],
        },

        // ── Pest Control ──────────────────────────────────────────────────────────

        {
            id: 'general_pest',
            label: 'Rodents, Ants and Cockroaches',
            trade: 'Pest Control',
            scope: 'Infestations of rodents, ants, cockroaches, fishmoths, and similar household pests, including inspection, baiting, and fumigation.',
            inferenceAnchors: ['rodent', 'rats', 'mice', 'cockroach', 'ants', 'fumigation', 'pest control'],
        },
        {
            id: 'termite_borer',
            label: 'Termite and Wood Borer',
            trade: 'Pest Control',
            scope: 'Treatment of termites and wood borer in structural and finish timber, including inspection and certificates for property transfer.',
            excludes: [
                'Repairing or replacing borer-damaged timber after treatment (→ general_carpentry in Carpentry & Woodwork)',
            ],
            inferenceAnchors: ['termite', 'wood borer', 'borer', 'termite treatment', 'borer certificate'],
        },
        {
            id: 'bees_wasps',
            label: 'Bee and Wasp Removal',
            trade: 'Pest Control',
            scope: 'Removal or relocation of bee swarms, hives, and wasp nests from a property.',
            inferenceAnchors: ['bee removal', 'bee swarm', 'wasp nest', 'beehive', 'remove bees'],
        },
        {
            id: 'bird_proofing',
            label: 'Bird and Pigeon Proofing',
            trade: 'Pest Control',
            scope: 'Netting, spikes, and deterrents to stop pigeons and other birds roosting on a property.',
            inferenceAnchors: ['pigeon', 'bird proofing', 'bird netting', 'bird spikes', 'pigeons roosting'],
        },

        // ── Waterproofing ─────────────────────────────────────────────────────────
        // damp_waterproofing and roof_waterproof_coating were migrated into this
        // trade from Building & Construction and Painting respectively.

        {
            id: 'wet_area_waterproofing',
            label: 'Shower and Bathroom Waterproofing',
            trade: 'Waterproofing',
            scope: 'Under-tile waterproofing of showers, bathrooms, and other wet areas before tiling, and re-waterproofing a leaking wet area back to the screed.',
            excludes: [
                'The tiling or grouting itself (→ tile_repair or grout_sealing in Flooring & Tiling)',
            ],
            inferenceAnchors: ['shower waterproofing', 'bathroom waterproofing', 'wet area waterproofing', 'under tile waterproofing', 'leaking shower waterproofing'],
        },

        // ── Solar & Backup Power ──────────────────────────────────────────────────
        // solar_inverter was migrated into this trade from Electrical.

        {
            id: 'solar_geyser',
            label: 'Solar Geyser',
            trade: 'Solar & Backup Power',
            scope: 'Solar water heating systems, including collector panels, circulation pumps, controllers, and freeze or hail damage to the solar geyser.',
            excludes: [
                'A standard electric geyser element or thermostat (→ geyser_electrical in Electrical)',
                'A leaking geyser tank or valve (→ geyser_fault_plumbing in Plumbing)',
            ],
            inferenceAnchors: ['solar geyser', 'solar water heater', 'solar collector', 'evacuated tube geyser'],
        },

        // ── Paving & Driveways ────────────────────────────────────────────────────

        {
            id: 'paving_install',
            label: 'Paving Installation',
            trade: 'Paving & Driveways',
            scope: 'Installation of brick, cobble, or concrete paver driveways, patios, and walkways.',
            inferenceAnchors: ['paving', 'new paving', 'paver driveway', 'cobble paving', 'lay paving'],
        },
        {
            id: 'paving_repair',
            label: 'Paving Repair or Re-levelling',
            trade: 'Paving & Driveways',
            scope: 'Repair of sunken, lifted, cracked, or weed-infested paving, including re-levelling and re-sanding the joints.',
            inferenceAnchors: ['sunken paving', 'lifted paving', 'paving repair', 'paving relevelling', 'weeds in paving'],
        },
        {
            id: 'concrete_driveway',
            label: 'Concrete Driveway or Slab',
            trade: 'Paving & Driveways',
            scope: 'Poured concrete driveways and outdoor slabs, including new pours, cracking, and surface repair.',
            excludes: [
                'Indoor floor screed or levelling (→ floor_screed in Flooring & Tiling)',
                'A structural building slab or foundation (→ building_extensions in Building & Construction)',
            ],
            inferenceAnchors: ['concrete driveway', 'concrete slab outdoor', 'driveway crack', 'poured concrete driveway'],
        },
        {
            id: 'tar_asphalt',
            label: 'Tar and Asphalt Surfacing',
            trade: 'Paving & Driveways',
            scope: 'Asphalt or tar driveway and surface laying and repair.',
            inferenceAnchors: ['asphalt', 'tar surfacing', 'tar driveway', 'asphalt driveway'],
        },

        // ── Gas Installation & Repair ─────────────────────────────────────────────
        // Compliance-critical: requires a registered installer and a gas certificate
        // of conformity. Must never be routed to General Handyman.

        {
            id: 'gas_hob_stove',
            label: 'Gas Hob, Stove and Oven',
            trade: 'Gas Installation & Repair',
            scope: 'Installation and repair of gas cooktops, hobs, stoves, and ovens, including ignition faults, regulators, and connections.',
            inferenceAnchors: ['gas hob', 'gas stove', 'gas oven', 'gas cooktop', 'gas ignition'],
        },
        {
            id: 'gas_geyser',
            label: 'Gas Geyser or Water Heater',
            trade: 'Gas Installation & Repair',
            scope: 'Installation and repair of instantaneous gas water heaters and gas geysers, including ignition and gas supply faults.',
            excludes: [
                'An electric geyser element or leak (→ geyser_electrical in Electrical or geyser_fault_plumbing in Plumbing)',
            ],
            inferenceAnchors: ['gas geyser', 'gas water heater', 'instantaneous gas geyser', 'gas geyser not igniting'],
        },
        {
            id: 'gas_installation_coc',
            label: 'Gas Installation and CoC',
            trade: 'Gas Installation & Repair',
            scope: 'LPG bottle installation, gas piping, leak detection, and issuing a gas certificate of conformity. A registered installer is legally required.',
            inferenceAnchors: ['gas installation', 'gas coc', 'lpg installation', 'gas leak', 'gas piping', 'gas certificate'],
        },
        {
            id: 'gas_fireplace',
            label: 'Gas Fireplace or Braai',
            trade: 'Gas Installation & Repair',
            scope: 'Installation and repair of gas fireplaces and built-in gas braais.',
            inferenceAnchors: ['gas fireplace', 'gas braai', 'gas heater install', 'built-in gas braai'],
        },

    ] satisfies TaxonomySubcategory[]
) as unknown as TaxonomySubcategory[];

assertKnownTrades([...TAXONOMY_SUBCATEGORIES]);

/** All ids Gemini may return — `none_unmapped` first matches schema description convention. */
export const CLASSIFICATION_SUBCATEGORY_ENUM: readonly string[] = [
    TAXONOMY_NONE_ID,
    ...TAXONOMY_SUBCATEGORIES.map((s) => s.id),
];

const byId = new Map<string, TaxonomySubcategory>(
    TAXONOMY_SUBCATEGORIES.map((s) => [s.id, s])
);

export function getSubcategoryById(id: string | null | undefined): TaxonomySubcategory | undefined {
    if (!id || id === TAXONOMY_NONE_ID) return undefined;
    return byId.get(id);
}

/**
 * Formats the taxonomy as prompt text for the AI classification call.
 * Emits scope descriptions and explicit exclusions — NOT keyword lists.
 * The AI reasons against scope, not against terms.
 */
export function formatTaxonomyForClassificationPrompt(): string {
    const byTrade = new Map<CanonicalTradeLabel, TaxonomySubcategory[]>();
    for (const row of TAXONOMY_SUBCATEGORIES) {
        const list = byTrade.get(row.trade) ?? [];
        list.push(row);
        byTrade.set(row.trade, list);
    }

    const lines: string[] = [
        'ROUTING SUBCATEGORIES',
        'Match by scope — not by keywords. Choose the subcategory whose scope description best',
        'matches the component or system the user is describing. Use "' + TAXONOMY_NONE_ID + '" only',
        'when no scope applies at all.',
        '',
    ];

    const tradeOrder = [...SERVICE_LABELS_ARR];
    for (const trade of tradeOrder) {
        const rows = byTrade.get(trade);
        if (!rows?.length) continue;
        lines.push(`${trade}`);
        for (const r of rows) {
            lines.push(`  • ${r.id} — "${r.label}"`);
            lines.push(`    Scope: ${r.scope}`);
            if (r.excludes?.length) {
                lines.push(`    Excludes: ${r.excludes.join(' | ')}`);
            }
        }
        lines.push('');
    }

    lines.push(
        `When subcategory_id is not "${TAXONOMY_NONE_ID}", set trade_detail EXACTLY to that row's label and trade EXACTLY to that row's trade (they will be verified server-side).`
    );
    return lines.join('\n');
}

export interface InferredTradeSignals {
    trade: CanonicalTradeLabel;
    subcategoryId: string;
    label: string;
    matchedKeyword: string;
}

/**
 * Non-AI fallback: longest-anchor-wins substring match across the corpus.
 * Uses inferenceAnchors only — this path has no reasoning ability.
 * Called when the AI classification call fails.
 */
const KEYWORD_LOOKUP: readonly { kw: string; row: TaxonomySubcategory }[] = (() => {
    const pairs: { kw: string; row: TaxonomySubcategory }[] = [];
    for (const row of TAXONOMY_SUBCATEGORIES) {
        for (const kw of row.inferenceAnchors) {
            pairs.push({ kw: kw.toLowerCase().trim(), row });
        }
    }
    return pairs.sort((a, b) => b.kw.length - a.kw.length);
})();

export function inferTradeFromSignals(text: string): InferredTradeSignals | null {
    const blob = String(text ?? '').toLowerCase();
    if (!blob.trim()) return null;
    for (const { kw, row } of KEYWORD_LOOKUP) {
        if (kw.length > 2 && blob.includes(kw)) {
            return {
                trade: row.trade,
                subcategoryId: row.id,
                label: row.label,
                matchedKeyword: kw,
            };
        }
    }
    return null;
}
