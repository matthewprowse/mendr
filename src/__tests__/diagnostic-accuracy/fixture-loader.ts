/**
 * Loads + validates AccuracyFixture JSON files from disk.
 *
 * The loader is intentionally small — it does fs.readdir + JSON.parse +
 * structural validation, nothing else. The runner is responsible for the
 * taxonomy cross-checks (because those assertions are what the test is
 * actually testing).
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { AccuracyFixture } from './types';

const FIXTURES_ROOT = join(__dirname, 'fixtures');

export interface LoadedFixture {
    /** Relative path under fixtures/, e.g. "plumbing/geyser-corroded-tank-01.json". */
    readonly relativePath: string;
    /** Trade folder name, e.g. "plumbing", "disambiguation". */
    readonly folder: string;
    readonly fixture: AccuracyFixture;
}

function listJsonFilesRecursive(dir: string, prefix = ''): string[] {
    const entries = readdirSync(dir);
    const out: string[] = [];
    for (const entry of entries) {
        const full = join(dir, entry);
        const rel = prefix ? `${prefix}/${entry}` : entry;
        const stat = statSync(full);
        if (stat.isDirectory()) {
            out.push(...listJsonFilesRecursive(full, rel));
        } else if (entry.endsWith('.json')) {
            out.push(rel);
        }
    }
    return out;
}

function assertString(value: unknown, label: string): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Fixture validation failed: ${label} must be a non-empty string`);
    }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
    if (typeof value !== 'boolean') {
        throw new Error(`Fixture validation failed: ${label} must be a boolean`);
    }
}

function assertNumberInRange(value: unknown, label: string, min: number, max: number): asserts value is number {
    if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) {
        throw new Error(`Fixture validation failed: ${label} must be a number in [${min}, ${max}]`);
    }
}

function validateFixture(raw: unknown, relativePath: string): AccuracyFixture {
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Fixture ${relativePath}: not an object`);
    }
    const obj = raw as Record<string, unknown>;

    assertString(obj.id, `${relativePath} id`);
    assertString(obj.case_summary, `${relativePath} case_summary`);
    assertBoolean(obj.verified, `${relativePath} verified`);

    if (obj.ground_truth === null || typeof obj.ground_truth !== 'object') {
        throw new Error(`Fixture ${relativePath}: ground_truth missing or not an object`);
    }
    const gt = obj.ground_truth as Record<string, unknown>;
    assertString(gt.trade, `${relativePath} ground_truth.trade`);
    assertString(gt.subcategory_id, `${relativePath} ground_truth.subcategory_id`);
    if (gt.failure_mode_id !== undefined) {
        assertString(gt.failure_mode_id, `${relativePath} ground_truth.failure_mode_id`);
    }
    assertNumberInRange(gt.confidence_floor, `${relativePath} ground_truth.confidence_floor`, 0, 100);
    assertString(gt.notes, `${relativePath} ground_truth.notes`);

    if (obj.inputs === null || typeof obj.inputs !== 'object') {
        throw new Error(`Fixture ${relativePath}: inputs missing or not an object`);
    }

    // Filename must match id.
    const expectedId = relativePath.split('/').pop()!.replace(/\.json$/, '');
    if (obj.id !== expectedId) {
        throw new Error(
            `Fixture ${relativePath}: id "${String(obj.id)}" must match filename "${expectedId}"`
        );
    }

    return raw as AccuracyFixture;
}

export function loadAllFixtures(): LoadedFixture[] {
    const relativePaths = listJsonFilesRecursive(FIXTURES_ROOT).sort();
    return relativePaths.map((relativePath) => {
        const full = join(FIXTURES_ROOT, relativePath);
        const raw = JSON.parse(readFileSync(full, 'utf-8')) as unknown;
        const fixture = validateFixture(raw, relativePath);
        const folder = relativePath.split('/')[0] ?? '';
        return { relativePath, folder, fixture };
    });
}
