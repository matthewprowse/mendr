/**
 * Gemini context-cache helper.
 *
 * Wraps `@google/generative-ai/server`'s `GoogleAICacheManager` with a tiny
 * in-memory lookup so we don't re-create the same cached system prompt on
 * every diagnosis. Saves ~90% of input-token cost on the cached portion.
 *
 * Use case: the classifier's system prompt (taxonomy block + commit rules +
 * confidence-band copy) is identical across every diagnosis for a given
 * service catalog — ~10–13K tokens of pure boilerplate. With caching, we
 * pay the cached-input rate ($0.15/1M for Gemini 3.5 Flash) instead of the
 * full input rate ($1.50/1M) for that portion. The user-specific images +
 * conversation text + task hint are NOT cached and are still billed at the
 * regular rate.
 *
 * Lifecycle:
 *   1. First call for a given system-prompt hash → create cache + remember it
 *   2. Subsequent calls → look up by hash, reuse the cache
 *   3. After TTL expires (default 1 hour) → next call falls through to (1)
 *      and creates a fresh cache
 *   4. On any error (minimum-cache-size violation, API quota, etc.) → caller
 *      catches and falls back to the non-cached call path
 *
 * IMPORTANT: Gemini enforces a minimum number of tokens that must be cached
 * (varies by model — older docs say 32k for 1.5 Pro/Flash; the 3.x line
 * may have a lower minimum). If `create()` throws because the prompt is
 * too small, the caller should NOT retry — just fall back. This module
 * makes that easy by returning `null` from `getOrCreate()` on failure.
 *
 * NOT a general-purpose cache. Scoped to the agent-classify call site.
 * The prose agent's system prompt is dynamic (it injects the classification
 * result) so it cannot use this helper without a refactor.
 */

import { createHash } from 'node:crypto';
import {
    GoogleAICacheManager,
    type CachedContent,
} from '@google/generative-ai/server';

interface CacheEntry {
    /** Full path Gemini gives us when the cache is created (`cachedContents/abc123`). */
    readonly cachedContentName: string;
    /** Epoch-ms when this entry should be considered stale. */
    readonly expiresAtMs: number;
    /** Resolved CachedContent object (so we can pass it to getGenerativeModelFromCachedContent). */
    readonly cachedContent: CachedContent;
}

// In-memory map. Process-local — each Vercel function invocation starts fresh.
// In dev, this persists for the lifetime of the dev server, which is exactly
// what we want for the eval matrix.
const CACHE_LOOKUP = new Map<string, CacheEntry>();

let cacheManager: GoogleAICacheManager | null = null;
function getCacheManager(apiKey: string): GoogleAICacheManager {
    if (!cacheManager) {
        cacheManager = new GoogleAICacheManager(apiKey);
    }
    return cacheManager;
}

function hashKey(model: string, systemInstruction: string): string {
    return createHash('sha256')
        .update(model)
        .update('\n')
        .update(systemInstruction)
        .digest('hex')
        .slice(0, 16);
}

/**
 * Get a CachedContent for this (model, systemInstruction) pair, creating
 * one if we don't have a valid one in memory. Returns null if Gemini rejects
 * the creation (e.g., minimum-size violation, API error) — caller falls back.
 *
 * `model` must be in the `models/<id>` form expected by the cache API.
 */
export async function getOrCreateCachedSystemPrompt(opts: {
    apiKey: string;
    model: `models/${string}`;
    systemInstruction: string;
    ttlSeconds?: number;
    /** Safety margin: refresh the cache if less than this many seconds remain. */
    refreshIfRemainingLessThan?: number;
}): Promise<CachedContent | null> {
    const ttlSeconds = opts.ttlSeconds ?? 3600;
    const refreshIfRemainingLessThan = opts.refreshIfRemainingLessThan ?? 60;
    const key = hashKey(opts.model, opts.systemInstruction);
    const now = Date.now();

    const existing = CACHE_LOOKUP.get(key);
    if (existing && existing.expiresAtMs - now > refreshIfRemainingLessThan * 1000) {
        return existing.cachedContent;
    }

    try {
        const manager = getCacheManager(opts.apiKey);
        const cached = await manager.create({
            model: opts.model,
            systemInstruction: {
                role: 'system',
                parts: [{ text: opts.systemInstruction }],
            },
            // Empty contents array — we're caching ONLY the system prompt.
            // Per-call contents (the user's images + text) are passed at
            // generation time.
            contents: [],
            ttlSeconds,
        });
        if (!cached.name) {
            console.warn(
                JSON.stringify({
                    type: 'gemini_cache.create_returned_no_name',
                    model: opts.model,
                }),
            );
            return null;
        }
        CACHE_LOOKUP.set(key, {
            cachedContentName: cached.name,
            expiresAtMs: now + ttlSeconds * 1000,
            cachedContent: cached,
        });
        console.warn(
            JSON.stringify({
                type: 'gemini_cache.created',
                model: opts.model,
                name: cached.name,
                ttlSeconds,
                systemInstructionChars: opts.systemInstruction.length,
            }),
        );
        return cached;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Most common failures we expect:
        //   - "input must be at least N tokens" → our prompt is smaller than the
        //     model's minimum cacheable size; nothing we can do here
        //   - "RESOURCE_EXHAUSTED" or quota errors → degrade gracefully
        //   - Network errors → degrade gracefully
        // Don't kill the diagnosis path; let the caller fall through to the
        // non-cached call.
        console.warn(
            JSON.stringify({
                type: 'gemini_cache.create_failed',
                model: opts.model,
                reason: message.slice(0, 300),
                systemInstructionChars: opts.systemInstruction.length,
            }),
        );
        return null;
    }
}

/**
 * Drop the in-memory cache lookup. Used by tests and on system-prompt-version
 * bumps where we want the next call to recreate cleanly.
 */
export function clearCachedSystemPromptLookup(): void {
    CACHE_LOOKUP.clear();
}

/** Inspection helper — returns the current set of cache entries for diagnostics. */
export function listCachedSystemPrompts(): Array<{
    keyHash: string;
    name: string;
    expiresAtIso: string;
}> {
    return Array.from(CACHE_LOOKUP.entries()).map(([key, entry]) => ({
        keyHash: key,
        name: entry.cachedContentName,
        expiresAtIso: new Date(entry.expiresAtMs).toISOString(),
    }));
}
