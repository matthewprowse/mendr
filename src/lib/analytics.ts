 
/**
 * Client-side analytics helper.
 *
 * Fires non-blocking background events to /api/events.
 * Never throws, never delays the calling code.
 */

import { createClientId } from '@/lib/client-random-id';

const SESSION_KEY = 'mendr_session_id';
const DEV_ANALYTICS_FLAG = 'NEXT_PUBLIC_ENABLE_DEV_ANALYTICS';
const DEDUPE_WINDOW_MS = 1500;
const eventLastSentAt = new Map<string, number>();

export function getSessionId(): string {
    if (typeof window === 'undefined') return 'ssr';
    try {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = createClientId();
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    } catch {
        return 'unknown';
    }
}

type EventType =
    | 'welcome_start'
    | 'diagnosis_complete'
    | 'processing_started'
    | 'processing_completed'
    | 'processing_failed'
    | 'match_view'
    | 'match_extend_radius'
    | 'match_filter_open'
    | 'match_filter_close'
    | 'match_filter_apply'
    | 'match_filter_clear'
    | 'match_marker_tap'
    | 'match_card_image_swipe'
    | 'match_sheet_snap'
    | 'provider_contact'
    | 'provider_profile_view'
    | 'prefetch_attempted'
    | 'prefetch_skipped'
    | 'prefetch_succeeded'
    | 'prefetch_discarded'
    | 'prefetch_cache_hit'
    | 'prefetch_cache_miss'
    | 'contractor_view'
    | 'contractor_image_swipe'
    | 'contractor_section_expand'
    | 'contractor_contact_click'
    | 'enrichment_leak_detected';

/**
 * Extra metadata accepted alongside an analytics event. Kept loose because the analytics endpoint
 * accepts arbitrary JSON; the explicit fields below document the most common keys used today.
 */
export type TrackEventExtra = {
    provider_id?: string;
    diagnosis_id?: string;
    radius_km?: number;
    reason?: string;
    place_id?: string;
    active_filter_count?: number;
    sort?: string;
    to_index?: number;
    from?: string;
    to?: string;
    profile_completeness?: number;
    section?: 'about' | 'reviews' | 'hours' | 'gallery' | 'highlights';
    channel?: 'phone' | 'whatsapp' | 'email' | 'website';
    field?: string;
    index?: number;
    [key: string]: string | number | boolean | undefined;
};

export function trackEvent(event_type: EventType | string, extra?: TrackEventExtra): void {
    // In local dev, analytics calls are commonly blocked by ad/tracker extensions and
    // can flood the console. Keep analytics off by default in dev unless explicitly enabled.
    if (
        process.env.NODE_ENV !== 'production' &&
        process.env[DEV_ANALYTICS_FLAG] !== '1'
    ) {
        return;
    }

    const session_id = getSessionId();
    const payload = { event_type, session_id, ...extra };
    const dedupeKey = JSON.stringify(payload);
    const now = Date.now();
    const last = eventLastSentAt.get(dedupeKey) ?? 0;
    if (now - last < DEDUPE_WINDOW_MS) return;
    eventLastSentAt.set(dedupeKey, now);

    // Fire and forget.
    const preferKeepaliveFetch = event_type === 'diagnosis_complete' || event_type === 'provider_contact';

    // Always try sendBeacon first (best for navigation/unload).
    // For funnel events, we also send a keepalive fetch afterwards to avoid drops.
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const queued = navigator.sendBeacon('/api/events', blob);
            if (queued && !preferKeepaliveFetch) return;
        }
    } catch {
        // Fall back to fetch below.
    }

    // Keepalive fetch fallback (and additional attempt for funnel events).
    try {
        void fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
            credentials: 'same-origin',
        });
    } catch {
        // Analytics must never throw.
    }
}
