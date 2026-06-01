# Eval matrix — 2026-05-27T14-11-00-496Z

Rounds per cell: 1

## Aggregate score per cell

| Cell | Setup | Score | Mean conf | Commit rate | Title stability |
|------|-------|------:|----------:|------------:|----------------:|
| A | 2.5 model + v2.5 prompts | 13/13 (100%) | 98.0 | 75% | 100% |
| B | 2.5 model + v3.5 prompts | 13/13 (100%) | 95.0 | 50% | 100% |
| C | 3.5 model + v2.5 prompts | 12/13 (92%) | 82.5 | 50% | 100% |
| D | 3.5 model + v3.5 prompts | 12/13 (92%) | 82.5 | 50% | 100% |

## Per-test breakdown

### geyser-full-cues
_"The geyser is leaking, the water in the drip tray is rusty brown, our electricity bill has gone up and the hot water doesn't last as long."_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| A | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 98 | 1/1 |
| B | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 95 | 1/1 |
| C | Ruptured Inner Cylinder | geyser_fault_plumbing ✓ | Plumbing ✓ | 75 | 0/1 |
| D | Corroded Geyser Inner Cylinder | geyser_fault_plumbing ✓ | Plumbing ✓ | 75 | 0/1 |

### geyser-minimal
_"My geyser is leaking."_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| A | Leaking Geyser Inlet Fitting | geyser_fault_plumbing ✓ | Plumbing ✓ | 98 | 1/1 |
| B | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 95 | 0/1 |
| C | Leaking Geyser Vacuum Breaker | geyser_fault_plumbing ✓ | Plumbing ✓ | 75 | 0/1 |
| D | Leaking Pressure Control Valve | geyser_fault_plumbing ✓ | Plumbing ✓ | 65 | 0/1 |

### garage-with-cause
_"The door opens partially then stops, the motor beeps and it closes again. The spring is missing on one side."_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| A | Missing Garage Door Counterbalance Spring | garage_door_fault ✓ | Security ✓ | 98 | 1/1 |
| B | Missing or Broken Garage Door Spring | garage_door_fault ✓ | Security ✓ | 95 | 1/1 |
| C | Missing Garage Door Tension Spring | garage_door_fault ✓ | Security ✓ | 85 | 1/1 |
| D | Missing Tension Spring | garage_door_fault ✓ | Security ✓ | 95 | 1/1 |

### garage-no-text
_(photos only)_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| A | Snapped Garage Door Lifting Cable | garage_door_fault ✓ | Security ✓ | 98 | 0/1 |
| B | Garage Door Off Track or Misaligned | garage_door_fault ✓ | Security ✓ | 95 | 0/1 |
| C | Missing Garage Door Extension Spring | garage_door_fault ✓ | Security ✓ | 95 | 1/1 |
| D | Broken Tension Spring | garage_door_fault ✓ | Security ✓ | 95 | 1/1 |
