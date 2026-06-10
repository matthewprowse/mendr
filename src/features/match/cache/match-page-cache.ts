import type { EnrichmentCacheEntry } from '@/features/match/contracts';
import type { MatchLocation, MatchProvider } from '../contracts';

const CACHE_KEY_PREFIX = 'match-page-cache:';
const CACHE_TTL_MS = 30 * 60 * 1000;

export type MatchPageCacheEntry = {
    providers: MatchProvider[];
    companyIndex: number;
    diagnosisVersion?: string;
    /** Search radius in metres (25_000 default, 50_000 after user extends). */
    searchRadiusMeters?: number;
    userLocation: MatchLocation | null;
    addressInput: string;
    enrichmentCache: Record<string, EnrichmentCacheEntry>;
    mendrReviewCountByProviderId: Record<string, number>;
    savedAt: number;
};

const memoryCache = new Map<string, MatchPageCacheEntry>();

function storageKey(conversationId: string): string {
    return `${CACHE_KEY_PREFIX}${conversationId}`;
}

export function loadMatchPageCache(conversationId: string): MatchPageCacheEntry | null {
    if (!conversationId) return null;
    const now = Date.now();

    const fromMemory = memoryCache.get(conversationId);
    if (fromMemory && now - fromMemory.savedAt <= CACHE_TTL_MS) {
        return fromMemory;
    }
    if (fromMemory) {
        memoryCache.delete(conversationId);
    }

    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(storageKey(conversationId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as MatchPageCacheEntry;
        if (!parsed || now - parsed.savedAt > CACHE_TTL_MS) {
            window.sessionStorage.removeItem(storageKey(conversationId));
            return null;
        }
        memoryCache.set(conversationId, parsed);
        return parsed;
    } catch {
        return null;
    }
}

export function saveMatchPageCache(conversationId: string, entry: MatchPageCacheEntry): void {
    if (!conversationId) return;
    memoryCache.set(conversationId, entry);
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(storageKey(conversationId), JSON.stringify(entry));
    } catch {
        // ignore storage write failures
    }
}
