# Eval comparison: gemini-3.5-flash vs gemini-2.5-flash
**Date:** 2026-05-27
**Pipeline:** v2-classify-prose (Agent 2a + Agent 2b + Agent 2c + Agent 3 critique)
**Hardening Plan:** all three phases active (equipment-mention guard, failure-mode catalog, eval suite)
**Plus the response-builder rescue path** (Agent 2c → rescue when Agent 2a fails)

## Score
| Model | Score | %  |
|-------|------:|---:|
| gemini-3.5-flash | 11/13 | 85% |
| gemini-2.5-flash | 13/13 | **100%** |

## Per-test results

### Test 1 — geyser-full-cues
User text: *"The geyser is leaking, the water in the drip tray is rusty brown, our electricity bill has gone up and the hot water doesn't last as long."*
Expected: title mentions Corroded/Geyser/Cylinder/Tank, trade=Plumbing, sid=geyser_fault_plumbing, commit (no clarification)

| Field | 3.5 Flash | 2.5 Flash |
|---|---|---|
| Title | Failed Geyser Heating Element | **Corroded Geyser Tank** ✓ |
| Sid | geyser_fault_plumbing ✓ | geyser_fault_plumbing ✓ |
| Trade | Plumbing ✓ | Plumbing ✓ |
| Confidence | 75 (Agent 2c h1) | 98 (Agent 2a direct) |
| Commit | needs clarify | ✓ committed |
| Hypotheses | 3 | none (committed) |

### Test 2 — geyser-minimal
User text: *"My geyser is leaking."*
Expected: title mentions Geyser, trade=Plumbing, sid=geyser_fault_plumbing

| Field | 3.5 Flash | 2.5 Flash |
|---|---|---|
| Title | Leaking Pressure Control Valve ✓ | Leaking Geyser Inlet or Outlet Fitting ✓ |
| Sid | geyser_fault_plumbing ✓ | geyser_fault_plumbing ✓ |
| Trade | Plumbing ✓ | Plumbing ✓ |
| Confidence | 70 | 95 |
| Commit | needs clarify | ✓ committed |

### Test 3 — garage-with-cause
User text: *"The door opens partially then stops, the motor beeps and it closes again. The spring is missing on one side."*
Expected: title mentions Spring/Counterbalance/Missing, trade=Security, sid=garage_door_fault, commit

| Field | 3.5 Flash | 2.5 Flash |
|---|---|---|
| Title | Missing Counterbalance Tension Spring ✓ | Missing Garage Door Counterbalance Spring ✓ |
| Sid | garage_door_fault ✓ | garage_door_fault ✓ |
| Trade | Security ✓ | Security ✓ |
| Confidence | **95** | **98** |
| Commit | ✓ committed | ✓ committed |

### Test 4 — garage-no-text (photos only — symmetry test)
Expected: trade=Security, sid=garage_door_fault

| Field | 3.5 Flash | 2.5 Flash |
|---|---|---|
| Title | Missing Left Tension Spring | Upstream Support or Counterbalance Failure |
| Sid | garage_door_fault ✓ | garage_door_fault ✓ |
| Trade | Security ✓ | Security ✓ |
| Confidence | 90 | 98 |
| Hypotheses | 2 (h1@90 committed) | 2 (h1@70 needs clarify) |

## Where each path won
- **3.5 Flash relies on the rescue net**: Agent 2a returns `none_unmapped`+`N/A`+`confidence=0` (FALLBACK_CLASSIFICATION) on every geyser run. Without the rescue, EVERY test would show "Service Not Currently Supported". With the rescue + extractEquipmentMentions, sid+trade come out correct on 3/4 tests; h1Conf is lower (70-75) so commit threshold isn't reached on geyser cases.
- **2.5 Flash classifier is rock-solid**: returns the correct subcategory_id + trade + 95-98% confidence in one shot. No rescue triggered. Agent 2c sometimes still produces hypotheses (Test 4) but Agent 2a's commit already happened.

## Critique signal
- Agent 3 critique fired on 6/8 attempts (3/4 on each model). Test 4 failed to populate critique on both runs — there's a ~5s tail that the script's 8s wait sometimes still misses on the heaviest payloads (4 photos + symmetry block).

## Recommendation
**Ship with gemini-2.5-flash.** It's correct out-of-the-box without needing the rescue path. The hardening plan + rescue net are kept as a robust safety net that catches both:
- 3.5 Flash's classifier flakiness (none_unmapped on clearly-mappable equipment)
- Any future classifier regression on either model
