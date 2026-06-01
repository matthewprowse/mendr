# Phase 5 — Taxonomy Edits Proposal

**Status:** Awaiting Matthew approval. No taxonomy file is edited until you approve this doc.
**Source plan:** [Diagnosis-Architecture-Hardening-Plan.md](./Diagnosis-Architecture-Hardening-Plan.md) §Phase 5.
**Audit basis:** [prompt-content-audit.md](./prompt-content-audit.md) — Bucket B items + the B-half of row 9.

## Premise

Phase 5 moves all trade-domain knowledge out of prompt prose into structured data (`src/lib/diagnosis/diagnosis-trade-taxonomy.ts` + `src/lib/services`). This doc enumerates exactly which data edits are needed and why each one is needed.

After applying these edits, the V2 prompt will reference the taxonomy at runtime (via the new `taxonomy-serializer.ts`); the prompt text itself will contain zero trade names.

## A1 — Add `excludes` to `pool_pump_filter`

**Currently:** [diagnosis-trade-taxonomy.ts:435-440](../src/lib/diagnosis/diagnosis-trade-taxonomy.ts)
```ts
{
    id: 'pool_pump_filter',
    label: 'Pool Pump / Filter Fault',
    trade: 'Pool Maintenance',
    scope: 'Any fault with pool circulation or filtration equipment...',
    inferenceAnchors: [...],
}
```

No `excludes` array. The "pool vs borehole vs irrigation" disambiguation only lives in the prompt prose (Bucket A audit row 4, Bucket C audit row 3).

**Proposed diff:**
```ts
{
    id: 'pool_pump_filter',
    label: 'Pool Pump / Filter Fault',
    trade: 'Pool Maintenance',
    scope: 'Any fault with pool circulation or filtration equipment...',
+   excludes: [
+       'Borehole pump driving a household water supply (→ water_pressure_supply in Plumbing)',
+       'Irrigation pump or garden sprinkler pump (→ irrigation_system in Garden & Landscaping)',
+   ],
    inferenceAnchors: [...],
}
```

**Why:** This is the disambiguation the Bucket A patch "Never output 'pool' or 'Pool Maintenance' if the user said it is not a pool system" was defending. Once the taxonomy carries it, the patch can be deleted.

**Fixture this enables:** `p0-pool-pump-priming-failure.json` — currently fails because the V1 prompt's "pool vs borehole" example fires defensively. With the taxonomy carrying the boundary, the V2 prompt drops the example and the model relies on the structured `excludes` data instead.

## A2 — Add `excludes` to `water_pressure_supply` (borehole side)

**Currently:** [diagnosis-trade-taxonomy.ts:193-201](../src/lib/diagnosis/diagnosis-trade-taxonomy.ts)
```ts
{
    id: 'water_pressure_supply',
    label: 'Water Pressure / Borehole / Supply',
    trade: 'Plumbing',
    scope: 'Any issue with low or high water pressure throughout a property... borehole pump faults...',
    inferenceAnchors: [...],
}
```

No `excludes`. Reciprocal of A1.

**Proposed diff:**
```ts
{
    id: 'water_pressure_supply',
    label: 'Water Pressure / Borehole / Supply',
    trade: 'Plumbing',
    scope: 'Any issue with low or high water pressure...',
+   excludes: [
+       'Pool circulation or filtration pump (→ pool_pump_filter in Pool Maintenance)',
+       'Dedicated garden irrigation pump (→ irrigation_system in Garden & Landscaping)',
+   ],
    inferenceAnchors: [...],
}
```

**Why:** Symmetry. Without the reciprocal exclude, the model could route a clear borehole-pump case to Pool Maintenance just as easily as the reverse. Both endpoints of the pair need the disambiguation.

## A3 — Add `excludes` to `irrigation_system` (cross-points to pool)

**Currently:** [diagnosis-trade-taxonomy.ts:505-512](../src/lib/diagnosis/diagnosis-trade-taxonomy.ts)
```ts
{
    id: 'irrigation_system',
    label: 'Garden Irrigation System',
    trade: 'Garden & Landscaping',
    scope: 'Installation, repair, or programming of garden irrigation systems...',
    excludes: [
        'Leaking mains outdoor tap or supply pipe fitting (→ tap_toilet_repair or burst_pipe_leak in Plumbing)',
    ],
    inferenceAnchors: [...],
}
```

Already has an `excludes` for plumbing taps, but nothing pointing at pool.

**Proposed diff:**
```ts
{
    id: 'irrigation_system',
    ...
    excludes: [
        'Leaking mains outdoor tap or supply pipe fitting (→ tap_toilet_repair or burst_pipe_leak in Plumbing)',
+       'Pool circulation pump or filter equipment (→ pool_pump_filter in Pool Maintenance)',
+       'Borehole pump driving household supply (→ water_pressure_supply in Plumbing)',
    ],
    ...
}
```

**Why:** Completes the three-way disambiguation triangle (pool ↔ borehole ↔ irrigation). The Bucket C audit row 3's "pool vs borehole vs irrigation" example then has all three boundaries encoded in data, so the prose can drop the example.

## A4 — Extend `building_extensions.scope` to cover whole-room interior rebuilds

**Currently:** [diagnosis-trade-taxonomy.ts:238-244](../src/lib/diagnosis/diagnosis-trade-taxonomy.ts)
```ts
{
    id: 'building_extensions',
    label: 'General Building / Extensions',
    trade: 'Building & Construction',
    scope: 'General building and construction work — including room additions, garage and outbuilding construction, Wendy house upgrades to permanent structures, carport construction, foundation repairs, slab cracking, and any significant structural changes to a property.',
    inferenceAnchors: ['room extension', 'wendy house', 'carport building', 'foundation', 'structural repair', 'new room', 'outbuilding'],
}
```

Scope mentions "room additions" and "structural changes" but does NOT mention whole-room interior renovations. The Bucket A audit row 6 + Bucket B audit row 9 cite "Kitchen renovation", "full rebuild" examples that need a taxonomy home.

**Proposed diff:**
```ts
{
    id: 'building_extensions',
    label: 'General Building / Extensions',
    trade: 'Building & Construction',
-   scope: 'General building and construction work — including room additions, garage and outbuilding construction, Wendy house upgrades to permanent structures, carport construction, foundation repairs, slab cracking, and any significant structural changes to a property.',
+   scope: 'General building and construction work — including room additions, garage and outbuilding construction, Wendy house upgrades to permanent structures, carport construction, foundation repairs, slab cracking, and any significant structural changes to a property. Also covers whole-room interior rebuilds when damage is extensive (kitchen, bathroom, or other room fully gutted and rebuilt), or when the homeowner explicitly requests a full renovation rather than a surface repair — these route here, not to surface-finish specialists like tilers or painters.',
+   excludes: [
+       'Single-fixture or single-finish repairs (→ tile_repair, interior_painting, etc.)',
+   ],
    inferenceAnchors: ['room extension', 'wendy house', 'carport building', 'foundation', 'structural repair', 'new room', 'outbuilding', 'kitchen renovation', 'bathroom renovation', 'full rebuild', 'gut and rebuild'],
}
```

**Why:** Bucket A row 6 and Bucket B audit row 9 both point at this boundary. Currently the prompt has prose examples ("Kitchen renovation", "Building contractor") doing the routing — fragile. With the scope extended, the routing happens in data and the prose examples can go.

**Alternative considered:** Adding a new `building_full_rebuild` subcategory. Rejected because: (a) it'd duplicate ~80% of `building_extensions.scope`; (b) the homeowner-facing label "General Building / Extensions" already reads naturally for full-rebuild work; (c) one row is easier to keep in sync than two near-duplicate rows.

## A5 — Add `EXCLUDED_SERVICES` constant in `lib/services`

**Currently:** No such constant. The "we don't do domestic workers / cleaners / gardeners" list exists ONLY as prose at [validation.ts:9](../src/features/diagnosis/prompts/validation.ts).

**Proposed addition** to [src/lib/services.ts](../src/lib/services.ts):
```ts
/**
 * Service categories Mendr explicitly does NOT cover. Sent to Agent 2a's
 * V2 prompt so the model can set `unserviced: true` deterministically when
 * the user asks for one of these. Maintained as a code constant so future
 * additions don't drift into the prompt body (Phase 5 Bucket B migration).
 */
export const EXCLUDED_SERVICES: readonly string[] = [
    'Domestic workers / household staff',
    'Cleaners (house, office, post-construction)',
    'Gardeners (regular maintenance/lawn — distinct from landscape design)',
    'Au pairs / childcare',
    'Pet sitters / dog walkers',
] as const;
```

**Why:** Audit row 22 — the "what we don't do" list is the inverse of the taxonomy and currently duplicated in prose. A code constant + composer injection means changes propagate once and stay in sync.

**Decision point:** I've listed 5 categories I'm confident about. Are there others you want included (e.g. "Legal / conveyancing", "Architectural design", "Tax")?

## Edits I am NOT proposing (and why)

- **gate_motor_fault ↔ garage_door_fault** (audit row 29). Already has the disambiguation in taxonomy:
  ```ts
  excludes: [
      'Garage doors on ceiling track (→ garage_door_fault)',
      'Intercom or access control panels (→ intercom_access_control)',
      'Mechanical gate lock or padlock faults (→ Locksmith Services)',
  ],
  ```
  No taxonomy edit needed; the prompt just stops duplicating.

- **Canonical trade list** (audit row 11). Lives in `lib/services` already. Phase 5's composer changes (P5.6) inject `SERVICE_LABELS_ARR` at runtime — this is a composer change, not a taxonomy change.

- **UNSUPPORTED_HOME_SERVICE rule** (audit row 15). Will become a code-level pre-classification guard in `lib/diagnosis/` that compares the user's request against `TAXONOMY_SUBCATEGORIES + EXCLUDED_SERVICES`. Code change in P5.5/P5.6, not a taxonomy edit.

## Summary

| ID | Edit | File:line | Effort |
|---|---|---|---|
| A1 | Add `excludes` to `pool_pump_filter` | taxonomy.ts:435 | ~6 lines |
| A2 | Add `excludes` to `water_pressure_supply` | taxonomy.ts:193 | ~6 lines |
| A3 | Add to `irrigation_system.excludes` | taxonomy.ts:510 | ~2 lines |
| A4 | Extend `building_extensions.scope` + add `excludes` | taxonomy.ts:238 | ~10 lines |
| A5 | New `EXCLUDED_SERVICES` constant | `lib/services.ts` | ~10 lines |

Total taxonomy footprint: 5 surgical edits. No new subcategories. No structural changes — `TaxonomySubcategory` interface stays as-is.

## Approval requested

- [ ] **A1** — Add pool/borehole/irrigation excludes to `pool_pump_filter`.
- [ ] **A2** — Add reciprocal excludes to `water_pressure_supply`.
- [ ] **A3** — Add reciprocal excludes to `irrigation_system`.
- [ ] **A4** — Extend `building_extensions` scope + excludes for whole-room rebuilds (decision: extend scope vs add new subcategory — recommendation: extend).
- [ ] **A5** — Create `EXCLUDED_SERVICES` constant in `lib/services` (decision: 5 categories listed vs add more — list anything missing).

Once approved, P5.2 applies the edits and the rest of Phase 5 proceeds.
