/**
 * Eval spend tracker.
 *
 * Reads the `ai_cost_events` Supabase table and reports running USD spend over
 * a time window (default: today, since midnight local time). Used by the
 * overnight orchestrator to enforce a hard budget cap before invoking any
 * Gemini calls, and exposes a CLI for humans to check status at a glance.
 *
 * CLI:
 *   npx tsx scripts/eval-spend-tracker.ts                   # JSON: total + remaining for default $5 cap
 *   npx tsx scripts/eval-spend-tracker.ts --summary         # Human-readable breakdown
 *   npx tsx scripts/eval-spend-tracker.ts --cap 10          # Use a different cap
 *   npx tsx scripts/eval-spend-tracker.ts --since 24h       # Last 24 hours instead of "today"
 *   npx tsx scripts/eval-spend-tracker.ts --json            # Machine-readable JSON
 *   npx tsx scripts/eval-spend-tracker.ts --help            # Print this usage
 *
 * Library use:
 *   import { hasBudgetRemaining, getSpendSummary } from './eval-spend-tracker';
 *   if (!(await hasBudgetRemaining(5))) process.exit(2);
 *
 * NOTE: The spec calls for `createSupabaseAdminClient` from
 * `@/lib/auth/supabase-server`. That module imports `next/headers` at the top
 * level which crashes outside a Next.js request scope. To preserve the
 * "callable from a plain tsx script" contract — which `eval-matrix.ts`
 * already relies on — we instantiate a service-role client directly with the
 * same env vars the admin client uses. Behaviourally equivalent for reads on
 * `ai_cost_events`.
 */

import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Mirror Next.js env-loading order: .env.local overrides .env.
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '.env.local'), override: true });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiCostEventRow {
    readonly created_at: string;
    readonly endpoint: string | null;
    readonly model_name: string | null;
    readonly estimated_usd: number | string | null;
    readonly total_tokens: number | string | null;
}

export interface SpendBreakdownEntry {
    readonly key: string;
    readonly usd: number;
    readonly calls: number;
}

export interface SpendSummary {
    readonly windowStart: string;
    readonly windowEnd: string;
    readonly totalUsd: number;
    readonly totalCalls: number;
    readonly byModel: SpendBreakdownEntry[];
    readonly byEndpoint: SpendBreakdownEntry[];
}

// ── CLI parsing ───────────────────────────────────────────────────────────────

interface CliOpts {
    readonly summary: boolean;
    readonly json: boolean;
    readonly help: boolean;
    readonly capUsd: number;
    readonly since: string; // 'today' or '24h' / '7d' / '1h' style
}

function parseArgs(argv: string[]): CliOpts {
    function has(name: string): boolean {
        return argv.includes(`--${name}`);
    }
    function val(name: string, fallback: string): string {
        const i = argv.indexOf(`--${name}`);
        if (i === -1 || i === argv.length - 1) return fallback;
        return argv[i + 1];
    }
    return {
        summary: has('summary'),
        json: has('json'),
        help: has('help') || has('h'),
        capUsd: Number.parseFloat(val('cap', '5')) || 5,
        since: val('since', 'today'),
    };
}

function printHelp(): void {
    // eslint-disable-next-line no-console
    console.log(
        [
            'eval-spend-tracker — query ai_cost_events for AI spend',
            '',
            'Usage:',
            '  npx tsx scripts/eval-spend-tracker.ts [options]',
            '',
            'Options:',
            '  --summary             Human-readable breakdown by model + endpoint',
            '  --json                Machine-readable JSON output (default if no flag set)',
            '  --cap <usd>           Budget cap in USD (default 5)',
            '  --since <window>      "today" (default), "24h", "1h", "7d", etc.',
            '  --help, -h            Show this help',
            '',
            'Library exports (importable):',
            '  hasBudgetRemaining(capUsd: number, since?: string): Promise<boolean>',
            '  getSpendSummary(since?: string): Promise<SpendSummary>',
            '',
            'Examples:',
            '  npx tsx scripts/eval-spend-tracker.ts --summary',
            '  npx tsx scripts/eval-spend-tracker.ts --since 24h --cap 5',
        ].join('\n'),
    );
}

// ── Time window resolution ────────────────────────────────────────────────────

/**
 * Resolve a `--since` argument to an ISO timestamp. Accepts:
 *   - "today"        → 00:00 local today
 *   - "<n>h" / "<n>d" / "<n>m" → that many hours/days/minutes ago
 *   - any ISO string → passed through
 */
export function resolveWindowStart(since: string): Date {
    if (since === 'today') {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }
    const m = /^(\d+(?:\.\d+)?)\s*(m|h|d)$/i.exec(since.trim());
    if (m) {
        const n = Number.parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        const ms = unit === 'm' ? n * 60_000 : unit === 'h' ? n * 3_600_000 : n * 86_400_000;
        return new Date(Date.now() - ms);
    }
    const iso = new Date(since);
    if (!Number.isNaN(iso.getTime())) return iso;
    // Fallback: today
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

// ── Supabase client ───────────────────────────────────────────────────────────

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
    if (cachedClient) return cachedClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            'eval-spend-tracker: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (read from .env / .env.local)',
        );
    }
    cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return cachedClient;
}

// ── Core queries ──────────────────────────────────────────────────────────────

async function fetchRows(windowStart: Date): Promise<AiCostEventRow[]> {
    const supabase = getClient();
    const { data, error } = await supabase
        .from('ai_cost_events')
        .select('created_at, endpoint, model_name, estimated_usd, total_tokens')
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(`ai_cost_events query failed: ${error.message}`);
    }
    return (data ?? []) as AiCostEventRow[];
}

function aggregate(rows: AiCostEventRow[]): {
    totalUsd: number;
    byModel: SpendBreakdownEntry[];
    byEndpoint: SpendBreakdownEntry[];
} {
    let totalUsd = 0;
    const byModel = new Map<string, { usd: number; calls: number }>();
    const byEndpoint = new Map<string, { usd: number; calls: number }>();

    for (const r of rows) {
        const usd = Number(r.estimated_usd) || 0;
        totalUsd += usd;
        const model = r.model_name ?? 'unknown';
        const endpoint = r.endpoint ?? 'unknown';
        const m = byModel.get(model) ?? { usd: 0, calls: 0 };
        m.usd += usd;
        m.calls += 1;
        byModel.set(model, m);
        const e = byEndpoint.get(endpoint) ?? { usd: 0, calls: 0 };
        e.usd += usd;
        e.calls += 1;
        byEndpoint.set(endpoint, e);
    }

    const toEntries = (map: Map<string, { usd: number; calls: number }>): SpendBreakdownEntry[] =>
        Array.from(map.entries())
            .map(([key, v]) => ({ key, usd: v.usd, calls: v.calls }))
            .sort((a, b) => b.usd - a.usd);

    return { totalUsd, byModel: toEntries(byModel), byEndpoint: toEntries(byEndpoint) };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a spend summary for the given window.
 * @param since "today" (default), or a relative window like "24h", "7d".
 */
export async function getSpendSummary(since: string = 'today'): Promise<SpendSummary> {
    const windowStart = resolveWindowStart(since);
    const windowEnd = new Date();
    const rows = await fetchRows(windowStart);
    const agg = aggregate(rows);
    return {
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        totalUsd: agg.totalUsd,
        totalCalls: rows.length,
        byModel: agg.byModel,
        byEndpoint: agg.byEndpoint,
    };
}

/**
 * Returns true when the current spend within the window is strictly LESS than
 * the cap. Other scripts call this before every Gemini invocation to enforce
 * a hard budget. Errors during query default to `false` (fail-safe — refuse
 * to spend if we can't verify the budget).
 *
 * @param capUsd Hard cap in USD for the window.
 * @param since  Window — default "today" (since midnight local).
 */
export async function hasBudgetRemaining(capUsd: number, since: string = 'today'): Promise<boolean> {
    if (!Number.isFinite(capUsd) || capUsd <= 0) return false;
    try {
        const summary = await getSpendSummary(since);
        return summary.totalUsd < capUsd;
    } catch (err) {
        // Fail-safe: if we can't read the table, assume the cap is hit. Better
        // to bail noisily than to risk runaway spend during a buggy run.
        // eslint-disable-next-line no-console
        console.warn(
            JSON.stringify({
                type: 'eval_spend_tracker_query_failed',
                error: err instanceof Error ? err.message : String(err),
            }),
        );
        return false;
    }
}

/** Convenience: remaining = max(cap - spent, 0). */
export function remainingBudget(summary: SpendSummary, capUsd: number): number {
    return Math.max(capUsd - summary.totalUsd, 0);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
    return `$${n.toFixed(4)}`;
}

function renderSummary(summary: SpendSummary, capUsd: number): string {
    const remaining = remainingBudget(summary, capUsd);
    const pct = capUsd > 0 ? (summary.totalUsd / capUsd) * 100 : 0;
    const lines: string[] = [];
    const sinceLabel = summary.windowStart.slice(0, 16).replace('T', ' ');
    lines.push(`Spend since ${sinceLabel}: ${fmtUsd(summary.totalUsd)} across ${summary.totalCalls} calls`);
    lines.push(`Budget cap:                 ${fmtUsd(capUsd)} (${pct.toFixed(1)}% used)`);
    lines.push(`Remaining:                  ${fmtUsd(remaining)}`);

    if (summary.byModel.length > 0) {
        lines.push('');
        lines.push('By model:');
        for (const e of summary.byModel) {
            lines.push(`  ${e.key.padEnd(30, ' ')} ${fmtUsd(e.usd).padStart(10, ' ')}  (${e.calls} calls)`);
        }
    }

    if (summary.byEndpoint.length > 0) {
        lines.push('');
        lines.push('By endpoint:');
        for (const e of summary.byEndpoint) {
            lines.push(`  ${e.key.padEnd(30, ' ')} ${fmtUsd(e.usd).padStart(10, ' ')}  (${e.calls} calls)`);
        }
    }

    return lines.join('\n');
}

// ── Main (CLI) ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        printHelp();
        return;
    }
    const summary = await getSpendSummary(opts.since);
    if (opts.summary) {
        // eslint-disable-next-line no-console
        console.log(renderSummary(summary, opts.capUsd));
        return;
    }
    // Default: JSON output (machine-readable)
    const remaining = remainingBudget(summary, opts.capUsd);
    // eslint-disable-next-line no-console
    console.log(
        JSON.stringify(
            {
                ...summary,
                capUsd: opts.capUsd,
                remainingUsd: remaining,
                hasBudgetRemaining: summary.totalUsd < opts.capUsd,
            },
            null,
            2,
        ),
    );
}

// Run only when executed directly, not when imported.
// `import.meta.url`-based check would be cleaner but this matches the rest of
// the scripts/ directory's pattern.
const isCli = Boolean(process.argv[1] && process.argv[1].endsWith('eval-spend-tracker.ts'));
if (isCli) {
    main().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`eval-spend-tracker: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    });
}
