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

type EventType = 'welcome_start' | 'diagnosis_complete' | 'match_view' | 'provider_contact';

export function trackEvent(
    event_type: EventType,
    extra?: { provider_id?: string; diagnosis_id?: string }
): void {
    const session_id = getSessionId();
    const payload = { event_type, session_id, ...extra };

    // Fire and forget. Prefer sendBeacon for reliability during navigation/app-switch.
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/events', blob);
            return;
        }
    } catch {
        // Fall back to fetch below.
    }

    // Fallback for environments without sendBeacon.
    try {
        void fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        });
    } catch {
        // Analytics must never throw.
    }
}
