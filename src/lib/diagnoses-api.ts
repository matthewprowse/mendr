/**
 * Browser calls for conversation rows. Uses `/api/diagnoses/[id]` (service role)
 * so guest diagnoses persist even when RLS only allows `user_id = auth.uid()`.
 *
 * GET uses single-flight + short TTL session cache to avoid duplicate identical requests
 * from ensureLocation + resolveTradeContext on the match page.
 */

export type ConversationDiagnosisRow = {
    id: string;
    image_url: string | null;
    diagnosis: unknown | null;
    initial_image_description: string | null;
    customer_lat?: number | null;
    customer_lng?: number | null;
    customer_address?: string | null;
};

export type ConversationPatchBody = {
    title?: string | null;
    image_url?: string | null;
    diagnosis?: unknown | null;
    urgency_key?: string | null;
    initial_image_description?: string | null;
    customer_address?: string | null;
    device?: string | null;
    user_agent?: string | null;
    user_id?: string | null;
};

export type ConversationDiagnosisResult =
    | { ok: true; data: ConversationDiagnosisRow | null }
    | { ok: false; status: number; error: string };

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
    result: ConversationDiagnosisResult;
    expiresAt: number;
};

const conversationGetCache = new Map<string, CacheEntry>();
const conversationGetInflight = new Map<string, Promise<ConversationDiagnosisResult>>();

function cacheKey(id: string): string {
    return id;
}

/** Drop cached GET so the next fetch hits the server (e.g. after PATCH). */
export function invalidateConversationDiagnosisCache(conversationId: string): void {
    conversationGetCache.delete(cacheKey(conversationId));
    conversationGetInflight.delete(cacheKey(conversationId));
}

/** Synchronous read of a still-valid cached row (for skipping redundant work). */
export function peekCachedConversationDiagnosis(
    conversationId: string
): ConversationDiagnosisRow | null | undefined {
    const k = cacheKey(conversationId);
    const hit = conversationGetCache.get(k);
    if (!hit || Date.now() >= hit.expiresAt) {
        if (hit) conversationGetCache.delete(k);
        return undefined;
    }
    if (!hit.result.ok) return undefined;
    return hit.result.data ?? null;
}

async function fetchConversationDiagnosisUncached(
    conversationId: string
): Promise<ConversationDiagnosisResult> {
    try {
        const res = await fetch(`/api/diagnoses/${encodeURIComponent(conversationId)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        const text = await res.text();
        let parsed: { error?: string; data?: ConversationDiagnosisRow | null } = {};
        try {
            parsed = text ? JSON.parse(text) : {};
        } catch {
            return { ok: false, status: res.status, error: text || 'Invalid response' };
        }
        if (!res.ok) {
            return { ok: false, status: res.status, error: String(parsed?.error || res.statusText || 'Request failed') };
        }
        return { ok: true, data: (parsed as { data?: ConversationDiagnosisRow | null }).data ?? null };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Network error';
        return { ok: false, status: 0, error: msg };
    }
}

export async function fetchConversationDiagnosis(
    conversationId: string
): Promise<ConversationDiagnosisResult> {
    const k = cacheKey(conversationId);

    const cached = conversationGetCache.get(k);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.result;
    }
    if (cached) conversationGetCache.delete(k);

    const inflight = conversationGetInflight.get(k);
    if (inflight) return inflight;

    const promise = (async () => {
        const result = await fetchConversationDiagnosisUncached(conversationId);
        // Only cache successful HTTP responses (incl. 200 with null data). Do not cache pure network errors long-term.
        if (result.ok || (result.ok === false && result.status !== 0)) {
            conversationGetCache.set(k, {
                result,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });
        }
        return result;
    })();

    conversationGetInflight.set(k, promise);
    try {
        return await promise;
    } finally {
        conversationGetInflight.delete(k);
    }
}

export async function patchConversation(
    conversationId: string,
    body: ConversationPatchBody
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    try {
        const res = await fetch(`/api/diagnoses/${encodeURIComponent(conversationId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        let parsed: { error?: string } = {};
        try {
            parsed = text ? JSON.parse(text) : {};
        } catch {
            return { ok: false, status: res.status, error: text || 'Invalid response' };
        }
        if (!res.ok) {
            return { ok: false, status: res.status, error: String(parsed?.error || res.statusText || 'Request failed') };
        }
        invalidateConversationDiagnosisCache(conversationId);
        return { ok: true };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Network error';
        return { ok: false, status: 0, error: msg };
    }
}
