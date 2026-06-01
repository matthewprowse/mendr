# Background agents — operator guide

End-to-end reference for the overnight prompt-improvement loops. If you're
returning to this after a few days off, start here.

---

## What this is

Three parallel improvement tracks, each driven by a self-contained agent
prompt under `.claude/agents/`, coordinated by `scripts/eval-overnight.ts`,
and budget-gated by `scripts/eval-spend-tracker.ts` reading the
`ai_cost_events` Supabase table.

| Track | Owner agent | What it improves                       | Files in scope                                  |
|------:|-------------|-----------------------------------------|-------------------------------------------------|
| **A** | `track-a-2-5-polisher.md`    | `v2_5_polished` prompts (wording, sampling) | `src/features/diagnosis/prompts/variants/v2_5_polished/*` |
| **B** | `track-b-3-5-architect.md`   | `v3_5_native` prompts (multi-step protocol, thinking, schema) | `src/features/diagnosis/prompts/variants/v3_5_native/*`   |
| **C** | `track-c-hybrid-builder.md`  | Hybrid routing pipeline (schema, router, telemetry)            | `src/features/diagnosis/{types,agent-classify,agent-prose,processing-orchestrator}.ts` + new files |

Each iteration:
1. Bails on pre-flight (kill switch / dirty tree / budget / no items / no baseline).
2. Picks one backlog item from `docs/prompt-improvement-backlog.md`.
3. Creates a fresh branch.
4. Hands the actual change to a Claude sub-agent (manual handoff by default).
5. Runs `npm run eval:smoke` against the change.
6. Keeps the branch on improvement, deletes it on regression.
7. Logs the result to `tmp/eval-overnight/runs.jsonl`.

---

## Daily routine

### Before bed

```bash
# Sanity check budget
npm run agents:status

# Pick a track. The default cap is $5/night.
npm run agents:overnight:track-a
# OR track-b, OR track-c
```

If `CLAUDE_AGENT_COMMAND` is unset (the default), the script will create a
branch and drop a task file under `tmp/eval-overnight/pending/<branch>.task.md`,
then exit. Pick up the task file the next morning to run the agent
interactively, OR set the env var to a script that spawns Claude
non-interactively (see "Hands-off mode" below).

### In the morning

```bash
# What ran overnight?
tail tmp/eval-overnight/runs.jsonl | jq .

# Inspect branches the agent kept:
git branch | grep -E "(2-5-polish|3-5-native|hybrid)-"

# Look at a specific branch's delta:
git diff main..<branch-name>

# Review the smoke matrix report it produced:
ls -lt tmp/eval-live/matrix-*.md | head -3
```

For each kept branch, decide: merge it (`git merge <branch>`), iterate
further, or discard.

---

## Setting up scheduled triggering

The orchestrator is one-shot — it runs a single iteration and exits.
Recurring nightly invocation is the harness's job, not the script's.
Options, ranked roughly from simplest to most-integrated:

1. **`launchd` / `cron` on your local machine.** Add a job that runs:
   ```cron
   0 2 * * * cd "/Users/matthewprowse/Documents/Development/Personal/Home Services/app" && npm run agents:overnight:track-a >> tmp/eval-overnight/cron.log 2>&1
   ```
   Stagger Track B and C by an hour.

2. **Claude Code `mcp__scheduled-tasks__create_scheduled_task`.** The harness
   exposes a scheduled-tasks MCP — you can register the npm script as a
   routine. This is the recommended path if you're already inside Claude
   Code. (See `/schedule` skill.)

3. **GitHub Actions** if you want it cloud-hosted — but note this loses the
   "local dev server" assumption that `eval-matrix.ts` makes.

Whichever you pick, **always honour the kill switch** — see below.

---

## Hands-off mode (no manual handoff)

Set in `.env.local`:

```bash
CLAUDE_AGENT_COMMAND="<path-to-script-that-spawns-claude-headlessly>"
```

The script gets called as:
```
<command> <absolute-path-to-agent-prompt.md> <backlog-item-id> <branch-name>
```

It must exit 0 on success. The orchestrator then continues with the smoke
eval and the keep/discard decision. If you don't have a headless Claude
invocation ready, leave the var unset — manual mode is safer to start with.

---

## Emergency stop — kill switch

If the agents are misbehaving (regressions every night, spend climbing
fast, prompts going off the rails), kill them globally without touching
code:

```bash
# In app/.env.local
BACKGROUND_AGENTS_ENABLED=0
```

The orchestrator checks this on entry and bails with exit code 2 before
doing anything else. Set it back to `1` (or unset entirely) to resume.

The kill switch does NOT roll back branches the agents already created.
Inspect them manually after a kill.

---

## Adding a new backlog item

Edit `docs/prompt-improvement-backlog.md`. Pick a stable id (the orchestrator
uses it to mark items in-progress / landed / regressed). Required fields:

```markdown
### a-my-new-item

- Track: A
- Description: One-line summary.
- Files: src/features/diagnosis/prompts/variants/v2_5_polished/*
- Target metric: what eval-matrix output should change, by how much
- Difficulty: S
- Status: pending
```

The orchestrator picks `S` before `M` before `L`, so put quick wins first.

To **retire** an item, change `Status: pending` to `Status: landed` (or just
delete the block — the parser tolerates either).

---

## How the budget cap is enforced

Three checkpoints in `eval-overnight.ts`:

1. **Pre-flight** — before any work, `hasBudgetRemaining(cap)` reads
   `ai_cost_events` for today's total. If `total >= cap`, bail.
2. **Pre-smoke** — between the agent step and `npm run eval:smoke`, re-check.
   The smoke matrix is the only Gemini-spending operation in the loop, and
   it can be skipped if budget hit during agent work.
3. **Per-agent self-check** — each agent prompt instructs the sub-agent to
   call `eval-spend-tracker.ts --summary` before any ad-hoc Gemini call it
   makes during the change-application step.

`hasBudgetRemaining` is **fail-safe**: if the Supabase query errors, it
returns `false`. Better to bail noisily than to risk runaway spend.

---

## Interpreting eval delta reports

`npm run eval:smoke` writes both:
- `tmp/eval-live/matrix-<ts>.md` — human-readable
- `tmp/eval-live/matrix-<ts>.json` — what the orchestrator parses for the
  keep/discard decision

The orchestrator scores by **sum of `correct` over sum of `totalChecks`**
across all cells in the smoke matrix. It keeps the branch when after ≥
baseline.

Per-test breakdown (in the `.md`) is where regressions hide. A `2/3` cell
that was `3/3` in baseline is a regression even if the aggregate didn't
shift. Always read the per-test section before merging a kept branch.

---

## Handling a stuck iteration

Signs:
- Same item flips `pending → in-progress → regressed → pending` for 3+
  nights running.
- `runs.jsonl` shows escalating `discarded` outcomes on the same item.

What to do:
1. Read the divergence log entries the agent left. Are they coherent? If
   not, the prompt may be too vague — tighten the `Target metric:` in the
   backlog.
2. Bump the item's `Difficulty` from `S` to `M`/`L`. The orchestrator picks
   smaller first, so this lets it work on other things while you think.
3. If you suspect the eval itself is wrong (e.g. a test is mis-labelled),
   fix the eval, not the prompt.
4. As a nuclear option, delete the item from the backlog and write a
   one-line note in `prompt-changelog.md` saying why.

---

## Architecture diagram (text)

```
                    ┌──────────────────────────────────┐
                    │  cron / launchd / scheduled-tasks│
                    └──────────────┬───────────────────┘
                                   │ npm run agents:overnight:track-X
                                   ▼
                    ┌──────────────────────────────────┐
                    │  scripts/eval-overnight.ts       │
                    │                                  │
                    │  1. check BACKGROUND_AGENTS_ENABLED
                    │  2. check git clean              │
                    │  3. check budget (spend-tracker) │
                    │  4. read latest AFTER-*.json     │
                    │  5. pick backlog item            │
                    │  6. git checkout -b <branch>     │
                    │  7. delegate to agent ──────────┐│
                    │                                 ││
                    │  9. budget recheck              ││
                    │  10. npm run eval:smoke         ││
                    │  11. compare delta              ││
                    │  12. keep or discard            ││
                    │  13. append runs.jsonl          ││
                    └──────────────────────────────────┘│
                                                        │
                       .claude/agents/track-X-*.md  ◄───┘
                              (sub-agent applies change)
                                       │
                                       ▼
                       ai_cost_events ◄─── gemini calls
                       (Supabase table — source of truth for spend)
```

---

## Quick reference — npm scripts

| Script                              | What it does                                                  |
|-------------------------------------|---------------------------------------------------------------|
| `npm run agents:status`             | Today's AI spend, broken down by model and endpoint.          |
| `npm run agents:backlog`            | Print the backlog file.                                       |
| `npm run agents:overnight:track-a`  | Run one Track A iteration. $5 cap, branch prefix `2-5-polish`. |
| `npm run agents:overnight:track-b`  | Run one Track B iteration. $5 cap, branch prefix `3-5-native`. |
| `npm run agents:overnight:track-c`  | Run one Track C iteration. $5 cap, branch prefix `hybrid`.    |

---

*Last updated: May 2026. See `docs/plans/2026-05-27-dual-model-optimization.md` for the full design rationale.*
