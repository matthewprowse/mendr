/**
 * Live eval-test driver.
 *
 * Runs the canonical 4 test scenarios end-to-end against the local dev
 * server: converts the user's HEIC test photos to JPEG, uploads them
 * through `/api/upload-image`, POSTs to `/api/diagnose`, waits for Agent 3
 * critique to land, then queries Supabase for the final state and prints a
 * comparison table. Saves a JSON snapshot under `tmp/eval-live/<ts>.json`
 * for later diff against previous runs.
 *
 * Invocation:
 *   npm run eval:live                     # all 4 tests
 *   npm run eval:live -- --tests 1,3      # subset by 1-based index
 *   npm run eval:live -- --base http://localhost:3000  # different base
 *
 * Pre-requisites:
 *   - dev server running (`npm run dev`)
 *   - .env.local has NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - HEIC photos sitting in ~/Downloads named:
 *       Garage Door 1.HEIC … Garage Door 4.HEIC
 *       Geyser 1.HEIC … Geyser 3.HEIC
 *   - `sips` available on PATH (default on macOS)
 *
 * Designed to replace the ceremony of clicking through the diagnosis UI by
 * hand for every model A/B. The dev server itself is the system under test;
 * this driver is a pure client that doesn't touch any production code.
 */

import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Mirror Next.js env-loading order: .env.local overrides .env. We need
// both because credentials usually live in .env and per-developer
// toggles in .env.local.
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '.env.local'), override: true });

// ── CLI arg parsing ───────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name: string, fallback?: string): string | undefined {
    const idx = argv.indexOf(`--${name}`);
    if (idx === -1 || idx === argv.length - 1) return fallback;
    return argv[idx + 1];
}

const BASE_URL = flag('base', 'http://localhost:3000') as string;
const SELECTED_INDICES =
    flag('tests')?.split(',').map((s) => Number.parseInt(s.trim(), 10) - 1) ?? null;
const DOWNLOADS = join(homedir(), 'Downloads');
const TMP_DIR = '/tmp/eval-live';
const REPORT_DIR = resolve(process.cwd(), 'tmp/eval-live');

// ── Test definitions ──────────────────────────────────────────────────────────
interface TestCase {
    readonly id: string;
    readonly description: string;
    /**
     * HEIC filenames in priority order (index 0 = primary photo).
     */
    readonly photos: readonly string[];
    /**
     * User text fed into the diagnose call. Empty string = photos-only.
     */
    readonly text: string;
    /**
     * Optional expectations — printed alongside actual results for visual diff.
     * Not hard assertions; they're guidance.
     */
    readonly expected: {
        readonly subcategory_id?: string;
        readonly trade?: string;
        readonly title_includes_any?: readonly string[];
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
            title_includes_any: ['Corroded', 'Geyser Tank', 'Cylinder'],
            requires_clarification: false,
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
            title_includes_any: ['Geyser'],
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
            requires_clarification: false,
        },
    },
    {
        id: 'garage-no-text',
        description: 'Garage door — photos only (symmetry-enumeration test)',
        photos: ['Garage Door 1.HEIC', 'Garage Door 2.HEIC', 'Garage Door 3.HEIC', 'Garage Door 4.HEIC'],
        text: '',
        expected: {
            subcategory_id: 'garage_door_fault',
            trade: 'Security',
        },
    },
] as const;

// ── Supabase client (server-role, only for the verification query) ────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
        '❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local',
    );
    process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function convertHeicToJpeg(heicPath: string): string {
    ensureDir(TMP_DIR);
    const out = join(
        TMP_DIR,
        basename(heicPath).replace(/\.HEIC$/i, '.jpg').replace(/\s+/g, '_'),
    );
    execSync(`sips -s format jpeg -s formatOptions 80 -Z 1400 "${heicPath}" --out "${out}"`, {
        stdio: 'ignore',
    });
    return out;
}

// ── Beta-access cookie ────────────────────────────────────────────────────────
// src/proxy.ts redirects every non-public path to /coming-soon unless the
// request carries `beta_access=granted`. Without this header the script's
// fetches get 307'd and the API never runs. The cookie value is a constant
// in the proxy (`BETA_COOKIE_VALUE = 'granted'`) so we can set it directly
// without authenticating through /api/beta-access first.
const BETA_COOKIE_HEADER = 'beta_access=granted';

async function uploadPhoto(
    conversationId: string,
    jpegPath: string,
): Promise<{ imageUrl: string; imageUrls: string[] }> {
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
    if (!res.ok) {
        throw new Error(`upload-image failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as { imageUrl: string; imageUrls: string[] };
}

async function runDiagnose(payload: Record<string, unknown>): Promise<{ status: number; body: string }> {
    const res = await fetch(`${BASE_URL}/api/diagnose`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: BETA_COOKIE_HEADER,
        },
        body: JSON.stringify(payload),
        redirect: 'manual',
    });
    return { status: res.status, body: await res.text() };
}

/**
 * Parse the diagnose response body and return the structured diagnosis
 * JSON. The endpoint either:
 *   - Streams NDJSON (one JSON object per line, type 'thought' | 'complete'),
 *     where the 'complete' line carries the final response text.
 *   - Returns a plain text body containing `<thought>…</thought><json>…</json>`.
 *
 * Both shapes get unwrapped to the same `<json>` payload, which we parse.
 */
function parseDiagnoseResponse(body: string): Record<string, unknown> | null {
    // Try NDJSON first — each line is a JSON object; the last 'complete'
    // line carries the full text.
    let fullText: string | null = null;
    const lines = body.split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
        try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            if (obj.type === 'complete' && typeof obj.full === 'string') {
                fullText = obj.full;
            }
        } catch {
            // Not NDJSON or not a complete object — fall through to plain-text
            // parsing below.
        }
    }
    if (!fullText) {
        // Plain-text body containing the <thought>+<json> wrapper.
        fullText = body;
    }
    const m = fullText.match(/<json>([\s\S]+?)<\/json>/);
    if (!m) return null;
    try {
        return JSON.parse(m[1]) as Record<string, unknown>;
    } catch {
        return null;
    }
}

async function fetchDiagnosisRow(conversationId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from('diagnoses')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
    if (error) {
        console.error(`  ⚠️  supabase query error: ${error.message}`);
        return null;
    }
    return (data ?? null) as Record<string, unknown> | null;
}

async function fetchBreadcrumbs(conversationId: string): Promise<Array<Record<string, unknown>>> {
    const { data } = await supabase
        .from('audit_logs')
        .select('created_at, action, payload')
        .eq('entity_id', conversationId)
        .order('created_at', { ascending: true });
    return (data ?? []) as Array<Record<string, unknown>>;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function pickModelLabel(): string {
    return process.env.GEMINI_DIAGNOSIS_MODEL || 'gemini-2.5-flash (default)';
}

// ── Per-test execution ────────────────────────────────────────────────────────
interface TestResult {
    readonly id: string;
    readonly description: string;
    readonly conversationId: string;
    readonly model: string;
    readonly status: 'ok' | 'error';
    readonly error?: string;
    readonly diagnose_status?: number;
    readonly elapsed_ms: number;
    readonly row?: Record<string, unknown> | null;
    readonly breadcrumbs?: Array<Record<string, unknown>>;
    /** Diagnosis JSON parsed from the streamed response body. */
    readonly parsed?: Record<string, unknown> | null;
    /** Captured response body excerpt for debug when parse fails. */
    readonly body_excerpt?: string;
}

async function runOne(test: TestCase): Promise<TestResult> {
    const conversationId = randomUUID();
    const model = pickModelLabel();
    const started = Date.now();
    console.log(`\n──────────────────────────────────────────────────────────────`);
    console.log(`▶  ${test.id}`);
    console.log(`   ${test.description}`);
    console.log(`   model: ${model}`);
    console.log(`   convo: ${conversationId}`);
    console.log(`   photos: ${test.photos.length}`);
    if (test.text) console.log(`   text: "${test.text.slice(0, 80)}…"`);

    try {
        // 1. Convert HEIC → JPEG
        const jpegs: string[] = [];
        for (const photo of test.photos) {
            const heicPath = join(DOWNLOADS, photo);
            if (!existsSync(heicPath)) {
                throw new Error(`missing photo: ${heicPath}`);
            }
            jpegs.push(convertHeicToJpeg(heicPath));
        }
        console.log(`   ✓ converted ${jpegs.length} HEIC → JPEG`);

        // 2. Upload each photo (creates / extends the diagnoses row)
        const imageUrls: string[] = [];
        for (const jpeg of jpegs) {
            const result = await uploadPhoto(conversationId, jpeg);
            imageUrls.push(result.imageUrl);
        }
        console.log(`   ✓ uploaded ${imageUrls.length} photos`);

        // 3. POST /api/diagnose (streaming flow is the default)
        const diagPayload = {
            conversationId,
            imageUrls,
            ...(test.text ? { textQuery: test.text } : {}),
            stream: true,
        };
        const diagStart = Date.now();
        const diagResult = await runDiagnose(diagPayload);
        const diagElapsed = Date.now() - diagStart;
        console.log(
            `   ✓ diagnose completed in ${(diagElapsed / 1000).toFixed(1)}s (status ${diagResult.status})`,
        );

        // 4. Parse the streamed response directly. The DB row is updated by
        // the browser client after streaming completes; this driver isn't a
        // browser so we parse the response body in-place.
        const parsed = parseDiagnoseResponse(diagResult.body);
        if (!parsed) {
            console.log(`   ⚠️  could not parse diagnose response body (first 400 chars below)`);
            console.log(`      ${diagResult.body.slice(0, 400).replace(/\n/g, ' | ')}`);
        }

        // 5. Wait for Agent 3 critique fire-and-forget tail
        console.log(`   … waiting 8s for Agent 3 critique to land`);
        await sleep(8000);

        // 6. Fetch final state (row may be empty since we don't PATCH)
        const row = await fetchDiagnosisRow(conversationId);
        const breadcrumbs = await fetchBreadcrumbs(conversationId);

        return {
            id: test.id,
            description: test.description,
            conversationId,
            model,
            status: 'ok',
            diagnose_status: diagResult.status,
            elapsed_ms: Date.now() - started,
            row,
            breadcrumbs,
            parsed,
            body_excerpt: parsed ? undefined : diagResult.body.slice(0, 800),
        };
    } catch (e) {
        return {
            id: test.id,
            description: test.description,
            conversationId,
            model,
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
            elapsed_ms: Date.now() - started,
        };
    }
}

// ── Report rendering ──────────────────────────────────────────────────────────
function renderRow(r: TestResult, test: TestCase): void {
    console.log(``);
    if (r.status === 'error') {
        console.log(`   ✗ ERROR: ${r.error}`);
        return;
    }
    // Prefer the parsed streamed-response body (always present when diagnose
    // succeeded) over the DB row (only populated when the browser client
    // patches the row after streaming). When both exist, parsed wins because
    // it reflects exactly what the server would return to the browser this run.
    const row = r.row ?? {};
    const dbDiagnosis = (row.diagnosis as Record<string, unknown>) ?? {};
    const diagnosis = r.parsed ?? dbDiagnosis;
    const title = String(diagnosis.diagnosis ?? '<missing>');
    const subcat = String(diagnosis.subcategory_id ?? '');
    const trade = String(diagnosis.trade ?? '');
    const conf = Number(diagnosis.confidence ?? 0);
    const failedComp = String(diagnosis.failed_component ?? '');
    const cascading = String(diagnosis.cascading_damage ?? '');
    const requiresClarif = Boolean(diagnosis.requires_clarification);
    const hasStruct = Boolean(diagnosis.structured_clarification);
    const hypotheses =
        ((diagnosis.structured_clarification as Record<string, unknown> | undefined)?.hypotheses as
            | Array<Record<string, unknown>>
            | undefined) ?? [];
    const h1 = hypotheses[0] ? String((hypotheses[0].label ?? '')) : '';
    const h2 = hypotheses[1] ? String((hypotheses[1].label ?? '')) : '';
    const critique = row.diagnosis_critique as Record<string, unknown> | null | undefined;
    const critFailureMode = critique ? String(critique.failure_mode ?? '<no field>') : null;
    const critCalib =
        (critique?.confidence_calibration as Record<string, unknown> | undefined) ?? null;
    const critConf = critCalib ? Number(critCalib.critique_confidence ?? 0) : null;
    const rubricFacets = (critCalib?.rubric_facets_used as string[] | undefined) ?? null;

    // Match indicator
    function check(actual: string | undefined, expected?: string): string {
        if (!expected) return '·';
        if (!actual) return '✗';
        return actual === expected ? '✓' : `✗ (got ${actual})`;
    }
    function checkInc(actual: string, expected?: readonly string[]): string {
        if (!expected) return '·';
        if (!actual) return '✗';
        const hit = expected.some((e) => actual.toLowerCase().includes(e.toLowerCase()));
        return hit ? '✓' : `✗ (got "${actual}")`;
    }

    console.log(`   Title:        "${title}"  ${checkInc(title, test.expected.title_includes_any)}`);
    console.log(`   Subcategory:  ${subcat || '<empty>'}  ${check(subcat, test.expected.subcategory_id)}`);
    console.log(`   Trade:        ${trade || '<empty>'}  ${check(trade, test.expected.trade)}`);
    console.log(`   Confidence:   ${conf}`);
    console.log(`   Failed comp:  ${failedComp || '<empty>'}`);
    console.log(`   Cascading:    ${cascading || '<empty>'}`);
    console.log(`   Needs clarif: ${requiresClarif}${
        test.expected.requires_clarification !== undefined
            ? requiresClarif === test.expected.requires_clarification ? '  ✓' : '  ✗'
            : ''
    }`);
    console.log(`   Structured?   ${hasStruct ? 'YES' : 'no'} (${hypotheses.length} hypotheses)`);
    if (h1) console.log(`     h1:         ${h1}`);
    if (h2) console.log(`     h2:         ${h2}`);
    if (critique) {
        console.log(`   Critique:     failure_mode=${critFailureMode}, conf=${critConf}`);
        if (rubricFacets) console.log(`     facets:     [${rubricFacets.join(', ')}]`);
    } else {
        console.log(`   Critique:     <not populated>`);
    }
    if (r.breadcrumbs && r.breadcrumbs.length > 0) {
        const steps = r.breadcrumbs
            .map((b) => {
                const payload = b.payload as Record<string, unknown> | undefined;
                return payload?.step ?? '?';
            })
            .join(' → ');
        console.log(`   Breadcrumbs:  ${steps}`);
    } else {
        console.log(`   Breadcrumbs:  <none>`);
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  Mendr Live Eval Driver                                      ║`);
    console.log(`║  Base URL: ${BASE_URL.padEnd(50, ' ')}║`);
    console.log(`║  Model:    ${pickModelLabel().padEnd(50, ' ')}║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝`);

    const toRun = SELECTED_INDICES
        ? TESTS.filter((_, i) => SELECTED_INDICES.includes(i))
        : TESTS;

    const results: TestResult[] = [];
    for (const test of toRun) {
        const result = await runOne(test);
        renderRow(result, test);
        results.push(result);
    }

    // Persist JSON report
    ensureDir(REPORT_DIR);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const modelTag = pickModelLabel().replace(/[^a-z0-9.]/gi, '_');
    const outPath = join(REPORT_DIR, `run-${modelTag}-${ts}.json`);
    writeFileSync(outPath, JSON.stringify({ ts, model: pickModelLabel(), results }, null, 2));

    console.log(`\n──────────────────────────────────────────────────────────────`);
    console.log(`✓ Ran ${results.length} test(s) on ${pickModelLabel()}`);
    console.log(`✓ Report saved: ${outPath}`);
    console.log(`──────────────────────────────────────────────────────────────\n`);
}

main().catch((e) => {
    console.error(`\n❌ Fatal: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
});
