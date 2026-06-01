# Eval matrix — 2026-05-27T14-39-16-534Z

Rounds per cell: 1

## Aggregate score per cell

| Cell | Setup | Score | Mean conf | Commit rate | Title stability |
|------|-------|------:|----------:|------------:|----------------:|
| D | 3.5 model + v3.5 prompts | 8/13 (62%) | 95.0 | 100% | 100% |

## Per-test breakdown

### geyser-full-cues
_"The geyser is leaking, the water in the drip tray is rusty brown, our electricity bill has gone up and the hot water doesn't last as long."_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| D | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 95 | 1/1 |

### geyser-minimal
_"My geyser is leaking."_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| D | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 95 | 1/1 |

### garage-with-cause
_"The door opens partially then stops, the motor beeps and it closes again. The spring is missing on one side."_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| D |  |  ✗ |  ✗ | 0 | 1/1 |

### garage-no-text
_(photos only)_

| Cell | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|-----:|:------:|
| D |  |  ✗ |  ✗ | 0 | 1/1 |
