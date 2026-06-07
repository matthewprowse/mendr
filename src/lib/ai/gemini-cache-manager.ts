/* eslint-disable no-console */
/**
 * Gemini context-cache helper.
 *
 * Wraps the @google/genai `ai.caches.*` API with a tiny in-memory lookup so
 * we don't re-create the same cached system prompt on every diagnosis.
 * Saves ~90% of input-token cost on the cached portion.
 *
 * Use case: the classifier's system prompt (taxonomy block + commit rules +
 * confidence-band copy) is identical across every diagnosis for a given
 * service catalog — ~10–13K tokens of pure boilerplate. With caching, we
 * pay the cached-input rate instead of the full input rate for that portion.
 *
 * Lifecycle:
 *   1. First call for a given system-prompt hash → create cache + remember it
 *   2. Subsequent calls → look up by hash, reuse the cache name
 *   3. After TTL expires (default 1 hour) → next call falls through to (1)
 *   4. On any error → caller catches and falls back to the non-cached path
 */

import { createHash } from 'node:crypto';
import { getGenAiClient } from '@/lib/ai/ai-client';

interface CacheEntry {
    /** Full cache name Gemini gives us when the cache is created. */
    readonly cachedContentName: string;
    /** Epoch-ms when this entry should be considered stale. */
    readonly expiresAtMs: number;
}

// In-memory map. Process-local — each Vercel function invocation starts fresh.
const CACHE_LOOKUP = new Map<string, CacheEntry>();

function hashKey(model: string, systemInstruction: string): string {
    return createHash('sha256')
        .update(model)
        .update('\n')
        .update(systemInstruction)
        .digest('hex')
        .slice(0, 16);
}

/**
 * Get a cache name for this (model, systemInstruction) pair, creating one if
 * we don't have a valid one in memory. Returns null if Gemini rejects the
 * creation (e.g., minimum-size violation, API error) — caller falls back.
 *
 * `model` must be in the `models/<id>` form expected by the cache API.
 * Returns the cache name string (to pass as `config.cachedContent`).
 */
export async function getOrCreateCachedSystemPrompt(opts: {
    model: `models/${string}`;
    systemInstruction: string;
    ttlSeconds?: number;
    /** Safety margin: refresh the cache if less than this many seconds remain. */
    refreshIfRemainingLessThan?: number;
}): Promise<string | null> {
    const ttlSeconds = opts.ttlSeconds ?? 3600;
    const refreshIfRemainingLessThan = opts.refreshIfRemainingLessThan ?? 60;
    const key = hashKey(opts.model, opts.systemInstruction);
    const now = Date.now();

    const existing = CACHE_LOOKUP.get(key);
    if (existing && existing.expiresAtMs - now > refreshIfRemainingLessThan * 1000) {
        return existing.cachedContentName;
    }

    try {
        const ai = getGenAiClient();
        const cached = await ai.caches.create({
            model: opts.model,
            config: {
                systemInstruction: opts.systemInstruction,
                ttl: `${ttlSeconds}s`,
            },
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
        return cached.name;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
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
