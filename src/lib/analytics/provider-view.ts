/**
 * Durable provider profile-view capture (Phase 3 of the analytics rebuild).
 *
 * Replaces the dead `provider_profile_view` analytics event with a durable
 * write to `provider_profile_views`. A profile view is a provider-level metric
 * (feeding the admin Providers view count and the contractor views-vs-leads
 * metric), NOT a funnel stage — a lead can be generated without opening a
 * profile.
 *
 * The client fires at most once per provider per page session (in-memory guard);
 * honest counts use COUNT(DISTINCT session_id) at read time. Fire-and-forget:
 * never blocks or throws into the caller.
 */

import { getSessionId } from '@/lib/analytics';

type ProviderViewSource = 'match' | 'contractor_page';

// Dedupe per provider for this page session so re-renders don't inflate counts.
const firedProviderViews = new Set<string>();

export function trackProviderView(
    providerId: string,
    opts?: { diagnosisId?: string; source?: ProviderViewSource },
): void {
    if (typeof window === 'undefined') return;
    if (!providerId || firedProviderViews.has(providerId)) return;
    firedProviderViews.add(providerId);

    const payload = {
        sessionId: getSessionId(),
        diagnosisId: opts?.diagnosisId,
        source: opts?.source,
    };

    try {
        void fetch(`/api/providers/${encodeURIComponent(providerId)}/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        }).catch(() => {});
    } catch {
        // Telemetry must never throw.
    }
}
