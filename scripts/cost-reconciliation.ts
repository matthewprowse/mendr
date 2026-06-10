/**
 * Cost reconciliation tool.
 *
 * Compares the spend Menda has tracked in `ai_cost_events` against the actual
 * monthly Google Cloud invoice line item (provided by the operator). Flags
 * drift above 5% so the founder can investigate whether our estimated_usd
 * column reflects what Google actually billed.
 *
 * CLI:
 *   npx tsx scripts/cost-reconciliation.ts --month 2026-05 --invoice-usd 47.23
 *   npx tsx scripts/cost-reconciliation.ts --month 2026-05 --invoice-usd 47.23 --json
 *   npx tsx scripts/cost-reconciliation.ts --help
 *
 * Mirrors the script-layer Supabase client convention from
 * `scripts/eval-spend-tracker.ts` (direct service-role client; admin-server
 * helper crashes outside a Next.js request scope because it imports
 * `next/headers`). Read-only against `ai_cost_events`.
 */

import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Mirror Next.js env-loading order: .env.local overrides .env.
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '.env.local'), override: true });

// ── Types ─────────────────────────────────────────────────────────────────────

interface AiCostEventRow {
    readonly created_at: string;
    readonly model_name: string | null;
    readonly endpoint: string | null;
    readonly estimated_usd: number | string | null;
}

interface ModelBreakdownRow {
    model_name: string;
    tracked_usd: number;
    calls: number;
}

interface ReconciliationReport {
    month: string;
    windowStart: string;
    windowEnd: string;
    trackedUsd: number;
    trackedCalls: number;
    invoiceUsd: number;
    differenceUsd: number;
    driftPercent: number;
    status: 'ok' | 'drift';
    driftThresholdPercent: number;
    byModel: ModelBreakdownRow[];
}

const DRIFT_THRESHOLD_PERCENT = 5;

// ── CLI parsing ───────────────────────────────────────────────────────────────

interface CliOpts {
    readonly month: string | null;
    readonly invoiceUsd: number | null;
    readonly json: boolean;
    readonly help: boolean;
}

function parseArgs(argv: string[]): CliOpts {
    function has(name: string): boolean {
        return argv.includes(`--${name}`);
    }
    function val(name: string): string | null {
        const i = argv.indexOf(`--${name}`);
        if (i === -1 || i === argv.length - 1) return null;
        return argv[i + 1];
    }
    const invoiceRaw = val('invoice-usd');
    const invoiceUsd = invoiceRaw === null ? null : Number.parseFloat(invoiceRaw);
    return {
        month: val('month'),
        invoiceUsd: invoiceUsd !== null && Number.isFinite(invoiceUsd) ? invoiceUsd : null,
        json: has('json'),
        help: has('help') || has('h'),
    };
}

function printHelp(): void {
    // eslint-disable-next-line no-console
    console.log(
        [
            'cost-reconciliation — compare tracked AI spend against a Google Cloud invoice',
            '',
            'Usage:',
            '  npx tsx scripts/cost-reconciliation.ts --month YYYY-MM --invoice-usd <amount> [--json]',
            '',
            'Options:',
            '  --month YYYY-MM         Calendar month to reconcile (required)',
            '  --invoice-usd <amount>  Google Cloud invoice total for that month, in USD (required)',
            '  --json                  Emit JSON instead of the human-readable report',
            '  --help, -h              Show this help',
            '',
            'Examples:',
            '  npx tsx scripts/cost-reconciliation.ts --month 2026-05 --invoice-usd 47.23',
            '  npm run cost:reconcile -- --month 2026-05 --invoice-usd 47.23',
        ].join('\n'),
    );
}

// ── Month parsing ─────────────────────────────────────────────────────────────

/**
 * Resolve `YYYY-MM` to a UTC `[start, end)` window. The end is the first
 * millisecond of the following month so the half-open interval includes
 * the entire calendar month regardless of length.
 */
export function resolveMonthWindow(month: string): { start: Date; end: Date } {
    const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
    if (!m) {
        throw new Error(`Invalid --month "${month}". Expected format: YYYY-MM (e.g. 2026-05).`);
    }
    const year = Number.parseInt(m[1], 10);
    const monthIdx = Number.parseInt(m[2], 10) - 1; // 0-based
    if (monthIdx < 0 || monthIdx > 11) {
        throw new Error(`Invalid --month "${month}". Month must be 01-12.`);
    }
    const start = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, monthIdx + 1, 1, 0, 0, 0, 0));
    return { start, end };
}

// ── Supabase client ───────────────────────────────────────────────────────────

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
    if (cachedClient) return cachedClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            'cost-reconciliation: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (read from .env / .env.local)',
        );
    }
    cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return cachedClient;
}

// ── Core query + aggregation ──────────────────────────────────────────────────

async function fetchEventsInWindow(start: Date, end: Date): Promise<AiCostEventRow[]> {
    const supabase = getClient();
    const { data, error } = await supabase
        .from('ai_cost_events')
        .select('created_at, model_name, endpoint, estimated_usd')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString());

    if (error) {
        throw new Error(`ai_cost_events query failed: ${error.message}`);
    }
    return (data ?? []) as AiCostEventRow[];
}

function aggregateByModel(rows: AiCostEventRow[]): ModelBreakdownRow[] {
    const byModel = new Map<string, { usd: number; calls: number }>();
    for (const r of rows) {
        const model = r.model_name ?? 'unknown';
        const usd = Number(r.estimated_usd) || 0;
        const existing = byModel.get(model) ?? { usd: 0, calls: 0 };
        existing.usd += usd;
        existing.calls += 1;
        byModel.set(model, existing);
    }
    return Array.from(byModel.entries())
        .map(([model_name, v]) => ({ model_name, tracked_usd: v.usd, calls: v.calls }))
        .sort((a, b) => b.tracked_usd - a.tracked_usd);
}

// ── Public API (importable for ad-hoc tooling) ────────────────────────────────

export async function buildReconciliationReport(
    month: string,
    invoiceUsd: number,
): Promise<ReconciliationReport> {
    const { start, end } = resolveMonthWindow(month);
    const rows = await fetchEventsInWindow(start, end);
    const trackedUsd = rows.reduce((acc, r) => acc + (Number(r.estimated_usd) || 0), 0);
    const trackedCalls = rows.length;
    const differenceUsd = trackedUsd - invoiceUsd;
    const driftPercent = invoiceUsd > 0 ? Math.abs(differenceUsd) / invoiceUsd * 100 : 0;
    const byModel = aggregateByModel(rows);
    return {
        month,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        trackedUsd,
        trackedCalls,
        invoiceUsd,
        differenceUsd,
        driftPercent,
        status: driftPercent > DRIFT_THRESHOLD_PERCENT ? 'drift' : 'ok',
        driftThresholdPercent: DRIFT_THRESHOLD_PERCENT,
        byModel,
    };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function renderReport(report: ReconciliationReport): string {
    const lines: string[] = [];
    lines.push(`=== Cost reconciliation for ${report.month} ===`);
    lines.push(
        `Tracked in ai_cost_events:    ${fmtUsd(report.trackedUsd)} (${report.trackedCalls.toLocaleString()} calls)`,
    );
    lines.push(`Google Cloud invoice:         ${fmtUsd(report.invoiceUsd)}  (provided)`);

    const direction =
        report.differenceUsd > 0
            ? 'over-tracked'
            : report.differenceUsd < 0
                ? 'under-tracked'
                : 'matched';
    lines.push(
        `Difference:                   ${fmtUsd(report.differenceUsd)} (${report.driftPercent.toFixed(1)}% ${direction})`,
    );

    const statusLabel =
        report.status === 'drift'
            ? `WARN  DRIFT > ${report.driftThresholdPercent}% — investigate`
            : `OK    drift within ${report.driftThresholdPercent}% threshold`;
    lines.push(`Status:                       ${statusLabel}`);

    if (report.byModel.length > 0) {
        lines.push('');
        lines.push('Breakdown by model:');
        const modelColWidth = Math.max(
            ...report.byModel.map((m) => m.model_name.length),
            12,
        );
        for (const m of report.byModel) {
            const padded = `${m.model_name}:`.padEnd(modelColWidth + 2, ' ');
            lines.push(`  ${padded} ${fmtUsd(m.tracked_usd).padStart(10, ' ')} (${m.calls.toLocaleString()} calls)`);
        }
    }

    if (report.status === 'drift') {
        lines.push('');
        lines.push('Common causes of drift:');
        lines.push('  - Google changed pricing mid-month; ai_model_pricing not updated in time.');
        lines.push('    Check: SELECT * FROM ai_model_pricing WHERE model_name = \'<model>\' ORDER BY effective_from DESC;');
        lines.push('  - Image tokenisation: the SDK reports text-token equivalents, but Google');
        lines.push('    sometimes bills per image. Compare invoice line items against model_name breakdown.');
        lines.push('  - Untracked Gemini calls — anything bypassing logGeminiUsage (eval scripts,');
        lines.push('    one-off probes) is invisible to ai_cost_events but visible on the invoice.');
        lines.push('  - Free-tier credits or promotional discounts on the Google bill.');
        lines.push('  - Rounding: cost estimates use floating-point; small drift (<1%) is expected.');
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
    if (!opts.month || opts.invoiceUsd === null) {
        printHelp();
        // eslint-disable-next-line no-console
        console.error('\nError: both --month and --invoice-usd are required.');
        process.exit(1);
    }

    const report = await buildReconciliationReport(opts.month, opts.invoiceUsd);

    if (opts.json) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(report, null, 2));
    } else {
        // eslint-disable-next-line no-console
        console.log(renderReport(report));
    }
    // Exit code: 0 = ok, 2 = drift detected (so CI / cron can branch on it).
    if (report.status === 'drift') process.exit(2);
}

const isCli = Boolean(process.argv[1] && process.argv[1].endsWith('cost-reconciliation.ts'));
if (isCli) {
    main().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`cost-reconciliation: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    });
}
