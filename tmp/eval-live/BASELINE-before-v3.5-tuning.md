# Eval matrix — 2026-05-27T13-29-24-409Z

Rounds per cell: 1

## Aggregate score per cell

| Cell | Setup | Score | Mean conf | Commit rate | Title stability |
|------|-------|------:|----------:|------------:|----------------:|
| A | 2.5 model + v2.5 prompts | 13/13 (100%) | 98.0 | 100% | 100% |
| B | 2.5 model + v3.5 prompts | 13/13 (100%) | 98.0 | 75% | 100% |
| C | 3.5 model + v2.5 prompts | 12/13 (92%) | 82.5 | 50% | 100% |
| D | 3.5 model + v3.5 prompts | 10/13 (77%) | 81.7 | 33% | 100% |

## Per-test breakdown

### geyser-full-cues
_"The geyser is leaking, the water in the drip tray is rusty brown, our electricity bill has gone up and the hot water doesn't last as long."_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| A | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 98 | 1/1 |
| B | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 98 | 1/1 |
| C | Corroded Geyser Cylinder | geyser_fault_plumbing ✓ | Plumbing ✓ | 75 | 0/1 |
| D | Corroded Inner Geyser Cylinder | geyser_fault_plumbing ✓ | Plumbing ✓ | 75 | 0/1 |

### geyser-minimal
_"My geyser is leaking."_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| A | Leaking Geyser Inlet or Outlet Fitting | geyser_fault_plumbing ✓ | Plumbing ✓ | 98 | 1/1 |
| B | Leaking Geyser Inlet or Outlet Fitting | geyser_fault_plumbing ✓ | Plumbing ✓ | 98 | 1/1 |
| C | Leaking Pressure Control Valve | geyser_fault_plumbing ✓ | Plumbing ✓ | 75 | 0/1 |
| D | Leaking Geyser Safety Valve | geyser_fault_plumbing ✓ | Plumbing ✓ | 75 | 0/1 |

### garage-with-cause
_"The door opens partially then stops, the motor beeps and it closes again. The spring is missing on one side."_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| A | Missing Garage Door Spring | garage_door_fault ✓ | Security ✓ | 98 | 1/1 |
| B | Missing Garage Door Counterbalance Spring | garage_door_fault ✓ | Security ✓ | 98 | 1/1 |
| C | Missing Left Tension Spring | garage_door_fault ✓ | Security ✓ | 90 | 1/1 |
| D | Missing Counterbalance Tension Spring | garage_door_fault ✓ | Security ✓ | 95 | 1/1 |

### garage-no-text
_(photos only)_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| A | Garage Door Off Track or Misaligned | garage_door_fault ✓ | Security ✓ | 98 | 1/1 |
| B | Upstream Support or Counterbalance Failure | garage_door_fault ✓ | Security ✓ | 98 | 0/1 |
| C | Missing Left Side Tension Spring | garage_door_fault ✓ | Security ✓ | 90 | 1/1 |
| D |  |  ✗ |  ✗ | 0 | 1/1 |
