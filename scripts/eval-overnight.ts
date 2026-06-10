/**
 * Overnight orchestrator — single-iteration improvement runner.
 *
 * ONE invocation = ONE improvement attempt. This script is the SHELL — it
 * picks a backlog item, spins up a branch, hands the actual code change to a
 * sub-agent (see .claude/agents/track-*.md), runs the smoke eval, compares
 * delta, and either keeps or discards the branch. It NEVER merges, NEVER
 * pushes, NEVER opens a PR — the human reviews the branch in the morning.
 *
 * Cron / scheduler hooks should call this script with `--track <A|B|C>` and a
 * `--budget-cap-usd`. The script bails immediately if:
 *   - BACKGROUND_AGENTS_ENABLED=0 (emergency kill switch)
 *   - The git working tree is dirty
 *   - Current spend in ai_cost_events ≥ cap
 *   - No actionable backlog item remains for the track
 *
 * Usage:
 *   npx tsx scripts/eval-overnight.ts --track A --budget-cap-usd 5 --branch-prefix 2-5-polish
 *   npx tsx scripts/eval-overnight.ts --help
 *   npx tsx scripts/eval-overnight.ts --dry-run --track A   # plan only, no mutations
 *
 * Exit codes:
 *   0  iteration completed (improvement kept OR discarded — both are "ok")
 *   2  bailed pre-flight (kill switch, dirty tree, budget exhausted, no items)
 *   1  unexpected error (look at runs.jsonl entry)
 *
 * NOTE: The actual prompt-tweaking step happens via a sub-agent invocation.
 * The two integration modes are:
 *   (a) CLAUDE_AGENT_COMMAND env var set → spawn that command, pass it the
 *       agent prompt file + backlog item; it returns 0 on success.
 *   (b) CLAUDE_AGENT_COMMAND unset → the script writes an "agent task" file
 *       and EXITS with a message asking the user to run the agent manually
 *       (or to wire up CLAUDE_AGENT_COMMAND for hands-off mode).
 * Either way, the orchestrator runs the eval and decides keep/discard.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { hasBudgetRemaining, getSpendSummary } from './eval-spend-tracker';

// Mirror Next.js env-loading order
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '.env.local'), override: true });

// ── Types ─────────────────────────────────────────────────────────────────────

type Track = 'A' | 'B' | 'C';

interface CliOpts {
    readonly track: Track | null;
    readonly budgetCapUsd: number;
    readonly branchPrefix: string;
    readonly help: boolean;
    readonly dryRun: boolean;
    readonly backlog: string;
    readonly baselineDir: string;
}

interface BacklogItem {
    readonly id: string;
    readonly track: Track;
    readonly description: string;
    readonly status: 'pending' | 'in-progress' | 'landed' | 'regressed';
    readonly difficulty: 'S' | 'M' | 'L';
    readonly raw: string; // the original markdown block
}

interface IterationRun {
    readonly ts: string;
    readonly track: Track;
    readonly itemId: string | null;
    readonly branch: string | null;
    readonly baselinePath: string | null;
    readonly afterPath: string | null;
    readonly outcome:
        | 'kept'
        | 'discarded'
        | 'agent-handoff'
        | 'bailed-kill-switch'
        | 'bailed-budget'
        | 'bailed-dirty-tree'
        | 'bailed-no-items'
        | 'bailed-no-baseline'
        | 'bailed-agent-failed'
        | 'errored';
    readonly notes: string;
    readonly spentUsdBefore: number;
    readonly spentUsdAfter?: number;
    readonly elapsedMs: number;
}

// ── CLI parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): CliOpts {
    function val(name: string, fallback: string): string {
        const i = argv.indexOf(`--${name}`);
        if (i === -1 || i === argv.length - 1) return fallback;
        return argv[i + 1];
    }
    function has(name: string): boolean {
        return argv.includes(`--${name}`);
    }
    const rawTrack = val('track', '').toUpperCase();
    const track = (['A', 'B', 'C'] as const).find((t) => t === rawTrack) ?? null;
    return {
        track,
        budgetCapUsd: Number.parseFloat(val('budget-cap-usd', '5')) || 5,
        branchPrefix: val('branch-prefix', 'agent'),
        help: has('help') || has('h'),
        dryRun: has('dry-run'),
        backlog: val('backlog', 'docs/prompt-improvement-backlog.md'),
        baselineDir: val('baseline-dir', 'tmp/eval-live'),
    };
}

function printHelp(): void {
    // eslint-disable-next-line no-console
    console.log(
        [
            'eval-overnight — single-iteration improvement runner',
            '',
            'Usage:',
            '  npx tsx scripts/eval-overnight.ts --track <A|B|C> --budget-cap-usd <usd> --branch-prefix <name>',
            '',
            'Options:',
            '  --track <A|B|C>            Required. Which improvement track to advance.',
            '  --budget-cap-usd <usd>     Hard cap for today\'s spend (default 5).',
            '  --branch-prefix <name>     Branch name prefix (default "agent").',
            '  --backlog <path>           Backlog file (default docs/prompt-improvement-backlog.md).',
            '  --baseline-dir <path>      Where AFTER-*.json files live (default tmp/eval-live).',
            '  --dry-run                  Print the plan, make no mutations.',
            '  --help, -h                 Show this help.',
            '',
            'Environment:',
            '  BACKGROUND_AGENTS_ENABLED  Set to "0" to globally pause all agent runs.',
            '  CLAUDE_AGENT_COMMAND       Optional. Command spawned to apply the change.',
            '                             Receives: <agent-prompt-path> <backlog-item-id> <branch>.',
            '                             Must exit 0 on success, non-zero to abort.',
            '',
            'Exit codes:',
            '  0  iteration completed (kept or discarded)',
            '  2  bailed pre-flight (kill switch, dirty tree, budget, no items)',
            '  1  unexpected error',
        ].join('\n'),
    );
}

// ── Shell helpers ─────────────────────────────────────────────────────────────

function sh(cmd: string, opts: { allowFail?: boolean; cwd?: string } = {}): { stdout: string; ok: boolean } {
    try {
        const stdout = execSync(cmd, { encoding: 'utf8', cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        return { stdout: stdout.toString(), ok: true };
    } catch (err) {
        if (opts.allowFail) {
            const e = err as { stdout?: Buffer; stderr?: Buffer };
            return { stdout: `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`, ok: false };
        }
        throw err;
    }
}

function isGitClean(): boolean {
    const { stdout } = sh('git status --porcelain', { allowFail: true });
    return stdout.trim().length === 0;
}

function gitInRepo(): boolean {
    const { ok } = sh('git rev-parse --is-inside-work-tree', { allowFail: true });
    return ok;
}

function currentBranch(): string {
    const { stdout } = sh('git rev-parse --abbrev-ref HEAD', { allowFail: true });
    return stdout.trim();
}

function makeBranchName(prefix: string): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `${prefix}-${stamp}`;
}

// ── Backlog parsing ───────────────────────────────────────────────────────────

/**
 * Parses the markdown backlog. Each item is a `### <id>` heading followed by
 * key/value lines like `- Track: A`, `- Status: pending`, `- Difficulty: S`.
 * Items missing required keys are skipped with a warning.
 */
function parseBacklog(path: string): BacklogItem[] {
    if (!existsSync(path)) return [];
    const txt = readFileSync(path, 'utf8');
    const blocks = txt.split(/^### /m).slice(1); // drop pre-heading content
    const items: BacklogItem[] = [];
    for (const block of blocks) {
        const lines = block.split('\n');
        const id = (lines[0] ?? '').trim();
        if (!id) continue;
        const get = (key: string): string => {
            const re = new RegExp(`^[-*]\\s*${key}\\s*:\\s*(.+)$`, 'im');
            const m = block.match(re);
            return m ? m[1].trim() : '';
        };
        const trackRaw = get('Track').toUpperCase();
        const track = (['A', 'B', 'C'] as const).find((t) => t === trackRaw);
        if (!track) continue;
        const statusRaw = get('Status').toLowerCase();
        const status = (['pending', 'in-progress', 'landed', 'regressed'] as const).find((s) => s === statusRaw) ?? 'pending';
        const diffRaw = get('Difficulty').toUpperCase();
        const difficulty = (['S', 'M', 'L'] as const).find((d) => d === diffRaw) ?? 'M';
        const description = get('Description') || get('Goal') || '';
        items.push({ id, track, description, status, difficulty, raw: `### ${block}` });
    }
    return items;
}

/** Rewrite the backlog file flipping one item's status. */
function updateBacklogItemStatus(path: string, itemId: string, newStatus: BacklogItem['status']): void {
    if (!existsSync(path)) return;
    const txt = readFileSync(path, 'utf8');
    // Find the `### <itemId>` heading and the Status line beneath it (up to next ### or EOF).
    const re = new RegExp(`(### ${escapeRegex(itemId)}[\\s\\S]*?)(^[-*]\\s*Status\\s*:\\s*)([^\\n]+)`, 'm');
    const next = txt.replace(re, (_m, head, label) => `${head}${label}${newStatus}`);
    if (next !== txt) writeFileSync(path, next);
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Baseline + eval delta ─────────────────────────────────────────────────────

function findLatestBaseline(baselineDir: string): string | null {
    const abs = resolve(process.cwd(), baselineDir);
    if (!existsSync(abs)) return null;
    const candidates = readdirSync(abs)
        .filter((f) => f.startsWith('AFTER-') && f.endsWith('.json'))
        .map((f) => ({ f, m: statSync(join(abs, f)).mtimeMs }))
        .sort((a, b) => b.m - a.m);
    if (candidates.length === 0) return null;
    return join(abs, candidates[0].f);
}

interface BaselineScore {
    readonly correct: number;
    readonly total: number;
    readonly pct: number;
}

function summariseScore(jsonPath: string): BaselineScore | null {
    if (!existsSync(jsonPath)) return null;
    try {
        const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as { summaries?: Array<{ correct?: number; totalChecks?: number }> };
        const sums = data.summaries ?? [];
        let correct = 0;
        let total = 0;
        for (const s of sums) {
            correct += Number(s.correct ?? 0);
            total += Number(s.totalChecks ?? 0);
        }
        return { correct, total, pct: total > 0 ? (correct / total) * 100 : 0 };
    } catch {
        return null;
    }
}

function findLatestMatrixJson(baselineDir: string): string | null {
    const abs = resolve(process.cwd(), baselineDir);
    if (!existsSync(abs)) return null;
    const candidates = readdirSync(abs)
        .filter((f) => f.startsWith('matrix-') && f.endsWith('.json'))
        .map((f) => ({ f, m: statSync(join(abs, f)).mtimeMs }))
        .sort((a, b) => b.m - a.m);
    if (candidates.length === 0) return null;
    return join(abs, candidates[0].f);
}

// ── Iteration logging ─────────────────────────────────────────────────────────

const RUNS_LOG = 'tmp/eval-overnight/runs.jsonl';

function logIteration(entry: IterationRun): void {
    const abs = resolve(process.cwd(), RUNS_LOG);
    mkdirSync(resolve(abs, '..'), { recursive: true });
    appendFileSync(abs, `${JSON.stringify(entry)}\n`);
}

// ── Agent handoff ─────────────────────────────────────────────────────────────

function agentPromptPath(track: Track): string {
    const slug = track === 'A' ? 'track-a-2-5-polisher' : track === 'B' ? 'track-b-3-5-architect' : 'track-c-hybrid-builder';
    return resolve(process.cwd(), '.claude/agents', `${slug}.md`);
}

interface AgentHandoffResult {
    readonly mode: 'spawned' | 'manual-handoff' | 'failed';
    readonly notes: string;
}

/**
 * Apply the change via sub-agent. Two modes:
 *   - CLAUDE_AGENT_COMMAND set → spawn it. Returns "spawned" iff exit 0.
 *   - Unset → write a task file under tmp/eval-overnight/pending/ and return
 *     "manual-handoff" so the orchestrator records the iteration and exits.
 */
function applyChangeViaAgent(
    track: Track,
    item: BacklogItem,
    branch: string,
    dryRun: boolean,
): AgentHandoffResult {
    const promptPath = agentPromptPath(track);
    if (!existsSync(promptPath)) {
        return { mode: 'failed', notes: `agent prompt not found: ${promptPath}` };
    }
    const cmd = process.env.CLAUDE_AGENT_COMMAND?.trim();
    if (!cmd) {
        // Manual mode: drop a task file and return "manual-handoff".
        const dir = resolve(process.cwd(), 'tmp/eval-overnight/pending');
        mkdirSync(dir, { recursive: true });
        const taskPath = join(dir, `${branch}.task.md`);
        const body = [
            `# Agent task — ${branch}`,
            '',
            `**Track:** ${track}`,
            `**Backlog item:** ${item.id}`,
            `**Branch:** ${branch}`,
            '',
            `**Agent prompt:** \`${promptPath}\``,
            '',
            '## Backlog item',
            '',
            item.raw,
            '',
            '## Next steps for the human',
            '',
            '1. Open Claude Code in this repo.',
            `2. Read \`${promptPath}\` and follow it.`,
            `3. The agent will pick \`${item.id}\` from the backlog and apply the change on branch \`${branch}\`.`,
            `4. After the agent finishes, re-run \`npm run eval:smoke\` and diff vs the baseline.`,
            '',
            'To switch to hands-off mode in future, set `CLAUDE_AGENT_COMMAND` to a script that invokes Claude headlessly.',
            '',
        ].join('\n');
        if (!dryRun) writeFileSync(taskPath, body);
        return {
            mode: 'manual-handoff',
            notes: `wrote ${taskPath} — invoke the agent prompt manually, then re-run the orchestrator with --skip-agent (not yet implemented)`,
        };
    }
    if (dryRun) {
        return { mode: 'spawned', notes: `[dry-run] would spawn: ${cmd} ${promptPath} ${item.id} ${branch}` };
    }
    const res = spawnSync(cmd, [promptPath, item.id, branch], { stdio: 'inherit', shell: true });
    if (res.status === 0) {
        return { mode: 'spawned', notes: `agent exited 0` };
    }
    return { mode: 'failed', notes: `agent exited ${res.status}` };
}

// ── Main pre-flight + iteration ───────────────────────────────────────────────

async function main(): Promise<number> {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        printHelp();
        return 0;
    }
    if (!opts.track) {
        // eslint-disable-next-line no-console
        console.error('eval-overnight: --track <A|B|C> is required. See --help.');
        return 2;
    }
    const started = Date.now();
    const ts = new Date().toISOString();

    // 0) Kill switch
    if (process.env.BACKGROUND_AGENTS_ENABLED === '0') {
        const entry: IterationRun = {
            ts,
            track: opts.track,
            itemId: null,
            branch: null,
            baselinePath: null,
            afterPath: null,
            outcome: 'bailed-kill-switch',
            notes: 'BACKGROUND_AGENTS_ENABLED=0 — emergency kill switch is engaged',
            spentUsdBefore: 0,
            elapsedMs: Date.now() - started,
        };
        if (!opts.dryRun) logIteration(entry);
        // eslint-disable-next-line no-console
        console.error('eval-overnight: BACKGROUND_AGENTS_ENABLED=0 — bailing (kill switch).');
        return 2;
    }

    // 1) Git sanity
    if (!gitInRepo()) {
        // eslint-disable-next-line no-console
        console.error('eval-overnight: not inside a git working tree.');
        return 2;
    }
    if (!isGitClean()) {
        const entry: IterationRun = {
            ts, track: opts.track, itemId: null, branch: null, baselinePath: null, afterPath: null,
            outcome: 'bailed-dirty-tree',
            notes: 'git tree is dirty — refusing to start an agent iteration',
            spentUsdBefore: 0, elapsedMs: Date.now() - started,
        };
        if (!opts.dryRun) logIteration(entry);
        // eslint-disable-next-line no-console
        console.error('eval-overnight: git tree is dirty — commit or stash before re-running.');
        return 2;
    }
    const startingBranch = currentBranch();

    // 2) Budget check
    const summary = await getSpendSummary('today');
    const spentBefore = summary.totalUsd;
    if (!(await hasBudgetRemaining(opts.budgetCapUsd))) {
        const entry: IterationRun = {
            ts, track: opts.track, itemId: null, branch: null, baselinePath: null, afterPath: null,
            outcome: 'bailed-budget',
            notes: `today's spend ${spentBefore.toFixed(4)} ≥ cap ${opts.budgetCapUsd.toFixed(2)}`,
            spentUsdBefore: spentBefore, elapsedMs: Date.now() - started,
        };
        if (!opts.dryRun) logIteration(entry);
        // eslint-disable-next-line no-console
        console.error(`eval-overnight: budget exhausted — $${spentBefore.toFixed(4)} ≥ cap $${opts.budgetCapUsd}.`);
        return 2;
    }

    // 3) Baseline lookup
    const baselinePath = findLatestBaseline(opts.baselineDir);
    if (!baselinePath) {
        const entry: IterationRun = {
            ts, track: opts.track, itemId: null, branch: null, baselinePath: null, afterPath: null,
            outcome: 'bailed-no-baseline',
            notes: `no AFTER-*.json found in ${opts.baselineDir} — run npm run eval:matrix once to seed a baseline`,
            spentUsdBefore: spentBefore, elapsedMs: Date.now() - started,
        };
        if (!opts.dryRun) logIteration(entry);
        // eslint-disable-next-line no-console
        console.error(`eval-overnight: no baseline AFTER-*.json in ${opts.baselineDir}.`);
        return 2;
    }
    const baselineScore = summariseScore(baselinePath);

    // 4) Backlog pick
    const backlogPath = resolve(process.cwd(), opts.backlog);
    const allItems = parseBacklog(backlogPath);
    const candidates = allItems.filter((i) => i.track === opts.track && i.status === 'pending');
    if (candidates.length === 0) {
        const entry: IterationRun = {
            ts, track: opts.track, itemId: null, branch: null, baselinePath, afterPath: null,
            outcome: 'bailed-no-items',
            notes: `no pending backlog items for Track ${opts.track}`,
            spentUsdBefore: spentBefore, elapsedMs: Date.now() - started,
        };
        if (!opts.dryRun) logIteration(entry);
        // eslint-disable-next-line no-console
        console.error(`eval-overnight: no pending Track ${opts.track} items in ${backlogPath}.`);
        return 2;
    }
    // Smallest first — drain the easy wins before tackling L items.
    const order = { S: 0, M: 1, L: 2 } as const;
    candidates.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
    const pick = candidates[0];

    // 5) Branch
    const branch = makeBranchName(opts.branchPrefix);
    // eslint-disable-next-line no-console
    console.log(
        [
            `eval-overnight plan:`,
            `  track:      ${opts.track}`,
            `  cap:        $${opts.budgetCapUsd}`,
            `  spent:      $${spentBefore.toFixed(4)} (today)`,
            `  baseline:   ${baselinePath}${baselineScore ? `  (${baselineScore.correct}/${baselineScore.total} = ${baselineScore.pct.toFixed(0)}%)` : ''}`,
            `  branch:     ${branch}`,
            `  item:       ${pick.id} (${pick.difficulty})`,
            `  from:       ${startingBranch}`,
            '',
        ].join('\n'),
    );

    if (opts.dryRun) {
        // eslint-disable-next-line no-console
        console.log('--dry-run set — exiting without mutations.');
        return 0;
    }

    // 6) Create branch
    sh(`git checkout -b ${branch}`, { allowFail: false });

    // 7) Mark in-progress
    updateBacklogItemStatus(backlogPath, pick.id, 'in-progress');

    // 8) Hand off to agent
    const handoff = applyChangeViaAgent(opts.track, pick, branch, false);
    if (handoff.mode === 'manual-handoff') {
        // The agent will be run by the human. We stop here and let them
        // re-invoke the eval afterwards. We do NOT roll back the branch — the
        // human picks up where we left off.
        const entry: IterationRun = {
            ts, track: opts.track, itemId: pick.id, branch, baselinePath, afterPath: null,
            outcome: 'agent-handoff',
            notes: handoff.notes,
            spentUsdBefore: spentBefore, elapsedMs: Date.now() - started,
        };
        logIteration(entry);
        // eslint-disable-next-line no-console
        console.log(`\neval-overnight: handed off to manual agent.\n${handoff.notes}\n`);
        return 0;
    }
    if (handoff.mode === 'failed') {
        // Roll back: switch back, delete the wip branch, mark item pending again.
        sh(`git checkout ${startingBranch}`, { allowFail: true });
        sh(`git branch -D ${branch}`, { allowFail: true });
        updateBacklogItemStatus(backlogPath, pick.id, 'pending');
        const entry: IterationRun = {
            ts, track: opts.track, itemId: pick.id, branch, baselinePath, afterPath: null,
            outcome: 'bailed-agent-failed',
            notes: handoff.notes,
            spentUsdBefore: spentBefore, elapsedMs: Date.now() - started,
        };
        logIteration(entry);
        // eslint-disable-next-line no-console
        console.error(`eval-overnight: agent failed — ${handoff.notes}`);
        return 1;
    }

    // 9) Budget re-check before any Gemini calls (smoke matrix is gemini-bound)
    if (!(await hasBudgetRemaining(opts.budgetCapUsd))) {
        sh(`git checkout ${startingBranch}`, { allowFail: true });
        const entry: IterationRun = {
            ts, track: opts.track, itemId: pick.id, branch, baselinePath, afterPath: null,
            outcome: 'bailed-budget',
            notes: `budget hit between agent step and smoke eval`,
            spentUsdBefore: spentBefore, elapsedMs: Date.now() - started,
        };
        logIteration(entry);
        // eslint-disable-next-line no-console
        console.error('eval-overnight: budget exhausted after agent step — branch left in place for manual review.');
        return 2;
    }

    // 10) Run smoke matrix on changed code
    // NOTE: we deliberately invoke the existing npm script rather than the
    // tsx file directly so any env / dev-server requirements are picked up
    // from package.json. eval:smoke is the 2-cell, 2-test subset.
    const smoke = sh('npm run eval:smoke', { allowFail: true });
    const afterPath = findLatestMatrixJson(opts.baselineDir);
    const afterScore = afterPath ? summariseScore(afterPath) : null;

    // 11) Compare
    const improved = baselineScore && afterScore && afterScore.pct >= baselineScore.pct;
    const summaryAfter = await getSpendSummary('today');
    const spentAfter = summaryAfter.totalUsd;

    const deltaNote = baselineScore && afterScore
        ? `baseline ${baselineScore.correct}/${baselineScore.total} (${baselineScore.pct.toFixed(0)}%) → after ${afterScore.correct}/${afterScore.total} (${afterScore.pct.toFixed(0)}%)`
        : 'score unparseable';

    if (improved) {
        // Keep the branch. We do NOT auto-open a PR — the user reviews and merges.
        updateBacklogItemStatus(backlogPath, pick.id, 'landed');
        const entry: IterationRun = {
            ts, track: opts.track, itemId: pick.id, branch, baselinePath, afterPath,
            outcome: 'kept',
            notes: `improved or held — ${deltaNote}. smoke exit ${smoke.ok ? '0' : 'non-zero (output captured)'}.`,
            spentUsdBefore: spentBefore, spentUsdAfter: spentAfter, elapsedMs: Date.now() - started,
        };
        logIteration(entry);
        // eslint-disable-next-line no-console
        console.log(`\neval-overnight: kept branch ${branch}.\n${deltaNote}\nReview with: git diff ${startingBranch}..${branch}`);
        return 0;
    }

    // Regression: discard
    sh(`git checkout ${startingBranch}`, { allowFail: true });
    sh(`git branch -D ${branch}`, { allowFail: true });
    updateBacklogItemStatus(backlogPath, pick.id, 'regressed');
    const entry: IterationRun = {
        ts, track: opts.track, itemId: pick.id, branch, baselinePath, afterPath,
        outcome: 'discarded',
        notes: `regressed — ${deltaNote}. smoke exit ${smoke.ok ? '0' : 'non-zero'}.`,
        spentUsdBefore: spentBefore, spentUsdAfter: spentAfter, elapsedMs: Date.now() - started,
    };
    logIteration(entry);
    // eslint-disable-next-line no-console
    console.log(`\neval-overnight: discarded branch ${branch}.\n${deltaNote}`);
    return 0;
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`eval-overnight: ${err instanceof Error ? err.message : String(err)}`);
        try {
            logIteration({
                ts: new Date().toISOString(),
                track: 'A',
                itemId: null,
                branch: null,
                baselinePath: null,
                afterPath: null,
                outcome: 'errored',
                notes: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err),
                spentUsdBefore: 0,
                elapsedMs: 0,
            });
        } catch {
            /* ignore double-fault */
        }
        process.exit(1);
    });
