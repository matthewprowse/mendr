/**
 * Client-side analytics helper.
 *
 * Fires non-blocking background events to /api/events.
 * Never throws, never delays the calling code.
 */

import { createClientId } from '@/lib/client-random-id';

const SESSION_KEY = 'scandio_session_id';

function getSessionId(): string {
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
    | 'match_view'
    | 'provider_contact'
    | 'provider_profile_view';

export function trackEvent(
    event_type: EventType,
    extra?: { provider_id?: string; diagnosis_id?: string }
): void {
    const session_id = getSessionId();
    const payload = { event_type, session_id, ...extra };

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
