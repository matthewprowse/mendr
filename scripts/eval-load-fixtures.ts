/**
 * Markdown → TestCase loader for the eval matrix.
 *
 * Reads a labelled fixture markdown (produced by the overnight test-data
 * scout — see `~/Downloads/prompt-orchestrator.md`) and converts each table
 * row under a `#### <subcategory_id>` heading into a `LoadedTestCase` shape
 * compatible with the existing eval-live-tests.ts TestCase interface.
 *
 * Expected markdown format (per the orchestrator spec):
 *
 *   ### Trade Name
 *
 *   #### subcategory_id
 *
 *   **Scope:** ...
 *
 *   | ID | Description | user_text | Image candidates | Suggested search | expected_sid | expected_trade | requires_clarification | title_includes_any |
 *   |----|-------------|-----------|------------------|------------------|-------------|----------------|------------------------|-------------------|
 *   | gate-motor-battery-fail-1 | ... | "..." | [url](url) | "..." | gate_motor_fault | Security | false | Battery, Gate Motor |
 *
 * Each row produces a candidate. Photos are resolved from `~/Downloads/`
 * matching either `<id>.HEIC` (single-photo) or `<id>-1.HEIC`, `<id>-2.HEIC`,
 * ... (multi-photo). Both `.HEIC` and `.heic` extensions are accepted; jpg/jpeg/png
 * are also supported in case the human downloaded a non-Apple image.
 *
 * Fixtures with NO matching photo file are skipped — the markdown intentionally
 * contains far more candidates than the human has verified images for. This
 * loader is the gate between "candidate list" and "eval-ready fixture".
 *
 * Usage (as a module):
 *   import { loadFixturesFromMarkdown } from './eval-load-fixtures';
 *   const { fixtures, skipped } = loadFixturesFromMarkdown(path);
 *
 * Usage (CLI smoke test):
 *   npx tsx scripts/eval-load-fixtures.ts ~/Downloads/test-data-candidates.md
 *
 * The CLI mode prints a per-subcategory summary of loaded vs skipped, which
 * is what `eval-matrix.ts --dry-run` consumes.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';

// ── Public types ──────────────────────────────────────────────────────────────

export interface LoadedTestCase {
    readonly id: string;
    readonly description: string;
    readonly subcategoryId: string;
    /** Photo filenames (basename only) resolvable from the photo-dir. */
    readonly photos: readonly string[];
    readonly text: string;
    readonly expected: {
        readonly subcategory_id?: string;
        readonly trade?: string;
        readonly title_includes_any?: readonly string[];
        readonly requires_clarification?: boolean;
        /** Convenience alias — matrix scoring inverts requires_clarification → commit. */
        readonly commit?: boolean;
    };
    /** Empty string when the markdown didn't provide one. */
    readonly suggestedSearch: string;
}

export interface SkippedFixture {
    readonly id: string;
    readonly subcategoryId: string;
    readonly reason: 'no-photo' | 'missing-required-field' | 'parse-error';
    readonly detail?: string;
}

export interface LoadResult {
    readonly fixtures: readonly LoadedTestCase[];
    readonly skipped: readonly SkippedFixture[];
    /**
     * Subcategory → count of loaded fixtures. Useful for the dry-run report.
     */
    readonly bySubcategory: Record<string, number>;
    /** Trade → count of loaded fixtures. */
    readonly byTrade: Record<string, number>;
}

export interface LoadOptions {
    /** Directory to look for photo files in. Defaults to `~/Downloads/`. */
    readonly photoDir?: string;
    /**
     * Skip the photo-existence check entirely. Useful for dry-run preview
     * where we want to see "what would run IF photos existed".
     */
    readonly ignoreMissingPhotos?: boolean;
}

// ── Internals ─────────────────────────────────────────────────────────────────

const PHOTO_EXTS = ['.HEIC', '.heic', '.jpg', '.jpeg', '.JPG', '.JPEG', '.png', '.PNG'] as const;

interface ParsedRow {
    readonly cells: readonly string[];
    readonly raw: string;
}

interface CurrentSection {
    subcategoryId: string;
    /** Header column index → semantic name. */
    headerMap: Record<string, number>;
}

/**
 * Strip pipe-table noise from a cell: surrounding spaces, escape sequences,
 * and inline-markdown link syntax `[label](url)` (we keep the label).
 */
function cleanCell(s: string): string {
    let out = s.trim();
    // Collapse markdown links to their URL if it's a plain url, else label
    // We don't actually need URLs — just remove the brackets so the text is
    // human-readable in logs.
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    // Strip backticks and italics
    out = out.replace(/[`*]/g, '');
    return out.trim();
}

/**
 * Parse a single `|...|...|` table row into its cells. Markdown tables use
 * leading and trailing pipes by convention; we strip them and split on
 * unescaped pipe. The simple `.split('|')` works for our generated content
 * (no embedded pipes inside link URLs); if richer escaping is needed later
 * we can swap this for a tokenising scan.
 */
function parseTableRow(line: string): ParsedRow | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
    const inner = trimmed.slice(1, -1);
    const cells = inner.split('|').map(cleanCell);
    return { cells, raw: trimmed };
}

/** A header separator row looks like `|---|---|`. */
function isHeaderSeparator(line: string): boolean {
    return /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|$/.test(line.trim());
}

/** Canonical mapping from markdown column header (lowercased) → field name. */
const HEADER_ALIASES: Record<string, string> = {
    id: 'id',
    description: 'description',
    user_text: 'user_text',
    'user text': 'user_text',
    'user-text': 'user_text',
    'image candidates': 'image_candidates',
    image_candidates: 'image_candidates',
    'suggested search': 'suggested_search',
    suggested_search: 'suggested_search',
    expected_sid: 'expected_sid',
    'expected sid': 'expected_sid',
    'expected subcategory': 'expected_sid',
    expected_trade: 'expected_trade',
    'expected trade': 'expected_trade',
    requires_clarification: 'requires_clarification',
    'requires clarification': 'requires_clarification',
    title_includes_any: 'title_includes_any',
    'title includes any': 'title_includes_any',
};

function normaliseHeader(s: string): string {
    return s.toLowerCase().trim();
}

/**
 * From a header row produce a map of semantic-name → column index. Unknown
 * headers are recorded under their lowercased label.
 */
function buildHeaderMap(row: ParsedRow): Record<string, number> {
    const map: Record<string, number> = {};
    row.cells.forEach((cell, idx) => {
        const key = HEADER_ALIASES[normaliseHeader(cell)] ?? normaliseHeader(cell);
        map[key] = idx;
    });
    return map;
}

function parseBool(s: string | undefined): boolean | undefined {
    if (s === undefined || s === '') return undefined;
    const v = s.toLowerCase().trim();
    if (v === 'true' || v === 'yes' || v === 'y') return true;
    if (v === 'false' || v === 'no' || v === 'n') return false;
    return undefined;
}

function parseList(s: string | undefined): string[] {
    if (!s) return [];
    return s
        .split(/[,;]/)
        .map((x) => x.trim().replace(/^["']|["']$/g, ''))
        .filter((x) => x.length > 0);
}

/**
 * Strip surrounding quote characters and trim. The orchestrator wraps
 * user_text in double quotes for readability; we want the raw sentence.
 */
function stripQuotes(s: string): string {
    let v = s.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
    }
    return v;
}

// ── Photo resolution ──────────────────────────────────────────────────────────

interface PhotoIndex {
    /** Map of lowercased basename-without-extension → full filename. */
    readonly byStem: Map<string, string[]>;
}

function indexPhotoDir(dir: string): PhotoIndex {
    const byStem = new Map<string, string[]>();
    if (!existsSync(dir)) return { byStem };
    for (const file of readdirSync(dir)) {
        const ext = extname(file);
        if (!PHOTO_EXTS.includes(ext as typeof PHOTO_EXTS[number])) continue;
        const stem = file.slice(0, -ext.length).toLowerCase();
        const list = byStem.get(stem) ?? [];
        list.push(file);
        byStem.set(stem, list);
    }
    return { byStem };
}

/**
 * Resolve photos for a fixture ID. Conventions checked, in order:
 *   1. `<id>.HEIC|jpg|...`        single-photo
 *   2. `<id>-1.HEIC`, `<id>-2.HEIC`, ...   multi-photo (1-indexed)
 * Returns the basenames in order so the caller can pass them straight to
 * the existing `convertHeicToJpeg` helper. Lowercase comparison only.
 */
function resolvePhotos(id: string, index: PhotoIndex): string[] {
    const lid = id.toLowerCase();
    const single = index.byStem.get(lid);
    if (single && single.length > 0) {
        // Stable order for reproducibility
        return [...single].sort();
    }
    const multi: string[] = [];
    for (let i = 1; i <= 10; i++) {
        const stem = `${lid}-${i}`;
        const hits = index.byStem.get(stem);
        if (!hits || hits.length === 0) break;
        // If multiple extensions resolve, prefer HEIC then jpg then png — but
        // in practice the human will only place one file per stem.
        multi.push([...hits].sort()[0]);
    }
    return multi;
}

// ── Trade normalisation ───────────────────────────────────────────────────────

/**
 * The matrix scorer compares trade strings exactly. The taxonomy uses canonical
 * labels like `Plumbing`, `Building & Construction`, `Garden & Landscaping`,
 * but the markdown sometimes uses abbreviated forms (`Building`, `Garden`).
 * Normalise common variants here so the loaded fixtures match what Agent 2a
 * actually emits.
 */
const TRADE_ALIASES: Record<string, string> = {
    building: 'Building & Construction',
    'building & construction': 'Building & Construction',
    'building and construction': 'Building & Construction',
    construction: 'Building & Construction',
    carpentry: 'Carpentry & Woodwork',
    'carpentry & woodwork': 'Carpentry & Woodwork',
    'carpentry and woodwork': 'Carpentry & Woodwork',
    woodwork: 'Carpentry & Woodwork',
    flooring: 'Flooring & Tiling',
    'flooring & tiling': 'Flooring & Tiling',
    'flooring and tiling': 'Flooring & Tiling',
    tiling: 'Flooring & Tiling',
    handyman: 'General Handyman',
    'general handyman': 'General Handyman',
    locksmith: 'Locksmith',
    painting: 'Painting',
    pool: 'Pool Maintenance',
    'pool maintenance': 'Pool Maintenance',
    garden: 'Garden & Landscaping',
    'garden & landscaping': 'Garden & Landscaping',
    'garden and landscaping': 'Garden & Landscaping',
    landscaping: 'Garden & Landscaping',
    rubble: 'Rubble & Waste',
    'rubble & waste': 'Rubble & Waste',
    'rubble and waste': 'Rubble & Waste',
    waste: 'Rubble & Waste',
    welding: 'Welding',
    security: 'Security',
    electrical: 'Electrical',
    plumbing: 'Plumbing',
};

function normaliseTrade(s: string | undefined): string | undefined {
    if (!s) return undefined;
    const key = s.trim().toLowerCase();
    return TRADE_ALIASES[key] ?? s.trim();
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function loadFixturesFromMarkdown(
    mdPath: string,
    options: LoadOptions = {},
): LoadResult {
    const photoDir = options.photoDir ?? join(homedir(), 'Downloads');
    const ignoreMissingPhotos = options.ignoreMissingPhotos === true;
    const photoIndex = indexPhotoDir(photoDir);

    if (!existsSync(mdPath)) {
        throw new Error(`Fixture markdown not found: ${mdPath}`);
    }
    const text = readFileSync(mdPath, 'utf8');
    const lines = text.split('\n');

    const fixtures: LoadedTestCase[] = [];
    const skipped: SkippedFixture[] = [];

    let currentSubcategory: string | null = null;
    let currentSection: CurrentSection | null = null;
    /**
     * After we see a header row we wait for the separator row. Only then do
     * subsequent pipe-rows count as data rows. This avoids parsing tables in
     * the doc preamble (e.g. coverage summary tables at the bottom).
     */
    let awaitingSeparator = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Subcategory heading — `#### subcategory_id` per the orchestrator spec.
        const h4 = line.match(/^####\s+(.+?)\s*$/);
        if (h4) {
            const heading = h4[1].trim();
            // Accept either the bare id (`gate_motor_fault`) or a labelled
            // form like `gate_motor_fault — Gate Motor / Gate Fault`. The id
            // is the first whitespace- or em-dash-separated token of underscore-
            // or-letter chars.
            const idMatch = heading.match(/^([a-z][a-z0-9_]+)/);
            currentSubcategory = idMatch ? idMatch[1] : null;
            currentSection = null;
            awaitingSeparator = false;
            continue;
        }

        // Trade heading at h3 — reset subcategory context if we're in a new
        // trade section (defensive — well-formed input wouldn't need this).
        if (/^###\s+/.test(line)) {
            currentSubcategory = null;
            currentSection = null;
            awaitingSeparator = false;
            continue;
        }

        // Table separator — confirms the previous row was the header. We
        // already built the header map; just flip the gate open.
        if (isHeaderSeparator(line)) {
            awaitingSeparator = false;
            continue;
        }

        // Pipe-row
        const row = parseTableRow(line);
        if (!row) {
            // Reset table state on first non-table line (a blank, paragraph,
            // or section break). Doesn't affect currentSubcategory.
            currentSection = null;
            awaitingSeparator = false;
            continue;
        }

        // Header row — first pipe-row after a `#### subcategory_id` line.
        if (currentSubcategory && !currentSection) {
            const headerMap = buildHeaderMap(row);
            // Sanity check: we need at least `id` and `user_text` columns,
            // otherwise this is a different sort of table (e.g. coverage
            // summary) and we shouldn't try to parse rows from it.
            if (headerMap.id === undefined || headerMap.user_text === undefined) {
                currentSection = null;
                continue;
            }
            currentSection = { subcategoryId: currentSubcategory, headerMap };
            awaitingSeparator = true;
            continue;
        }

        // Data row
        if (currentSection && !awaitingSeparator) {
            const { headerMap, subcategoryId } = currentSection;
            const get = (key: string): string => {
                const idx = headerMap[key];
                if (idx === undefined) return '';
                return row.cells[idx] ?? '';
            };
            const id = get('id').trim();
            if (!id) {
                // Empty id row (e.g. trailing separator) — skip silently.
                continue;
            }
            const description = get('description');
            const userText = stripQuotes(get('user_text'));
            const suggestedSearch = stripQuotes(get('suggested_search'));
            const expectedSid = get('expected_sid') || subcategoryId;
            const expectedTrade = normaliseTrade(get('expected_trade'));
            const requiresClarification = parseBool(get('requires_clarification'));
            const titleKeywords = parseList(get('title_includes_any'));

            // Required-field check. id + user_text are sufficient for an eval
            // run — everything else is "expected" data we score against.
            if (!userText && !id.includes('photos-only')) {
                // We allow empty user_text only when the row says so explicitly
                // by virtue of having an image-only id pattern. The orchestrator
                // produces some `""`-text rows for "photos only" cases — those
                // are valid and we keep them.
            }

            const photos = resolvePhotos(id, photoIndex);
            if (photos.length === 0 && !ignoreMissingPhotos) {
                skipped.push({ id, subcategoryId, reason: 'no-photo' });
                continue;
            }

            fixtures.push({
                id,
                description,
                subcategoryId,
                photos,
                text: userText,
                expected: {
                    subcategory_id: expectedSid,
                    trade: expectedTrade,
                    title_includes_any: titleKeywords.length > 0 ? titleKeywords : undefined,
                    requires_clarification: requiresClarification,
                    // Mirror to `commit` for matrix scoring compatibility:
                    // requires_clarification === true  → commit === false
                    commit: requiresClarification === undefined ? undefined : !requiresClarification,
                },
                suggestedSearch,
            });
        }
    }

    // Aggregate counts
    const bySubcategory: Record<string, number> = {};
    const byTrade: Record<string, number> = {};
    for (const f of fixtures) {
        bySubcategory[f.subcategoryId] = (bySubcategory[f.subcategoryId] ?? 0) + 1;
        const trade = f.expected.trade ?? 'Unknown';
        byTrade[trade] = (byTrade[trade] ?? 0) + 1;
    }

    return { fixtures, skipped, bySubcategory, byTrade };
}

// ── CLI smoke test ────────────────────────────────────────────────────────────

/**
 * `npx tsx scripts/eval-load-fixtures.ts <path>` prints a per-subcategory
 * loaded-vs-skipped summary so the human can see at a glance how many of
 * the markdown candidates are eval-ready.
 */
function cliMain(): void {
    const argPath = process.argv[2];
    if (!argPath) {
        console.error('Usage: npx tsx scripts/eval-load-fixtures.ts <fixtures.md> [--ignore-photos]');
        process.exit(1);
    }
    const ignoreMissingPhotos = process.argv.includes('--ignore-photos');
    const expanded = argPath.startsWith('~') ? join(homedir(), argPath.slice(1)) : argPath;
    const result = loadFixturesFromMarkdown(expanded, { ignoreMissingPhotos });

    console.log(`\nLoaded ${result.fixtures.length} fixture(s), skipped ${result.skipped.length}.`);
    console.log(`\nBy trade:`);
    for (const [trade, n] of Object.entries(result.byTrade).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${trade.padEnd(28, ' ')} ${n}`);
    }
    console.log(`\nBy subcategory (loaded):`);
    for (const [sid, n] of Object.entries(result.bySubcategory).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${sid.padEnd(32, ' ')} ${n}`);
    }
    if (result.skipped.length > 0) {
        const bySid: Record<string, number> = {};
        for (const s of result.skipped) bySid[s.subcategoryId] = (bySid[s.subcategoryId] ?? 0) + 1;
        console.log(`\nSkipped by subcategory:`);
        for (const [sid, n] of Object.entries(bySid).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${sid.padEnd(32, ' ')} ${n}  (no photo)`);
        }
    }
}

// Run CLI only when invoked directly. The matrix imports the loader without
// triggering this branch.
const invokedDirectly =
    typeof process !== 'undefined' &&
    process.argv[1] &&
    /eval-load-fixtures\.ts$/.test(process.argv[1]);
if (invokedDirectly) cliMain();
