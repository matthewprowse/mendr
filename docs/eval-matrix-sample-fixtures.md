# Sample fixtures — Menda eval matrix

A worked example of the markdown format `scripts/eval-load-fixtures.ts` consumes. These eight fixtures cover four trades and illustrate every label the loader recognises. Use it as a template when you're adding your own.

To load this file specifically (e.g. for testing the loader without the full overnight candidates):

```bash
npx tsx scripts/eval-load-fixtures.ts docs/eval-matrix-sample-fixtures.md --ignore-photos
```

The `--ignore-photos` flag lets you preview the parser output even when you haven't downloaded the photos. To actually run the matrix you'd drop the corresponding files into `~/Downloads/` first.

---

## Fixtures by subcategory

### Plumbing

#### geyser_fault_plumbing

**Scope:** Plumbing-side geyser faults — leaks, drip-tray overflow, corroded tank, failed pressure relief valve, snapped inlet/outlet pipe.

| ID | Description | user_text | Image candidates | Suggested search | expected_sid | expected_trade | requires_clarification | title_includes_any |
|----|-------------|-----------|------------------|------------------|-------------|----------------|------------------------|-------------------|
| sample-geyser-rusty-drip-tray-1 | Drip tray has rusty water — tank corrosion likely | "The drip tray under our geyser has been filling up with rusty brown water. Hot water bills are up too. The geyser is 9 years old." | [kwikot.com](https://kwikot.com/troubleshooting) | corroded geyser tank rusty drip tray South Africa | geyser_fault_plumbing | Plumbing | false | Corroded, Geyser, Tank |
| sample-geyser-prv-dripping-2 | Pressure relief valve is dripping outside | "There's water dripping from the pipe outside the wall near the geyser, all the time. The geyser still makes hot water fine." | | pressure relief valve dripping geyser overflow | geyser_fault_plumbing | Plumbing | false | Pressure, Valve, Geyser |

#### blocked_drain

**Scope:** Any blockage in waste plumbing — sinks, toilets, baths, gully traps, stormwater drains.

| ID | Description | user_text | Image candidates | Suggested search | expected_sid | expected_trade | requires_clarification | title_includes_any |
|----|-------------|-----------|------------------|------------------|-------------|----------------|------------------------|-------------------|
| sample-drain-sewage-backup-1 | Sewage rising in shower drain — outside manhole likely blocked | "Sewage water is coming UP through the shower drain when we flush the toilet. There's a smell from the manhole outside." | | sewage backup manhole blocked South Africa drain | blocked_drain | Plumbing | false | Drain, Sewage, Blocked |
| sample-drain-slow-kitchen-2 | Kitchen sink drains slowly — minimal text | "Kitchen sink drains very slowly." | | slow kitchen sink drain South Africa | blocked_drain | Plumbing | true | Drain, Sink |

### Electrical

#### geyser_electrical

**Scope:** Electrical faults on the geyser circuit — failed element, faulty thermostat, breaker tripping, no heat despite power.

| ID | Description | user_text | Image candidates | Suggested search | expected_sid | expected_trade | requires_clarification | title_includes_any |
|----|-------------|-----------|------------------|------------------|-------------|----------------|------------------------|-------------------|
| sample-geyser-no-heat-1 | No hot water, geyser full, breaker on | "We've got no hot water. The geyser is full — you can hear it. The breaker is on at the DB board. Nothing heats." | | geyser element failed no heat Kwikot | geyser_electrical | Electrical | false | Element, Geyser, No Heat |
| sample-geyser-breaker-trips-2 | Geyser breaker keeps tripping at timer-on time | "The geyser breaker trips every morning when the timer kicks in. I reset it, then it trips again the next morning." | | geyser breaker tripping element thermostat short | geyser_electrical | Electrical | false | Breaker, Geyser, Trip |

### Security

#### gate_motor_fault

**Scope:** Driveway gate motor and gate failures — Centurion, ET, DTS, Hansa. Includes motor unit, gearbox, control board, battery, limit switches, gate leaf.

| ID | Description | user_text | Image candidates | Suggested search | expected_sid | expected_trade | requires_clarification | title_includes_any |
|----|-------------|-----------|------------------|------------------|-------------|----------------|------------------------|-------------------|
| sample-gate-battery-fail-1 | Centurion D5 unresponsive after load-shedding | "Our sliding gate stopped working after last night's load-shedding. The remote light comes on but the gate doesn't move at all." | [centsys.co.za](https://support.centsys.co.za) | Centurion D5 motor dead after load-shedding battery | gate_motor_fault | Security | false | Battery, Gate Motor |

### Building & Construction

#### roof_leak_repair

**Scope:** Pitched and flat roof leaks — missing tiles, IBR rust, valley flashing, ridge tile damage, gutter overflow into the cavity wall.

| ID | Description | user_text | Image candidates | Suggested search | expected_sid | expected_trade | requires_clarification | title_includes_any |
|----|-------------|-----------|------------------|------------------|-------------|----------------|------------------------|-------------------|
| sample-roof-tile-missing-1 | Two slate tiles dislodged in southeasterly wind | "The southeaster blew off two slate tiles last week. There's a damp patch on the ceiling now." | | slate roof tile blown off southeaster Cape Town | roof_leak_repair | Building & Construction | false | Roof, Tile, Leak |

---

## What the loader produces from this file

When run against this file with `--ignore-photos`, the loader emits:

```
Loaded 8 fixture(s), skipped 0.

By trade:
  Plumbing                      4
  Electrical                    2
  Security                      1
  Building & Construction       1

By subcategory (loaded):
  geyser_fault_plumbing         2
  blocked_drain                 2
  geyser_electrical             2
  gate_motor_fault              1
  roof_leak_repair              1
```

Without `--ignore-photos` (the matrix's normal mode), each fixture would only be loaded if a matching photo exists at `~/Downloads/sample-geyser-rusty-drip-tray-1.HEIC` (or `.jpg`, `.png`) etc.

---

## Edge cases this sample covers

- **Multi-word trade names** (`Building & Construction`) round-trip through the loader unchanged.
- **Empty `Image candidates` cell** is fine — only `id` and `user_text` are required.
- **Quoted `user_text`** has its surrounding quotes stripped.
- **Comma-separated `title_includes_any`** parses into an array.
- **`requires_clarification: true`** flips the matrix's `commit` expectation to `false`.
- **Empty `user_text` with a non-photos-only id** is accepted — the orchestrator produces these for "photos only" candidates.
