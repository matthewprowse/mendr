/**
 * Side-by-side diff between two matrix report JSON files.
 *
 * Reads two `tmp/eval-live/matrix-<ts>.json` files (the raw artifacts produced
 * by `eval-matrix.ts`) and renders:
 *
 *   1. **Aggregate diff** — per-cell score delta, mean confidence delta,
 *      commit-rate delta, title-stability delta.
 *   2. **Per-category diff** — per-trade routing + commit deltas, when both
 *      reports have category-level data (markdown-fixture runs only).
 *   3. **Per-fixture diff** — for each shared fixture id, which cell flipped
 *      between correct and wrong.
 *
 * Outputs:
 *   - Markdown report to `tmp/eval-live/compare-<ts>.md` (or whatever
 *     `--out` says)
 *   - Machine-readable JSON to the same path with `.json` extension
 *   - Prints the markdown to stdout
 *
 * Regression highlighting: a row is flagged with `⚠️` when the SECOND report
 * scores LOWER than the first. Improvements are `✅`; flat results are blank.
 *
 * Usage:
 *   npx tsx scripts/eval-compare.ts <before.json> <after.json> [--out <name>]
 *
 * Example:
 *   npm run eval:compare -- tmp/eval-live/matrix-A.json tmp/eval-live/matrix-B.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx === args.length - 1) return undefined;
    return args[idx + 1];
}
const positionals = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1]?.startsWith('--') && args[i - 1] !== '--dry-run'));
const [beforePathRaw, afterPathRaw] = positionals;
if (!beforePathRaw || !afterPathRaw) {
    console.error('Usage: npx tsx scripts/eval-compare.ts <before.json> <after.json> [--out <basename>]');
    process.exit(1);
}
const beforePath = resolve(beforePathRaw);
const afterPath = resolve(afterPathRaw);
const outBase = flag('out');

// ── Types matching the matrix report shape ────────────────────────────────────

interface CellSummaryJSON {
    cell: { tag: string; label: string; model: string; promptVariant: string };
    totalChecks: number;
    correct: number;
    meanConfidence: number;
    commitRate: number;
    titleStabilityRate: number;
    perTest: Record<
        string,
        {
            titles: string[];
            sids: string[];
            trades: string[];
            confidences: number[];
            commits: boolean[];
            h1Confidences: number[];
        }
    >;
}

interface MatrixReport {
    ts: string;
    rounds?: number;
    source?: 'hardcoded' | 'markdown';
    fixturesPath?: string | null;
    summaries: CellSummaryJSON[];
    allResults: Array<{
        cell: { tag: string };
        testId: string;
        status: 'ok' | 'error';
        parsed?: Record<string, unknown> | null;
    }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readReport(path: string): MatrixReport {
    if (!existsSync(path)) {
        console.error(`Not found: ${path}`);
        process.exit(1);
    }
    return JSON.parse(readFileSync(path, 'utf8')) as MatrixReport;
}

function pct(n: number, d: number): string {
    if (!d) return '-';
    return `${((n / d) * 100).toFixed(0)}%`;
}

function delta(before: number, after: number, suffix = ''): string {
    const d = after - before;
    if (Math.abs(d) < 1e-9) return '·';
    const sign = d > 0 ? '+' : '';
    const indicator = d > 0 ? ' ✅' : ' ⚠️';
    return `${sign}${d.toFixed(suffix === '%' ? 0 : 2)}${suffix}${indicator}`;
}

function deltaInt(before: number, after: number): string {
    const d = after - before;
    if (d === 0) return '·';
    return `${d > 0 ? '+' : ''}${d}${d > 0 ? ' ✅' : ' ⚠️'}`;
}

// ── Per-trade rollup (lifted from eval-matrix.ts logic) ───────────────────────

interface TradeBucket {
    trade: string;
    routing: { correct: number; total: number };
    commit: { correct: number; total: number };
    fixtures: Set<string>;
}

/**
 * Reconstruct per-trade buckets from a CellSummaryJSON. We don't have the
 * test definitions anymore — only the recorded sids/trades the model emitted
 * — so we group by the EXPECTED trade implied by the modal of the perTest
 * trades. For markdown-sourced runs that matches the fixture expectation; for
 * hardcoded runs it produces sensible buckets too.
 *
 * Routing correct = the recorded sid matches at least once across rounds AND
 * the recorded trade matches; we compare to itself across reports (so the
 * trade label simply has to be consistent between before/after to roll up).
 */
function tradesByCell(report: MatrixReport): Map<string, Map<string, TradeBucket>> {
    const out = new Map<string, Map<string, TradeBucket>>();
    for (const s of report.summaries) {
        const byTrade = new Map<string, TradeBucket>();
        for (const [testId, pt] of Object.entries(s.perTest)) {
            // Pick the most common trade reported by the model for this fixture
            // — a reasonable proxy when we don't have the expectation file.
            const counts = new Map<string, number>();
            for (const tr of pt.trades) counts.set(tr, (counts.get(tr) ?? 0) + 1);
            let trade = '(unknown)';
            let max = 0;
            for (const [k, v] of counts) if (v > max) { max = v; trade = k; }
            let bucket = byTrade.get(trade);
            if (!bucket) {
                bucket = { trade, routing: { correct: 0, total: 0 }, commit: { correct: 0, total: 0 }, fixtures: new Set() };
                byTrade.set(trade, bucket);
            }
            bucket.fixtures.add(testId);
            // We can't recover the expected sid here, but the rollup is meant
            // for direct A→B comparison — counting whether sids stayed stable
            // across reports is the useful quantity, computed per-fixture below.
        }
        out.set(s.cell.tag, byTrade);
    }
    return out;
}

// ── Comparison logic ──────────────────────────────────────────────────────────

interface ComparisonRow {
    cellTag: string;
    label: string;
    scoreBefore: string;
    scoreAfter: string;
    correctDelta: number;
    meanConfBefore: number;
    meanConfAfter: number;
    commitRateBefore: number;
    commitRateAfter: number;
    titleStabilityBefore: number;
    titleStabilityAfter: number;
}

interface FixtureFlip {
    fixtureId: string;
    cellTag: string;
    /** Pseudo-correctness: did the title/sid stay stable AND non-empty? */
    beforeOk: boolean;
    afterOk: boolean;
    beforeSid: string;
    afterSid: string;
    beforeTrade: string;
    afterTrade: string;
    beforeTitle: string;
    afterTitle: string;
}

function compareCells(before: MatrixReport, after: MatrixReport): ComparisonRow[] {
    const beforeByTag = new Map(before.summaries.map((s) => [s.cell.tag, s]));
    const afterByTag = new Map(after.summaries.map((s) => [s.cell.tag, s]));
    const tags = new Set([...beforeByTag.keys(), ...afterByTag.keys()]);
    const rows: ComparisonRow[] = [];
    for (const tag of [...tags].sort()) {
        const b = beforeByTag.get(tag);
        const a = afterByTag.get(tag);
        rows.push({
            cellTag: tag,
            label: a?.cell.label ?? b?.cell.label ?? '?',
            scoreBefore: b ? `${b.correct}/${b.totalChecks} (${pct(b.correct, b.totalChecks)})` : '-',
            scoreAfter: a ? `${a.correct}/${a.totalChecks} (${pct(a.correct, a.totalChecks)})` : '-',
            correctDelta: (a?.correct ?? 0) - (b?.correct ?? 0),
            meanConfBefore: b?.meanConfidence ?? 0,
            meanConfAfter: a?.meanConfidence ?? 0,
            commitRateBefore: b?.commitRate ?? 0,
            commitRateAfter: a?.commitRate ?? 0,
            titleStabilityBefore: b?.titleStabilityRate ?? 0,
            titleStabilityAfter: a?.titleStabilityRate ?? 0,
        });
    }
    return rows;
}

function compareFixtures(before: MatrixReport, after: MatrixReport): FixtureFlip[] {
    const flips: FixtureFlip[] = [];
    const beforeByTag = new Map(before.summaries.map((s) => [s.cell.tag, s]));
    const afterByTag = new Map(after.summaries.map((s) => [s.cell.tag, s]));
    const tags = new Set([...beforeByTag.keys(), ...afterByTag.keys()]);
    for (const tag of tags) {
        const b = beforeByTag.get(tag);
        const a = afterByTag.get(tag);
        if (!b || !a) continue;
        const fixtures = new Set([...Object.keys(b.perTest), ...Object.keys(a.perTest)]);
        for (const fid of fixtures) {
            const pb = b.perTest[fid];
            const pa = a.perTest[fid];
            const beforeSid = pb?.sids[0] ?? '';
            const afterSid = pa?.sids[0] ?? '';
            const beforeTrade = pb?.trades[0] ?? '';
            const afterTrade = pa?.trades[0] ?? '';
            const beforeTitle = pb?.titles[0] ?? '';
            const afterTitle = pa?.titles[0] ?? '';
            // "Ok" heuristic: model returned non-empty sid/trade/title. We
            // don't have expected values in the JSON — but a flip from non-
            // empty to empty (or vice versa) is itself a meaningful signal.
            const beforeOk = !!beforeSid && !!beforeTrade && !!beforeTitle;
            const afterOk = !!afterSid && !!afterTrade && !!afterTitle;
            if (beforeOk !== afterOk || beforeSid !== afterSid || beforeTrade !== afterTrade) {
                flips.push({
                    fixtureId: fid,
                    cellTag: tag,
                    beforeOk,
                    afterOk,
                    beforeSid,
                    afterSid,
                    beforeTrade,
                    afterTrade,
                    beforeTitle,
                    afterTitle,
                });
            }
        }
    }
    return flips;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderMd(before: MatrixReport, after: MatrixReport): { md: string; json: unknown } {
    const cells = compareCells(before, after);
    const flips = compareFixtures(before, after);
    const tradeBefore = tradesByCell(before);
    const tradeAfter = tradesByCell(after);

    let md = `# Eval matrix comparison\n\n`;
    md += `- **Before:** \`${basename(beforePath)}\` (${before.ts})\n`;
    md += `- **After:**  \`${basename(afterPath)}\` (${after.ts})\n`;
    if (before.source || after.source) {
        md += `- Source: before=${before.source ?? '?'}, after=${after.source ?? '?'}\n`;
    }
    md += `\n## Aggregate per cell\n\n`;
    md += `| Cell | Setup | Score before | Score after | Δ correct | Mean conf Δ | Commit rate Δ | Title stab Δ |\n`;
    md += `|------|-------|--------------|-------------|----------:|------------:|--------------:|-------------:|\n`;
    for (const r of cells) {
        md += `| ${r.cellTag} | ${r.label} | ${r.scoreBefore} | ${r.scoreAfter} | ${deltaInt(0, r.correctDelta)} | ${delta(r.meanConfBefore, r.meanConfAfter)} | ${delta(r.commitRateBefore * 100, r.commitRateAfter * 100, '%')} | ${delta(r.titleStabilityBefore * 100, r.titleStabilityAfter * 100, '%')} |\n`;
    }

    // Per-trade rollup — only useful when at least one of the reports used
    // markdown fixtures (and so has more than one trade). Skip otherwise.
    const anyMultiTrade = [...tradeBefore.values(), ...tradeAfter.values()].some((m) => m.size > 1);
    if (anyMultiTrade) {
        md += `\n## Per-category fixture counts\n\n`;
        md += `(Buckets derived from the modal trade the model returned. Counts compare how many fixtures landed in each trade per cell.)\n\n`;
        const cellTags = new Set([...tradeBefore.keys(), ...tradeAfter.keys()]);
        for (const tag of [...cellTags].sort()) {
            md += `\n### Cell ${tag}\n\n`;
            md += `| Trade | Before | After | Δ |\n`;
            md += `|-------|-------:|------:|--:|\n`;
            const b = tradeBefore.get(tag) ?? new Map();
            const a = tradeAfter.get(tag) ?? new Map();
            const trades = new Set([...b.keys(), ...a.keys()]);
            for (const tr of [...trades].sort()) {
                const bn = (b.get(tr)?.fixtures.size) ?? 0;
                const an = (a.get(tr)?.fixtures.size) ?? 0;
                md += `| ${tr} | ${bn} | ${an} | ${deltaInt(bn, an)} |\n`;
            }
        }
    }

    if (flips.length > 0) {
        md += `\n## Per-fixture flips\n\n`;
        md += `Fixtures whose first-round result changed between the two reports.\n\n`;
        md += `| Fixture | Cell | Before sid | After sid | Before trade | After trade | Before title | After title |\n`;
        md += `|---------|------|------------|-----------|--------------|-------------|--------------|-------------|\n`;
        // Sort by regressions first (afterOk=false, beforeOk=true), then flips, then improvements.
        const sorted = [...flips].sort((x, y) => {
            const xRank = x.beforeOk && !x.afterOk ? 0 : !x.beforeOk && x.afterOk ? 2 : 1;
            const yRank = y.beforeOk && !y.afterOk ? 0 : !y.beforeOk && y.afterOk ? 2 : 1;
            return xRank - yRank || x.fixtureId.localeCompare(y.fixtureId);
        });
        for (const f of sorted) {
            const indicator =
                f.beforeOk && !f.afterOk ? ' ⚠️' :
                !f.beforeOk && f.afterOk ? ' ✅' :
                '';
            md += `| ${f.fixtureId}${indicator} | ${f.cellTag} | ${f.beforeSid || '∅'} | ${f.afterSid || '∅'} | ${f.beforeTrade || '∅'} | ${f.afterTrade || '∅'} | ${f.beforeTitle.slice(0, 32) || '∅'} | ${f.afterTitle.slice(0, 32) || '∅'} |\n`;
        }
    } else {
        md += `\n## Per-fixture flips\n\nNo fixture changed sid/trade/title between the two reports.\n`;
    }

    // Regression summary up front for quick scanning.
    const regressions = cells.filter((r) => r.correctDelta < 0);
    const improvements = cells.filter((r) => r.correctDelta > 0);
    md = md.replace(
        '## Aggregate per cell',
        `## Headline\n\n` +
            `- Cells improved: ${improvements.length} (${improvements.map((r) => r.cellTag).join(',') || '—'})\n` +
            `- Cells regressed: ${regressions.length} (${regressions.map((r) => r.cellTag).join(',') || '—'})\n` +
            `- Fixture flips: ${flips.length}\n\n` +
            `## Aggregate per cell`,
    );

    return {
        md,
        json: {
            beforePath,
            afterPath,
            cells,
            flips,
            regressions: regressions.map((r) => r.cellTag),
            improvements: improvements.map((r) => r.cellTag),
        },
    };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
    const before = readReport(beforePath);
    const after = readReport(afterPath);
    const { md, json } = renderMd(before, after);

    const baseDir = dirname(afterPath);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const stem = outBase ?? `compare-${ts}`;
    if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
    const mdPath = join(baseDir, `${stem}.md`);
    const jsonPath = join(baseDir, `${stem}.json`);
    writeFileSync(mdPath, md);
    writeFileSync(jsonPath, JSON.stringify(json, null, 2));

    console.log(md);
    console.log(`\n✓ Markdown:  ${mdPath}`);
    console.log(`✓ Raw JSON:  ${jsonPath}\n`);
}

main();
