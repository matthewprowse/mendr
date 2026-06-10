/**
 * Tests for the Gemini context-cache helper.
 *
 * The helper memoises `ai.caches.create()` results in a process-local map keyed
 * by (model, systemInstruction) and reuses them until the TTL nears expiry. The
 * contract that matters for cost + correctness:
 *   - first call creates a cache and returns its name
 *   - a second call within TTL reuses it (no second create)
 *   - a distinct system prompt creates a separate cache
 *   - near-expiry triggers a refresh (new create)
 *   - any failure (no name, thrown error) returns null so the caller falls back
 *
 * `getGenAiClient` is mocked so no real Gemini client is constructed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();
vi.mock('@/lib/ai/ai-client', () => ({
    getGenAiClient: () => ({ caches: { create: createMock } }),
}));

import {
    getOrCreateCachedSystemPrompt,
    clearCachedSystemPromptLookup,
    listCachedSystemPrompts,
} from '../gemini-cache-manager';

const MODEL = 'models/gemini-2.5-flash' as const;

let nowSpy: ReturnType<typeof vi.spyOn>;
let now = 1_000_000;

beforeEach(() => {
    clearCachedSystemPromptLookup();
    createMock.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    now = 1_000_000;
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
    nowSpy.mockRestore();
    vi.restoreAllMocks();
});

describe('getOrCreateCachedSystemPrompt', () => {
    it('creates a cache on first use and returns its name', async () => {
        createMock.mockResolvedValue({ name: 'cachedContents/abc' });
        const name = await getOrCreateCachedSystemPrompt({
            model: MODEL,
            systemInstruction: 'taxonomy block',
        });
        expect(name).toBe('cachedContents/abc');
        expect(createMock).toHaveBeenCalledTimes(1);
        const arg = createMock.mock.calls[0][0];
        expect(arg.model).toBe(MODEL);
        expect(arg.config.systemInstruction).toBe('taxonomy block');
        expect(arg.config.ttl).toBe('3600s');
    });

    it('reuses the cached name on a second call within TTL (no second create)', async () => {
        createMock.mockResolvedValue({ name: 'cachedContents/abc' });
        await getOrCreateCachedSystemPrompt({ model: MODEL, systemInstruction: 'sys' });
        now += 60_000; // 1 minute later, well inside the 1h TTL
        const second = await getOrCreateCachedSystemPrompt({ model: MODEL, systemInstruction: 'sys' });
        expect(second).toBe('cachedContents/abc');
        expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('keys by system instruction — a different prompt creates a separate cache', async () => {
        createMock
            .mockResolvedValueOnce({ name: 'cache-A' })
            .mockResolvedValueOnce({ name: 'cache-B' });
        const a = await getOrCreateCachedSystemPrompt({ model: MODEL, systemInstruction: 'A' });
        const b = await getOrCreateCachedSystemPrompt({ model: MODEL, systemInstruction: 'B' });
        expect(a).toBe('cache-A');
        expect(b).toBe('cache-B');
        expect(createMock).toHaveBeenCalledTimes(2);
        expect(listCachedSystemPrompts()).toHaveLength(2);
    });

    it('refreshes when less than the safety margin remains on the TTL', async () => {
        createMock
            .mockResolvedValueOnce({ name: 'first' })
            .mockResolvedValueOnce({ name: 'second' });
        await getOrCreateCachedSystemPrompt({
            model: MODEL,
            systemInstruction: 'sys',
            ttlSeconds: 100,
            refreshIfRemainingLessThan: 30,
        });
        // Advance to within the 30s refresh window (75s of a 100s TTL elapsed).
        now += 75_000;
        const refreshed = await getOrCreateCachedSystemPrompt({
            model: MODEL,
            systemInstruction: 'sys',
            ttlSeconds: 100,
            refreshIfRemainingLessThan: 30,
        });
        expect(refreshed).toBe('second');
        expect(createMock).toHaveBeenCalledTimes(2);
    });

    it('returns null when the create call yields no name', async () => {
        createMock.mockResolvedValue({ name: undefined });
        const name = await getOrCreateCachedSystemPrompt({ model: MODEL, systemInstruction: 'x' });
        expect(name).toBeNull();
        expect(listCachedSystemPrompts()).toHaveLength(0);
    });

    it('returns null and swallows the error when create throws', async () => {
        createMock.mockRejectedValue(new Error('minimum cache size not met'));
        const name = await getOrCreateCachedSystemPrompt({ model: MODEL, systemInstruction: 'x' });
        expect(name).toBeNull();
        expect(listCachedSystemPrompts()).toHaveLength(0);
    });
});

describe('cache lookup inspection helpers', () => {
    it('clearCachedSystemPromptLookup empties the map', async () => {
        createMock.mockResolvedValue({ name: 'n' });
        await getOrCreateCachedSystemPrompt({ model: MODEL, systemInstruction: 'sys' });
        expect(listCachedSystemPrompts()).toHaveLength(1);
        clearCachedSystemPromptLookup();
        expect(listCachedSystemPrompts()).toHaveLength(0);
    });

    it('listCachedSystemPrompts reports the cache name and an ISO expiry', async () => {
        createMock.mockResolvedValue({ name: 'cachedContents/xyz' });
        await getOrCreateCachedSystemPrompt({ model: MODEL, systemInstruction: 'sys', ttlSeconds: 60 });
        const [entry] = listCachedSystemPrompts();
        expect(entry.name).toBe('cachedContents/xyz');
        expect(entry.keyHash).toMatch(/^[a-f0-9]{16}$/);
        expect(() => new Date(entry.expiresAtIso).toISOString()).not.toThrow();
    });
});
