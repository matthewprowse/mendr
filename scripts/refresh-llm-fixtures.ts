#!/usr/bin/env tsx
/**
 * scripts/refresh-llm-fixtures.ts
 *
 * Re-captures Gemini outputs against the pinned prompts in
 * `src/features/diagnosis/prompts/` and writes them to
 * `src/features/diagnosis/__tests__/fixtures/classify/*.json` and
 * `.../prose/*.json`.
 *
 * Phase 7 — Hardening. This is the human-in-the-loop tool for refreshing the
 * LLM fixtures that Phase 2's parser tests pin against. The CI workflow
 * `.github/workflows/refresh-fixtures.yml` triggers this on `workflow_dispatch`
 * and opens a PR with the resulting diff. We never call Gemini in CI on
 * `push`/`pull_request` — only when a human asks for a refresh.
 *
 * Usage:
 *
 *   GEMINI_API_KEY=... pnpm scripts:refresh-llm-fixtures
 *
 * Behaviour:
 *
 *   1. Reads GEMINI_API_KEY from env (errors clearly if missing).
 *   2. For each of the SCENARIOS below, calls runClassification + the prose
 *      parser path against the live model.
 *   3. Writes the raw model response into the fixtures directory as
 *      pretty-printed JSON in the same shape the existing fixtures use
 *      ({ name, raw, expected }).
 *   4. Logs a diff summary of which fixtures changed.
 *
 * We capture the *raw model JSON string* because the parser tests pin against
 * that — not against the post-finalisation ClassificationResult. That way a
 * schema/prompt drift surfaces as a parser test failure, not silently in
 * normalised output.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { Content as GeminiContent } from '@google/genai';

import { runClassification } from '@/features/diagnosis/agent-classify';
import { runProseGeneration } from '@/features/diagnosis/agent-prose';
import { buildProseBaseInstruction } from '@/features/diagnosis/prompts/composer';
import type { PromptContext } from '@/features/diagnosis/prompts/types';
import { SERVICE_LABELS } from '@/lib/services';

// ── Scenarios ────────────────────────────────────────────────────────────────
// A representative mix covering the trade taxonomy buckets that the parser
// tests must keep parsing as the prompts evolve.

interface Scenario {
    /** Filename slug (without .json). */
    slug: string;
    /** Human-readable name written into the fixture. */
    name: string;
    /** Single-turn user description. */
    description: string;
}

const SCENARIOS: Scenario[] = [
    {
        slug: '01-geyser-leak',
        name: 'Geyser leaking from pressure relief valve',
        description:
            'Water is dripping steadily from a pipe outside next to the geyser on the roof. The drip has been going for two days. The geyser is about eight years old.',
    },
    {
        slug: '02-db-board-trip',
        name: 'DB board tripping repeatedly when kettle boils',
        description:
            'Every time my wife switches the kettle on the main earth-leakage trips and the whole kitchen goes dark. It only happens with the kettle, the rest of the house is fine.',
    },
    {
        slug: '03-blocked-drain',
        name: 'Blocked kitchen drain backing up into sink',
        description:
            'The kitchen sink has been draining slowly for a week and this morning when I ran the dishwasher dirty water came back up the sink. There is a gurgling sound in the bathroom basin at the same time.',
    },
    {
        slug: '04-gate-motor',
        name: 'Driveway gate motor stalling halfway',
        description:
            'My driveway sliding gate stops about a metre before fully closing then beeps three times. If I push it the last bit by hand it locks fine. The motor is a Centurion D5.',
    },
    {
        slug: '05-paint-job',
        name: 'Interior repaint quote',
        description:
            'I want to repaint our lounge, dining room and hallway. About 80 square metres of wall total. Walls are sound, no damp, just tired beige we want to change to a warm white.',
    },
    {
        slug: '06-garden-maintenance',
        name: 'Monthly garden maintenance for small Cape Town property',
        description:
            'Looking for someone to come every two weeks to mow our small lawn, edge the beds, and keep the hedge trimmed. About 200 square metres of garden in Newlands.',
    },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fixturesDir(kind: 'classify' | 'prose'): string {
    return path.join(
        __dirname,
        '..',
        'src',
        'features',
        'diagnosis',
        '__tests__',
        'fixtures',
        kind,
    );
}

function buildContents(description: string): GeminiContent[] {
    return [
        {
            role: 'user',
            parts: [{ text: description }],
        },
    ];
}

function buildBaselinePromptContext(serviceListText: string): PromptContext {
    // Minimal context — the script captures the "no prior diagnosis, no
    // refinement, no provider hydration" baseline. Variant prompts (followup,
    // refinement, etc.) are covered by their own parser tests with hand-built
    // fixtures and don't need a full live refresh.
    return {
        serviceListText,
        providers: [],
        previousDiagnosis: null,
        diagnosisRejected: false,
        isRefinementWithNewImages: false,
        feedback: undefined,
    };
}

async function readExisting(filePath: string): Promise<string | null> {
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch {
        return null;
    }
}

async function writeFixture(
    filePath: string,
    payload: Record<string, unknown>,
): Promise<{ changed: boolean; created: boolean }> {
    const next = `${JSON.stringify(payload, null, 4)}\n`;
    const prev = await readExisting(filePath);
    if (prev === next) {
        return { changed: false, created: false };
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, next, 'utf8');
    return { changed: true, created: prev === null };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error(
            '[refresh-llm-fixtures] GEMINI_API_KEY is required. Set it in your environment ' +
                'before running this script — never commit it. Aborting.',
        );
        process.exit(1);
    }

    const serviceListText = SERVICE_LABELS.join(', ');
    const allowedTradeLabels = [...SERVICE_LABELS];
    const promptContext = buildBaselinePromptContext(serviceListText);
    const proseBaseInstruction = buildProseBaseInstruction(promptContext);

    const classifyDir = fixturesDir('classify');
    const proseDir = fixturesDir('prose');

    const summary: Array<{
        slug: string;
        classify: 'created' | 'updated' | 'unchanged' | 'error';
        prose: 'created' | 'updated' | 'unchanged' | 'error';
    }> = [];

    for (const scenario of SCENARIOS) {
        console.log(`\n[refresh-llm-fixtures] ${scenario.slug} — ${scenario.name}`);
        const contents = buildContents(scenario.description);

        let classification;
        let classifyStatus: 'created' | 'updated' | 'unchanged' | 'error' = 'error';
        try {
            classification = await runClassification(
                contents,
                serviceListText,
                allowedTradeLabels,
            );
            // We re-serialise the finalised classification as the fixture's
            // `raw` payload. This mirrors the schema-enforced JSON Gemini emits
            // on the happy path; the parser tests can also synthesise malformed
            // variants by hand if needed.
            const raw = JSON.stringify(classification);
            const filePath = path.join(classifyDir, `${scenario.slug}.json`);
            const res = await writeFixture(filePath, {
                name: scenario.name,
                raw,
                expected: classification,
            });
            classifyStatus = res.changed
                ? res.created
                    ? 'created'
                    : 'updated'
                : 'unchanged';
            console.log(`  classify → ${classifyStatus}`);
        } catch (err) {
            console.error(`  classify → error: ${(err as Error).message}`);
        }

        if (!classification) {
            summary.push({ slug: scenario.slug, classify: classifyStatus, prose: 'error' });
            continue;
        }

        let proseStatus: 'created' | 'updated' | 'unchanged' | 'error' = 'error';
        try {
            const prose = await runProseGeneration({
                contents,
                classification,
                baseSystemInstruction: proseBaseInstruction,
                imageCount: 0,
            });
            const raw = JSON.stringify(prose);
            const filePath = path.join(proseDir, `${scenario.slug}.json`);
            const res = await writeFixture(filePath, {
                name: scenario.name,
                raw,
                expected: prose,
            });
            proseStatus = res.changed
                ? res.created
                    ? 'created'
                    : 'updated'
                : 'unchanged';
            console.log(`  prose    → ${proseStatus}`);
        } catch (err) {
            console.error(`  prose    → error: ${(err as Error).message}`);
        }

        summary.push({ slug: scenario.slug, classify: classifyStatus, prose: proseStatus });
    }

    // ── Diff summary ────────────────────────────────────────────────────────
    console.log('\n[refresh-llm-fixtures] Summary');
    console.log('  slug                          classify        prose');
    console.log('  ----                          --------        -----');
    for (const row of summary) {
        console.log(
            `  ${row.slug.padEnd(30)}${row.classify.padEnd(16)}${row.prose}`,
        );
    }

    const changed = summary.filter(
        (r) => r.classify === 'updated' || r.classify === 'created' || r.prose === 'updated' || r.prose === 'created',
    );
    if (changed.length === 0) {
        console.log('\n[refresh-llm-fixtures] No fixtures changed.');
    } else {
        console.log(
            `\n[refresh-llm-fixtures] ${changed.length} scenario(s) produced changed fixtures. ` +
                'Re-run the diagnosis parser tests and inspect the git diff before committing.',
        );
    }
}

main().catch((err) => {
    console.error('[refresh-llm-fixtures] fatal:', err);
    process.exit(1);
});
