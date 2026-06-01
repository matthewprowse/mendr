/**
 * Eval matrix driver.
 *
 * Runs the canonical 4 test scenarios against every (model × prompt variant)
 * cell so we can see — in a single pass — whether a v3.5 prompt change
 * actually moves the score relative to the v2.5 baseline, AND whether the
 * 2.5 model is affected by the new v3.5 prompts (sanity check).
 *
 *   Cell A: gemini-2.5-flash + v2.5 prompts          (production baseline)
 *   Cell B: gemini-2.5-flash + v3.5 prompts          (ablation: prompts on old model)
 *   Cell C: gemini-3.5-flash + v2.5 prompts          (regression: untuned new model)
 *   Cell D: gemini-3.5-flash + v3.5 prompts          (the previous target)
 *   Cell E: gemini-2.5-flash + v2.5-polished prompts (Track A — concision + calibration tweaks)
 *   Cell F: gemini-3.5-flash + v3.5-native prompts   (Track B — 5-stage protocol, dynamic thinking)
 *
 * Run all 6 cells with `--cells A,B,C,D,E,F` or any subset. The new
 * polished/native variants are opt-in — they're NOT auto-selected by
 * model name, so you'll only hit them when explicitly invoked via the
 * matrix or via DIAGNOSIS_PROMPT_VARIANT env / API override.
 *
 * Requires the dev server to be running with:
 *   ALLOW_MODEL_OVERRIDE_FROM_REQUEST=1 in .env.local
 *
 * That env flag lets this script POST `modelOverride` and `promptVariant`
 * in the /api/diagnose body. With it off, both fields are ignored.
 *
 * Usage:
 *   npm run eval:matrix                 # all 4 cells × all 4 tests × 1 round
 *   npm run eval:matrix -- --rounds 3   # stability: 3 rounds per cell
 *   npm run eval:matrix -- --tests 1,3  # subset of tests by 1-based index
 *   npm run eval:matrix -- --cells A,D  # only the diagonal we care about
 *
 * Reports land in tmp/eval-live/matrix-<ts>.md alongside the raw .json.
 */

import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { loadFixturesFromMarkdown, type LoadedTestCase } from './eval-load-fixtures';

// Mirror Next.js env-loading order: .env.local overrides .env.
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '.env.local'), override: true });

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name: string, fallback?: string): string | undefined {
    const idx = argv.indexOf(`--${name}`);
    if (idx === -1 || idx === argv.length - 1) return fallback;
    return argv[idx + 1];
}
const BASE_URL = (flag('base', 'http://localhost:3000') as string).replace(/\/+$/, '');
const ROUNDS = Number.parseInt(flag('rounds', '1') ?? '1', 10) || 1;
const SELECTED_TEST_INDICES =
    flag('tests')?.split(',').map((s) => Number.parseInt(s.trim(), 10) - 1) ?? null;
const SELECTED_CELLS =
    flag('cells')?.split(',').map((s) => s.trim().toUpperCase()) ?? null;
const FIXTURES_PATH_RAW = flag('fixtures');
const FIXTURES_PATH = FIXTURES_PATH_RAW
    ? FIXTURES_PATH_RAW.startsWith('~')
        ? join(homedir(), FIXTURES_PATH_RAW.slice(1))
        : FIXTURES_PATH_RAW
    : null;
const MAX_FIXTURES_RAW = flag('max-fixtures');
const MAX_FIXTURES = MAX_FIXTURES_RAW ? Number.parseInt(MAX_FIXTURES_RAW, 10) || null : null;
const DRY_RUN = process.argv.includes('--dry-run');
const DOWNLOADS = join(homedir(), 'Downloads');
const TMP_DIR = '/tmp/eval-live';
const REPORT_DIR = resolve(process.cwd(), 'tmp/eval-live');

// ── Cell + test definitions ───────────────────────────────────────────────────

interface Cell {
    readonly tag: string;
    readonly label: string;
    readonly model: string;
    readonly promptVariant: 'v2.5' | 'v3.5' | 'v2.5-polished' | 'v3.5-native';
}

const CELLS: readonly Cell[] = [
    { tag: 'A', label: '2.5 model + v2.5 prompts',          model: 'gemini-2.5-flash', promptVariant: 'v2.5' },
    { tag: 'B', label: '2.5 model + v3.5 prompts',          model: 'gemini-2.5-flash', promptVariant: 'v3.5' },
    { tag: 'C', label: '3.5 model + v2.5 prompts',          model: 'gemini-3.5-flash', promptVariant: 'v2.5' },
    { tag: 'D', label: '3.5 model + v3.5 prompts',          model: 'gemini-3.5-flash', promptVariant: 'v3.5' },
    { tag: 'E', label: '2.5 model + v2.5-polished prompts', model: 'gemini-2.5-flash', promptVariant: 'v2.5-polished' },
    { tag: 'F', label: '3.5 model + v3.5-native prompts',   model: 'gemini-3.5-flash', promptVariant: 'v3.5-native' },
];

interface TestCase {
    readonly id: string;
    readonly description: string;
    readonly photos: readonly string[];
    readonly text: string;
    /** Optional — present only when fixtures came from a markdown file. */
    readonly subcategoryId?: string;
    readonly expected: {
        readonly subcategory_id?: string;
        readonly trade?: string;
        readonly title_includes_any?: readonly string[];
        readonly commit?: boolean;
        readonly requires_clarification?: boolean;
    };
}

const TESTS: readonly TestCase[] = [
    {
        id: 'geyser-full-cues',
        description: 'Geyser corroded tank — text describes rusty water + electricity + temperature loss',
        photos: ['Geyser 1.HEIC', 'Geyser 2.HEIC', 'Geyser 3.HEIC'],
        text:
            "The geyser is leaking, the water in the drip tray is rusty brown, our electricity bill has gone up and the hot water doesn't last as long.",
        expected: {
            subcategory_id: 'geyser_fault_plumbing',
            trade: 'Plumbing',
            title_includes_any: ['Corroded', 'Geyser', 'Tank', 'Cylinder'],
            commit: true,
        },
    },
    {
        id: 'geyser-minimal',
        description: 'Geyser, minimal text — equipment guard test',
        photos: ['Geyser 1.HEIC', 'Geyser 2.HEIC', 'Geyser 3.HEIC'],
        text: 'My geyser is leaking.',
        expected: {
            subcategory_id: 'geyser_fault_plumbing',
            trade: 'Plumbing',
            title_includes_any: ['Geyser', 'Leaking'],
        },
    },
    {
        id: 'garage-with-cause',
        description: 'Garage door — user names the missing spring',
        photos: ['Garage Door 1.HEIC', 'Garage Door 2.HEIC', 'Garage Door 3.HEIC', 'Garage Door 4.HEIC'],
        text:
            'The door opens partially then stops, the motor beeps and it closes again. The spring is missing on one side.',
        expected: {
            subcategory_id: 'garage_door_fault',
            trade: 'Security',
            title_includes_any: ['Spring', 'Counterbalance', 'Missing'],
            commit: true,
        },
    },
    {
        id: 'garage-no-text',
        description: 'Garage door — photos only (symmetry test)',
        photos: ['Garage Door 1.HEIC', 'Garage Door 2.HEIC', 'Garage Door 3.HEIC', 'Garage Door 4.HEIC'],
        text: '',
        expected: {
            subcategory_id: 'garage_door_fault',
            trade: 'Security',
        },
    },
] as const;

// ── Supabase client (verification only) ───────────────────────────────────────
// Skipped entirely in --dry-run mode — no network or credentials needed when
// the user just wants to preview what would be run.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE_KEY)) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}
const supabase = !DRY_RUN && SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

const BETA_COOKIE_HEADER = 'beta_access=granted';

function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function convertHeicToJpeg(heicPath: string): string {
    ensureDir(TMP_DIR);
    // Accept HEIC, jpg, jpeg, png — sips re-encodes them all to JPEG. The
    // output filename always ends `.jpg` regardless of input extension so
    // the rest of the pipeline (uploadPhoto, Content-Type) is consistent.
    const out = join(
        TMP_DIR,
        basename(heicPath).replace(/\.(HEIC|heic|jpg|jpeg|JPG|JPEG|png|PNG)$/, '.jpg').replace(/\s+/g, '_'),
    );
    execSync(`sips -s format jpeg -s formatOptions 80 -Z 1400 "${heicPath}" --out "${out}"`, { stdio: 'ignore' });
    return out;
}

async function uploadPhoto(conversationId: string, jpegPath: string): Promise<{ imageUrl: string }> {
    const buffer = readFileSync(jpegPath);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'image/jpeg' }), basename(jpegPath));
    form.append('conversationId', conversationId);
    const res = await fetch(`${BASE_URL}/api/upload-image`, {
        method: 'POST',
        headers: { Cookie: BETA_COOKIE_HEADER },
        body: form,
        redirect: 'manual',
    });
    if (!res.ok) throw new Error(`upload-image ${res.status}: ${await res.text()}`);
    return (await res.json()) as { imageUrl: string };
}

async function runDiagnose(payload: Record<string, unknown>): Promise<{ status: number; body: string }> {
    const res = await fetch(`${BASE_URL}/api/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: BETA_COOKIE_HEADER },
        body: JSON.stringify(payload),
        redirect: 'manual',
    });
    return { status: res.status, body: await res.text() };
}

function parseDiagnoseResponse(body: string): Record<string, unknown> | null {
    let fullText: string | null = null;
    for (const line of body.split('\n').filter((l) => l.trim().length > 0)) {
        try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            if (obj.type === 'complete' && typeof obj.full === 'string') fullText = obj.full;
        } catch {
            /* not NDJSON */
        }
    }
    if (!fullText) fullText = body;
    const m = fullText.match(/<json>([\s\S]+?)<\/json>/);
    if (!m) return null;
    try {
        return JSON.parse(m[1]) as Record<string, unknown>;
    } catch {
        return null;
    }
}

async function fetchCritique(conversationId: string): Promise<unknown> {
    if (!supabase) return null;
    const { data } = await supabase
        .from('diagnoses')
        .select('diagnosis_critique')
        .eq('id', conversationId)
        .maybeSingle();
    return (data ?? null)?.diagnosis_critique ?? null;
}

// ── Fixture-source helpers ────────────────────────────────────────────────────

/**
 * Convert a `LoadedTestCase` (from the markdown loader) into the matrix's
 * `TestCase` shape. The two interfaces are deliberately close; this is a
 * thin adapter rather than a real transform.
 */
function adaptLoadedFixture(f: LoadedTestCase): TestCase {
    return {
        id: f.id,
        description: f.description,
        photos: f.photos,
        text: f.text,
        subcategoryId: f.subcategoryId,
        expected: {
            subcategory_id: f.expected.subcategory_id,
            trade: f.expected.trade,
            title_includes_any: f.expected.title_includes_any,
            requires_clarification: f.expected.requires_clarification,
            commit: f.expected.commit,
        },
    };
}

/**
 * Choose which fixtures the matrix will run. Returns the hardcoded 4 when
 * `--fixtures` isn't provided (backward-compat path); otherwise loads from
 * the markdown file. `--max-fixtures` caps the count post-load.
 */
function selectFixtures(): { tests: readonly TestCase[]; source: 'hardcoded' | 'markdown'; skipped: number } {
    if (!FIXTURES_PATH) {
        return { tests: TESTS, source: 'hardcoded', skipped: 0 };
    }
    const result = loadFixturesFromMarkdown(FIXTURES_PATH, {
        // Dry-run pretends every fixture has a photo so the user can see the
        // FULL candidate list — useful when deciding which photos to download.
        ignoreMissingPhotos: DRY_RUN,
    });
    let tests = result.fixtures.map(adaptLoadedFixture);
    if (MAX_FIXTURES && tests.length > MAX_FIXTURES) {
        tests = tests.slice(0, MAX_FIXTURES);
    }
    return { tests, source: 'markdown', skipped: result.skipped.length };
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Per-test runner ───────────────────────────────────────────────────────────

interface CellTestResult {
    readonly cell: Cell;
    readonly round: number;
    readonly testId: string;
    readonly conversationId: string;
    readonly status: 'ok' | 'error';
    readonly error?: string;
    readonly elapsedMs: number;
    readonly parsed?: Record<string, unknown> | null;
    readonly critique?: unknown;
}

async function runOneTrial(cell: Cell, test: TestCase, round: number): Promise<CellTestResult> {
    const conversationId = randomUUID();
    const started = Date.now();
    try {
        const jpegs: string[] = [];
        for (const photo of test.photos) {
            const heicPath = join(DOWNLOADS, photo);
            if (!existsSync(heicPath)) throw new Error(`missing photo: ${heicPath}`);
            jpegs.push(convertHeicToJpeg(heicPath));
        }
        const imageUrls: string[] = [];
        for (const j of jpegs) imageUrls.push((await uploadPhoto(conversationId, j)).imageUrl);

        const diagResult = await runDiagnose({
            conversationId,
            imageUrls,
            ...(test.text ? { textQuery: test.text } : {}),
            stream: true,
            // The per-request overrides ALLOW_MODEL_OVERRIDE_FROM_REQUEST gates.
            promptVariant: cell.promptVariant,
            modelOverride: cell.model,
        });

        const parsed = parseDiagnoseResponse(diagResult.body);

        // Brief tail wait for Agent 3 fire-and-forget critique.
        await sleep(6000);
        const critique = await fetchCritique(conversationId);

        return {
            cell,
            round,
            testId: test.id,
            conversationId,
            status: 'ok',
            elapsedMs: Date.now() - started,
            parsed,
            critique,
        };
    } catch (e) {
        return {
            cell,
            round,
            testId: test.id,
            conversationId,
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
            elapsedMs: Date.now() - started,
        };
    }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

interface CellSummary {
    cell: Cell;
    totalChecks: number;
    correct: number;
    meanConfidence: number;
    commitRate: number;
    titleStabilityRate: number;   // 1.0 = identical title across rounds
    rescueActivations: number;     // populated post-hoc from server logs (not here)
    perTest: Record<string, {
        titles: string[];
        sids: string[];
        trades: string[];
        confidences: number[];
        commits: boolean[];
        h1Confidences: number[];
    }>;
}

function scoreTrial(r: CellTestResult, test: TestCase): { total: number; correct: number } {
    const p = r.parsed ?? {};
    const e = test.expected;
    let total = 0, correct = 0;
    if (e.subcategory_id) { total++; if (p.subcategory_id === e.subcategory_id) correct++; }
    if (e.trade)          { total++; if (p.trade          === e.trade)          correct++; }
    if (e.title_includes_any) {
        total++;
        const t = String(p.diagnosis ?? '').toLowerCase();
        if (e.title_includes_any.some((k) => t.includes(k.toLowerCase()))) correct++;
    }
    if (e.commit !== undefined) {
        total++;
        const committed = !p.requires_clarification;
        if (committed === e.commit) correct++;
    }
    return { total, correct };
}

function summarise(cell: Cell, trials: CellTestResult[], tests: readonly TestCase[]): CellSummary {
    const summary: CellSummary = {
        cell,
        totalChecks: 0,
        correct: 0,
        meanConfidence: 0,
        commitRate: 0,
        titleStabilityRate: 0,
        rescueActivations: 0,
        perTest: {},
    };
    const confidences: number[] = [];
    let commits = 0, commitable = 0;
    for (const t of trials) {
        const test = tests.find((x) => x.id === t.testId);
        if (!test) continue;
        const score = scoreTrial(t, test);
        summary.totalChecks += score.total;
        summary.correct += score.correct;
        const p = t.parsed ?? {};
        const sc = (p.structured_clarification as { hypotheses?: Array<Record<string, unknown>> } | undefined);
        const h1 = sc?.hypotheses?.[0];
        const conf = Number(p.confidence ?? 0);
        if (Number.isFinite(conf) && conf > 0) confidences.push(conf);
        if (p.subcategory_id) {
            commitable++;
            if (!p.requires_clarification) commits++;
        }
        const pt = (summary.perTest[t.testId] ||= {
            titles: [], sids: [], trades: [], confidences: [], commits: [], h1Confidences: [],
        });
        pt.titles.push(String(p.diagnosis ?? ''));
        pt.sids.push(String(p.subcategory_id ?? ''));
        pt.trades.push(String(p.trade ?? ''));
        pt.confidences.push(conf);
        pt.commits.push(!p.requires_clarification);
        if (h1?.confidence) pt.h1Confidences.push(Number(h1.confidence));
    }
    summary.meanConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
    summary.commitRate = commitable ? commits / commitable : 0;
    // Title-stability: per test, fraction of trials where the title equals the
    // most-common title for that test. 1.0 = perfectly stable, 0 = all unique.
    let totalStability = 0, stabilityCells = 0;
    for (const k of Object.keys(summary.perTest)) {
        const ts = summary.perTest[k].titles;
        if (ts.length < 2) continue;
        const counts = new Map<string, number>();
        for (const t of ts) counts.set(t, (counts.get(t) ?? 0) + 1);
        const max = Math.max(...counts.values());
        totalStability += max / ts.length;
        stabilityCells++;
    }
    summary.titleStabilityRate = stabilityCells ? totalStability / stabilityCells : 1;
    return summary;
}

// ── Report rendering ──────────────────────────────────────────────────────────

/**
 * Per-trade roll-up across all cells. Routing = sid + trade both correct;
 * commit = `commit` expectation met (only counted when the fixture had one).
 * The numerator/denominator are summed across rounds, so a fixture run 3x
 * with sid correct twice contributes 2/3 to its trade's routing tally.
 */
interface TradeBucket {
    readonly trade: string;
    readonly routing: { correct: number; total: number };
    readonly commit: { correct: number; total: number };
    readonly fixtureIds: Set<string>;
}

function tallyByTrade(
    summary: CellSummary,
    tests: readonly TestCase[],
): Map<string, TradeBucket> {
    const buckets = new Map<string, TradeBucket>();
    for (const testId of Object.keys(summary.perTest)) {
        const test = tests.find((t) => t.id === testId);
        if (!test) continue;
        const trade = test.expected.trade ?? 'Unknown';
        let b = buckets.get(trade);
        if (!b) {
            b = {
                trade,
                routing: { correct: 0, total: 0 },
                commit: { correct: 0, total: 0 },
                fixtureIds: new Set(),
            };
            buckets.set(trade, b);
        }
        b.fixtureIds.add(testId);
        const pt = summary.perTest[testId];
        for (let i = 0; i < pt.sids.length; i++) {
            // Routing: sid + trade both match expectations (only counts when
            // expectations are present; otherwise the fixture doesn't contribute).
            if (test.expected.subcategory_id) {
                b.routing.total++;
                if (
                    pt.sids[i] === test.expected.subcategory_id &&
                    (!test.expected.trade || pt.trades[i] === test.expected.trade)
                ) {
                    b.routing.correct++;
                }
            }
            if (test.expected.commit !== undefined) {
                b.commit.total++;
                if (pt.commits[i] === test.expected.commit) b.commit.correct++;
            }
        }
    }
    return buckets;
}

function renderMatrix(
    summaries: CellSummary[],
    ts: string,
    tests: readonly TestCase[],
    source: 'hardcoded' | 'markdown',
    skipped: number,
): string {
    const cellsByTag = new Map(summaries.map((s) => [s.cell.tag, s]));
    let md = `# Eval matrix — ${ts}\n\n`;
    md += `Rounds per cell: ${ROUNDS}\n`;
    md += `Fixture source: ${source}${source === 'markdown' && FIXTURES_PATH ? ` (${FIXTURES_PATH})` : ''}\n`;
    md += `Fixtures run: ${tests.length}${skipped > 0 ? `  (skipped ${skipped} candidate(s) with no photo)` : ''}\n\n`;

    md += `## Aggregate score per cell\n\n`;
    md += `| Cell | Setup | Score | Mean conf | Commit rate | Title stability |\n`;
    md += `|------|-------|------:|----------:|------------:|----------------:|\n`;
    for (const tag of ['A', 'B', 'C', 'D']) {
        const s = cellsByTag.get(tag);
        if (!s) continue;
        const pct = s.totalChecks ? ((s.correct / s.totalChecks) * 100).toFixed(0) : '-';
        md += `| ${s.cell.tag} | ${s.cell.label} | ${s.correct}/${s.totalChecks} (${pct}%) | ${s.meanConfidence.toFixed(1)} | ${(s.commitRate * 100).toFixed(0)}% | ${(s.titleStabilityRate * 100).toFixed(0)}% |\n`;
    }

    // Per-category breakdown — only meaningful when fixtures came from the
    // markdown set (the hardcoded 4 only cover 2 trades and the rollup would
    // be misleading).
    if (source === 'markdown') {
        md += `\n## Per-category accuracy\n\n`;
        md += `Routing = subcategory_id + trade match; commit = clarification expectation match.\n\n`;
        // Build the per-cell tallies first so we can emit one table per cell.
        for (const tag of ['A', 'B', 'C', 'D']) {
            const s = cellsByTag.get(tag);
            if (!s) continue;
            const buckets = tallyByTrade(s, tests);
            if (buckets.size === 0) continue;
            md += `\n### Cell ${tag} — ${s.cell.label}\n\n`;
            md += `| Trade | Fixtures | Routing | Commit |\n`;
            md += `|-------|---------:|--------:|-------:|\n`;
            const sorted = [...buckets.values()].sort((a, b) =>
                b.fixtureIds.size - a.fixtureIds.size || a.trade.localeCompare(b.trade),
            );
            for (const b of sorted) {
                const routing = b.routing.total > 0
                    ? `${b.routing.correct}/${b.routing.total} (${((b.routing.correct / b.routing.total) * 100).toFixed(0)}%)`
                    : 'n/a';
                const commit = b.commit.total > 0
                    ? `${b.commit.correct}/${b.commit.total} (${((b.commit.correct / b.commit.total) * 100).toFixed(0)}%)`
                    : 'n/a';
                md += `| ${b.trade} | ${b.fixtureIds.size} | ${routing} | ${commit} |\n`;
            }
        }

        // One-line summary across all cells in the style the spec asked for:
        // "Plumbing: 8/10 routing, 6/10 commit; Electrical: 9/9 routing, 7/9 commit"
        md += `\n### One-line summary per cell\n\n`;
        for (const tag of ['A', 'B', 'C', 'D']) {
            const s = cellsByTag.get(tag);
            if (!s) continue;
            const buckets = tallyByTrade(s, tests);
            const parts: string[] = [];
            for (const b of [...buckets.values()].sort((x, y) => y.fixtureIds.size - x.fixtureIds.size)) {
                const r = b.routing.total > 0 ? `${b.routing.correct}/${b.routing.total} routing` : '';
                const c = b.commit.total > 0 ? `${b.commit.correct}/${b.commit.total} commit` : '';
                const tail = [r, c].filter(Boolean).join(', ');
                if (tail) parts.push(`${b.trade}: ${tail}`);
            }
            md += `- **${tag}**: ${parts.join('; ') || '(no scoring data)'}\n`;
        }
    }

    md += `\n## Per-test breakdown\n`;
    for (const test of tests) {
        md += `\n### ${test.id}\n`;
        md += `${test.text ? `_"${test.text}"_` : '_(photos only)_'}\n\n`;
        md += `| Cell | Title | Sid | Trade | Conf | Commit |\n`;
        md += `|------|-------|-----|-------|-----:|:------:|\n`;
        for (const tag of ['A', 'B', 'C', 'D']) {
            const s = cellsByTag.get(tag);
            if (!s) continue;
            const pt = s.perTest[test.id];
            if (!pt) continue;
            // For multi-round: show first run, then list distinct titles in parens
            const title = pt.titles[0] ?? '?';
            const distinctTitles = new Set(pt.titles).size;
            const titleShown = distinctTitles > 1
                ? `${title} _(${distinctTitles} variants across rounds)_`
                : title;
            const sidsOk = pt.sids.every((x) => x === test.expected.subcategory_id);
            const tradesOk = pt.trades.every((x) => x === test.expected.trade);
            const meanConf = pt.confidences.length
                ? (pt.confidences.reduce((a, b) => a + b, 0) / pt.confidences.length).toFixed(0)
                : '-';
            const commitFrac = `${pt.commits.filter(Boolean).length}/${pt.commits.length}`;
            md += `| ${tag} | ${titleShown} | ${pt.sids[0]}${sidsOk ? ' ✓' : ' ✗'} | ${pt.trades[0]}${tradesOk ? ' ✓' : ' ✗'} | ${meanConf} | ${commitFrac} |\n`;
        }
    }

    return md;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    // Decide which fixtures will run BEFORE we check for env flags so that
    // --dry-run can succeed even on a developer box with no env set up.
    const { tests: allTests, source, skipped } = selectFixtures();
    const cellsToRun = SELECTED_CELLS ? CELLS.filter((c) => SELECTED_CELLS.includes(c.tag)) : CELLS;
    const testsToRun = SELECTED_TEST_INDICES
        ? allTests.filter((_, i) => SELECTED_TEST_INDICES.includes(i))
        : allTests;

    if (DRY_RUN) {
        // Group by subcategory for the preview.
        const grouped = new Map<string, TestCase[]>();
        for (const t of testsToRun) {
            const key = t.subcategoryId ?? t.expected.subcategory_id ?? '(no-sid)';
            const list = grouped.get(key) ?? [];
            list.push(t);
            grouped.set(key, list);
        }
        console.log(`\nDry-run preview`);
        console.log(`================`);
        console.log(`Fixture source : ${source}${source === 'markdown' && FIXTURES_PATH ? ` (${FIXTURES_PATH})` : ''}`);
        console.log(`Cells          : ${cellsToRun.map((c) => c.tag).join(',')}`);
        console.log(`Rounds         : ${ROUNDS}`);
        console.log(`Total fixtures : ${testsToRun.length}`);
        if (skipped > 0) console.log(`Skipped        : ${skipped} candidate(s) with no photo (loader ignored for dry-run)`);
        const trials = testsToRun.length * cellsToRun.length * ROUNDS;
        console.log(`Total trials   : ${trials}  (fixtures × cells × rounds)`);
        // Rough cost projection: each trial ≈ 0.04 USD of Gemini spend at
        // current rates (3 images @ 2.5-flash + 1.5k input tokens). Update
        // this if you re-tune the pricing — it's a back-of-envelope number.
        const cost = trials * 0.04;
        console.log(`Est. spend     : ~$${cost.toFixed(2)}  (very rough — see docs/eval-matrix-guide.md)`);
        console.log(``);
        const sorted = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
        for (const [sid, ts] of sorted) {
            console.log(`  ${sid.padEnd(32, ' ')} ${String(ts.length).padStart(3)} fixture(s)`);
            for (const t of ts) {
                const photoTag = t.photos.length === 0 ? ' [no photo]' : ` [${t.photos.length} photo]`;
                console.log(`     - ${t.id}${photoTag}`);
            }
        }
        console.log(`\n(dry-run: not calling Gemini, not writing report)\n`);
        return;
    }

    if (process.env.ALLOW_MODEL_OVERRIDE_FROM_REQUEST !== '1') {
        console.warn(
            '⚠️  ALLOW_MODEL_OVERRIDE_FROM_REQUEST is not set to "1" in .env.local — the server will ignore the per-request modelOverride and run whichever model GEMINI_DIAGNOSIS_MODEL is set to. The matrix CANNOT compare models in this state. Set the flag and restart the dev server.',
        );
        process.exit(2);
    }

    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  Mendr Eval Matrix                                           ║`);
    console.log(`║  Base URL: ${BASE_URL.padEnd(50, ' ')}║`);
    console.log(`║  Cells:    ${cellsToRun.map((c) => c.tag).join(',').padEnd(50, ' ')}║`);
    console.log(`║  Tests:    ${String(testsToRun.length).padEnd(50, ' ')}║`);
    console.log(`║  Source:   ${(source === 'markdown' ? 'markdown' : 'hardcoded-4').padEnd(50, ' ')}║`);
    console.log(`║  Rounds:   ${String(ROUNDS).padEnd(50, ' ')}║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝`);

    const allResults: CellTestResult[] = [];
    for (const cell of cellsToRun) {
        console.log(`\n──── Cell ${cell.tag}: ${cell.label} ────`);
        for (const test of testsToRun) {
            for (let round = 1; round <= ROUNDS; round++) {
                const tag = `${cell.tag}/${test.id}${ROUNDS > 1 ? `#${round}` : ''}`;
                process.stdout.write(`  ${tag.padEnd(45, ' ')}`);
                const r = await runOneTrial(cell, test, round);
                allResults.push(r);
                if (r.status === 'error') {
                    console.log(`  ✗ ${r.error}`);
                } else {
                    const p = r.parsed ?? {};
                    const expected = test.expected;
                    const sidOk = p.subcategory_id === expected.subcategory_id;
                    const tradeOk = p.trade === expected.trade;
                    console.log(`  ${sidOk ? '✓' : '✗'}${tradeOk ? '✓' : '✗'}  ${p.diagnosis ?? '?'}  conf=${p.confidence} clarify=${p.requires_clarification}`);
                }
            }
        }
    }

    // Summarise
    const summaries: CellSummary[] = [];
    for (const cell of cellsToRun) {
        const trials = allResults.filter((r) => r.cell.tag === cell.tag);
        summaries.push(summarise(cell, trials, testsToRun));
    }

    // Persist + render
    ensureDir(REPORT_DIR);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const md = renderMatrix(summaries, ts, testsToRun, source, skipped);
    const mdPath = join(REPORT_DIR, `matrix-${ts}.md`);
    const jsonPath = join(REPORT_DIR, `matrix-${ts}.json`);
    writeFileSync(mdPath, md);
    writeFileSync(
        jsonPath,
        JSON.stringify(
            { ts, rounds: ROUNDS, source, fixturesPath: FIXTURES_PATH, summaries, allResults },
            null,
            2,
        ),
    );

    console.log(`\n${md}`);
    console.log(`\n✓ Matrix report: ${mdPath}`);
    console.log(`✓ Raw data:      ${jsonPath}\n`);
}

main().catch((e) => {
    console.error(`\n❌ Fatal: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
});
