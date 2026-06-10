/**
 * Diagnostic-accuracy eval runner (Phase E of the Test Suite Audit, June 2026).
 *
 * Rebuilds the deleted accuracy harness as a SEPARATE, non-blocking job. Two
 * modes, both driven by the same fixture set + scorer:
 *
 *   • structure (default, free)  — runs the pipeline under MOCK_LLM so it makes
 *     NO Gemini calls. Verifies the classifier wiring returns a well-formed
 *     result for every fixture. Trade accuracy is meaningless here (the mock
 *     returns a constant) and is NOT reported.
 *
 *   • live (budget-gated)        — DIAGNOSIS_EVAL_LIVE=1 + a real GEMINI_API_KEY.
 *     Runs each fixture through the real classifier and reports trade accuracy
 *     as a TREND. Mirrors cost-research's spend gate: it refuses to run live
 *     without an explicit opt-in so a stray CI run can't burn tokens.
 *
 * Accuracy is never a pass/fail gate — the script exits 0 on a completed run
 * regardless of the score. Only an infrastructure error (missing key in live
 * mode, a thrown classifier) is a non-zero exit.
 *
 * CLI:
 *   npx tsx scripts/diagnosis-accuracy-eval.ts            # structure mode
 *   DIAGNOSIS_EVAL_LIVE=1 npx tsx scripts/diagnosis-accuracy-eval.ts   # live trend
 *   npx tsx scripts/diagnosis-accuracy-eval.ts --json     # machine-readable
 */

import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { Content as GeminiContent } from '@google/genai';

// Mirror Next.js env-loading order: .env.local overrides .env.
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '.env.local'), override: true });

import { SERVICE_LABELS } from '@/lib/services';
import { runClassification } from '@/features/diagnosis/agent-classify';
import { getGeminiApiKey } from '@/lib/ai/ai-client';
import { DIAGNOSIS_EVAL_FIXTURES } from '@/features/diagnosis/__evals__/diagnosis-fixtures';
import { runAccuracyEval } from '@/features/diagnosis/__evals__/run-eval';
import type { DiagnosisEvalFixture } from '@/features/diagnosis/__evals__/accuracy';

const asJson = process.argv.includes('--json');
const live = process.env.DIAGNOSIS_EVAL_LIVE === '1';

/** Build the allowed-trade service list text the classifier prompt expects. */
function buildServiceListText(): string {
    return SERVICE_LABELS.map((label) => `- ${label}`).join('\n');
}

/** A fault description becomes a single user-turn content. */
function toContents(fixture: DiagnosisEvalFixture): GeminiContent[] {
    return [{ role: 'user', parts: [{ text: fixture.description }] }];
}

async function main(): Promise<void> {
    const serviceListText = buildServiceListText();
    const trades = [...SERVICE_LABELS];

    if (live) {
        if (!getGeminiApiKey()) {
            console.error(
                'DIAGNOSIS_EVAL_LIVE=1 but GEMINI_API_KEY is not set — refusing to run a live eval.',
            );
            process.exit(1);
        }
        // Guard against the mock branch silently neutering a "live" run.
        if (process.env.MOCK_LLM === '1') {
            console.error('MOCK_LLM=1 is set — unset it to run a real live eval.');
            process.exit(1);
        }
    } else {
        // Structure mode: force the deterministic mock branch.
        process.env.MOCK_LLM = '1';
    }

    const { report, outcomes } = await runAccuracyEval(DIAGNOSIS_EVAL_FIXTURES, async (fixture) => {
        const result = await runClassification(toContents(fixture), serviceListText, trades);
        if (result.requestFailed) {
            throw new Error(`Classifier request failed for fixture "${fixture.id}"`);
        }
        return result;
    });

    if (!live) {
        // Structure-only: every fixture must produce a usable shape.
        const malformed = outcomes.filter(
            (o) => !o.predictedTrade || typeof o.confidence !== 'number',
        );
        const summary = {
            mode: 'structure',
            total: report.total,
            wellFormed: report.total - malformed.length,
            malformed: malformed.map((o) => o.id),
            note: 'MOCK_LLM mode — trade accuracy is not meaningful and is omitted.',
        };
        console.log(asJson ? JSON.stringify(summary, null, 2) : renderStructure(summary));
        process.exit(malformed.length === 0 ? 0 : 1);
    }

    const trend = {
        mode: 'live' as const,
        generatedAt: new Date().toISOString(),
        model: process.env.GEMINI_DIAGNOSIS_MODEL ?? 'gemini-2.5-flash',
        ...report,
    };
    console.log(asJson ? JSON.stringify(trend, null, 2) : renderTrend(trend));
    // Trend, not gate — always exit 0 on a completed live run.
    process.exit(0);
}

function renderStructure(s: {
    total: number;
    wellFormed: number;
    malformed: string[];
}): string {
    const lines = [
        'Diagnosis accuracy eval — STRUCTURE mode (MOCK_LLM, no Gemini calls)',
        `  fixtures:    ${s.total}`,
        `  well-formed: ${s.wellFormed}/${s.total}`,
    ];
    if (s.malformed.length) lines.push(`  MALFORMED:   ${s.malformed.join(', ')}`);
    lines.push('  (trade accuracy omitted — mock returns a constant classification)');
    return lines.join('\n');
}

function renderTrend(t: {
    generatedAt: string;
    model: string;
    total: number;
    tradeMatches: number;
    tradeAccuracy: number;
    subcategoryAccuracy: number | null;
    perTrade: Record<string, { total: number; correct: number; accuracy: number }>;
    mismatches: Array<{ id: string; expectedTrade: string; predictedTrade: string }>;
}): string {
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const lines = [
        `Diagnosis accuracy eval — LIVE trend (${t.model}) @ ${t.generatedAt}`,
        `  trade accuracy: ${t.tradeMatches}/${t.total} = ${pct(t.tradeAccuracy)}`,
        t.subcategoryAccuracy === null
            ? '  subcategory:    (none pinned)'
            : `  subcategory:    ${pct(t.subcategoryAccuracy)}`,
        '  per trade:',
        ...Object.entries(t.perTrade)
            .sort((a, b) => a[1].accuracy - b[1].accuracy)
            .map(([trade, s]) => `    ${pct(s.accuracy).padStart(6)}  ${trade} (${s.correct}/${s.total})`),
    ];
    if (t.mismatches.length) {
        lines.push('  misses:');
        for (const m of t.mismatches) {
            lines.push(`    ${m.id}: expected ${m.expectedTrade}, got ${m.predictedTrade || '∅'}`);
        }
    }
    return lines.join('\n');
}

main().catch((err) => {
    console.error('diagnosis-accuracy-eval failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
