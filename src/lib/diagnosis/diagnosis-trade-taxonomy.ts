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
 * Full taxonomy across all 12 platform service categories.
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
            trade: 'Electrical',
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
            trade: 'Building & Construction',
            scope: 'Any fault with a residential roof — including active leaks during or after rain, missing, cracked, or broken roof tiles, damaged IBR or corrugated iron sheeting, failed ridging or flashing, leaking skylights, damaged roof trusses or battens, fascia and barge board damage, and gutters that are detached or directing water into the structure. Cape Town\'s wet winter rainfall makes roof leaks one of the most frequent building faults.',
            excludes: [
                'Waterproofing coatings applied to flat roofs as paint (→ roof_waterproof_coating in Painting)',
            ],
            inferenceAnchors: ['roof leak', 'roof tiles', 'leaking roof', 'roof repair', 'gutters', 'ibr sheeting', 'corrugated roof', 'ridging'],
        },
        {
            id: 'damp_waterproofing',
            label: 'Damp / Waterproofing',
            trade: 'Building & Construction',
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
            trade: 'Painting',
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
            scope: 'Removal of garden and plant waste — including branches, tree stumps, hedge cuttings, grass clippings, and green waste from garden clean-ups. Includes large storm-damaged branch and tree removal, which is frequent in Cape Town after south-easter and winter storms.',
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
