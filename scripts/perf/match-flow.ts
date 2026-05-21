import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

type EndpointSample = {
    url: string;
    status: number;
    method: string;
    durationMs: number;
    startedAtIso: string;
    endedAtIso: string;
};

type PerfReport = {
    baseUrl: string;
    startedAtIso: string;
    finishedAtIso: string;
    elapsedMs: number;
    endpoints: Record<string, EndpointSample[]>;
    providersDebugTiming: unknown | null;
    finalUrl: string | null;
    consoleErrors: string[];
    failedApiResponses: Array<{
        url: string;
        status: number;
        method: string;
        responseSnippet: string;
    }>;
    artifacts: {
        screenshotPath: string | null;
        htmlPath: string | null;
    };
    notes: string[];
};

const TARGETS = ['/api/providers', '/api/enrich/get', '/api/enrich/queue'] as const;

function nowIso(): string {
    return new Date().toISOString();
}

function tinyPngBuffer(): Buffer {
    // 1x1 PNG
    return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJQJ6lQAAAAASUVORK5CYII=',
        'base64'
    );
}

async function run(): Promise<void> {
    const baseUrl = process.env.PERF_BASE_URL || 'http://localhost:3000';
    const directMatchPathEnv = process.env.PERF_MATCH_PATH || '';
    const directConversationId = process.env.PERF_CONVERSATION_ID || '';
    let directMatchPath =
        directMatchPathEnv ||
        (directConversationId ? `/match/${encodeURIComponent(directConversationId)}` : '');
    const startedAt = Date.now();
    const startedAtIso = nowIso();
    const notes: string[] = [];
    const consoleErrors: string[] = [];
    const failedApiResponses: Array<{
        url: string;
        status: number;
        method: string;
        responseSnippet: string;
    }> = [];
    let finalUrl: string | null = null;
    let screenshotPath: string | null = null;
    let htmlPath: string | null = null;

    const headless = process.env.HEADFUL ? false : true;
    let browser;
    try {
        browser = await chromium.launch({ headless });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const missingBundled =
            msg.includes("Executable doesn't exist") || msg.includes('playwright was just installed');
        if (!missingBundled) throw err;
        // Fallback for environments where Playwright's bundled browser path is unavailable.
        browser = await chromium.launch({ headless, channel: 'chrome' });
    }
    const context = await browser.newContext();
    const page = await context.newPage();

    const requestStartByReq = new Map<object, { t: number; iso: string }>();
    const endpoints: Record<string, EndpointSample[]> = {
        '/api/providers': [],
        '/api/enrich/get': [],
        '/api/enrich/queue': [],
    };
    let providersDebugTiming: unknown | null = null;

    page.on('request', (req) => {
        requestStartByReq.set(req, { t: Date.now(), iso: nowIso() });
    });

    page.on('response', async (res) => {
        const url = res.url();
        const target = TARGETS.find((t) => url.includes(t));
        const status = res.status();
        if (
            (url.includes('/api/providers') || url.includes('/api/conversations') || url.includes('/api/enrich')) &&
            status >= 400
        ) {
            const snippet = await res.text().catch(() => '');
            failedApiResponses.push({
                url,
                status,
                method: res.request().method(),
                responseSnippet: snippet.slice(0, 400),
            });
        }
        if (!target) return;
        const req = res.request();
        const start = requestStartByReq.get(req) ?? { t: Date.now(), iso: nowIso() };
        const endT = Date.now();
        endpoints[target].push({
            url,
            status: res.status(),
            method: req.method(),
            durationMs: endT - start.t,
            startedAtIso: start.iso,
            endedAtIso: nowIso(),
        });

        if (target === '/api/providers' && providersDebugTiming == null) {
            try {
                const body = await res.json();
                providersDebugTiming = body?.debugTiming ?? null;
            } catch {
                // ignore parse issues
            }
        }
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    });

    try {
        // If no existing conversation was provided, seed one in dev so perf runs are zero-setup.
        if (!directMatchPath) {
            const seedRes = await fetch(`${baseUrl}/api/dev/perf-seed-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trade: process.env.PERF_TRADE || undefined,
                    tradeDetail: process.env.PERF_TRADE_DETAIL || undefined,
                    lat: process.env.PERF_LAT ? Number(process.env.PERF_LAT) : undefined,
                    lng: process.env.PERF_LNG ? Number(process.env.PERF_LNG) : undefined,
                    address: process.env.PERF_ADDRESS || undefined,
                }),
            }).catch(() => null);

            if (!seedRes?.ok) {
                const text = await seedRes?.text().catch(() => '') ?? '';
                throw new Error(
                    `Failed to seed perf conversation (status ${seedRes?.status ?? 'n/a'}): ${text || 'no response'}`
                );
            }
            const seeded = (await seedRes.json().catch(() => null)) as any;
            directMatchPath = typeof seeded?.matchPath === 'string' ? seeded.matchPath : '';
            if (!directMatchPath) {
                throw new Error('Perf seed did not return matchPath');
            }
            notes.push(`Seeded conversation for perf: ${directMatchPath}`);
        }

        if (directMatchPath) {
            await page.goto(`${baseUrl}${directMatchPath}`, {
                waitUntil: 'domcontentloaded',
                timeout: 60_000,
            });
            // Wait for the first providers fetch so the report has signal.
            const providersResponse = await page
                .waitForResponse(
                    (res) =>
                        res.url().includes('/api/providers') &&
                        res.request().method().toUpperCase() === 'POST',
                    { timeout: 60_000 }
                )
                .catch(() => null);
            // Give a short buffer for enrichment polling to kick in.
            await page.waitForTimeout(15_000);

            if (providersResponse == null) {
                notes.push('Direct match mode: timed out waiting for first /api/providers response.');
            }
        } else {
            await page.goto(`${baseUrl}/welcome`, { waitUntil: 'domcontentloaded', timeout: 45_000 });

            const photoInput = page.locator('#welcome-photo-input');
            await photoInput.setInputFiles({
                name: 'perf-test.png',
                mimeType: 'image/png',
                buffer: tinyPngBuffer(),
            });

            const continueBtn = page.getByRole('button', { name: /Continue to Menda Report/i });
            await continueBtn.waitFor({ state: 'visible', timeout: 15_000 });
            await continueBtn.click();

            // Wait for diagnosis to finish and route to match.
            const findBtn = page.getByRole('button', { name: /Find a Contractor/i });
            await findBtn.waitFor({ state: 'visible', timeout: 180_000 });
            // Diagnosis can take a while; wait until CTA is enabled before clicking.
            const enableDeadline = Date.now() + 180_000;
            while (Date.now() < enableDeadline) {
                const disabled = await findBtn.isDisabled().catch(() => true);
                if (!disabled) break;
                await page.waitForTimeout(500);
            }
            await findBtn.click();
            await page.waitForURL(/\/match\//, { timeout: 90_000, waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(20_000);
        }
    } catch (err) {
        notes.push(`Runner encountered an error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        finalUrl = page.url();
        const outDir = path.resolve(process.cwd(), 'scripts/perf/reports');
        await fs.mkdir(outDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        screenshotPath = path.join(outDir, `match-flow-${stamp}.png`);
        htmlPath = path.join(outDir, `match-flow-${stamp}.html`);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {
            screenshotPath = null;
        });
        const html = await page.content().catch(() => '');
        if (html) {
            await fs.writeFile(htmlPath, html, 'utf8').catch(() => {
                htmlPath = null;
            });
        } else {
            htmlPath = null;
        }
        await browser.close();
    }

    const finishedAtIso = nowIso();
    const report: PerfReport = {
        baseUrl,
        startedAtIso,
        finishedAtIso,
        elapsedMs: Date.now() - startedAt,
        endpoints,
        providersDebugTiming,
        finalUrl,
        consoleErrors,
        failedApiResponses,
        artifacts: {
            screenshotPath,
            htmlPath,
        },
        notes,
    };

    const outDir = path.resolve(process.cwd(), 'scripts/perf/reports');
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(
        outDir,
        `match-flow-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

    const providers = endpoints['/api/providers'];
    const enrichGet = endpoints['/api/enrich/get'];
    const enrichQueue = endpoints['/api/enrich/queue'];
    const avg = (arr: EndpointSample[]) =>
        arr.length ? Math.round(arr.reduce((sum, s) => sum + s.durationMs, 0) / arr.length) : 0;

    console.log(`Perf report written: ${outPath}`);
    console.log(
        `providers: ${providers.length} req, avg ${avg(providers)}ms | enrich/get: ${enrichGet.length} req, avg ${avg(enrichGet)}ms | enrich/queue: ${enrichQueue.length} req, avg ${avg(enrichQueue)}ms`
    );
    if (providersDebugTiming) {
        console.log(`providers debugTiming: ${JSON.stringify(providersDebugTiming)}`);
    }
}

void run();
