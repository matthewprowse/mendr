/* eslint-disable no-console */
/**
 * Contractor matching + lead logging reuse layer (part of Phase A4).
 *
 * Matching reuses the existing `POST /api/providers` handler logic via an
 * internal server-side fetch with the chosen address coordinates. Lead logging
 * reuses `POST /api/contact/contractor`, which writes `provider_contact_events`
 * AND fires the Phase B `notifyContractorOfLead` notification itself — so we do
 * NOT re-implement notification here.
 */

import { getAppOrigin } from '@/lib/site-url';
import type { ProvidersResponseBody, ProviderItem } from '@/lib/providers/contracts';
import type { PendingContractor } from './types';

/**
 * Resolve the base origin for internal API calls. Prefers the request origin
 * (passed by the caller) so it works in the simulator's dev server, falling
 * back to the configured app origin.
 */
function resolveOrigin(requestOrigin?: string | null): string {
    if (requestOrigin && /^https?:\/\//.test(requestOrigin)) return requestOrigin;
    return getAppOrigin();
}

export interface MatchContractorsInput {
    lat: number;
    lng: number;
    trade: string;
    tradeDetail?: string;
    radius?: number;
    /** Request origin for the internal fetch (e.g. from the incoming request URL). */
    requestOrigin?: string | null;
}

/**
 * Match contractors near the chosen coordinates. Returns the ranked list mapped
 * into `PendingContractor` rows (with `providerId` set only for registered
 * providers — the ones that produce a sellable, attributable lead).
 */
export async function matchContractors(
    input: MatchContractorsInput,
): Promise<PendingContractor[]> {
    const origin = resolveOrigin(input.requestOrigin);
    try {
        const res = await fetch(`${origin}/api/providers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat: input.lat,
                lng: input.lng,
                trade: input.trade,
                tradeDetail: input.tradeDetail,
                radius: input.radius ?? 15000,
                // NOTE: do NOT send quick:true. Quick mode skips the full
                // recommendation path (soft rotation token bucket, Mendr review
                // counts) AND omits the internal providerId — which both breaks
                // the app's recommendation ordering and makes leads
                // unattributable. Use the same full ranking as the web match page.
            }),
        });
        if (!res.ok) {
            console.error('[whatsapp/contractor] providers fetch failed:', res.status);
            return [];
        }
        const body = (await res.json()) as ProvidersResponseBody;
        const providers = Array.isArray(body.providers) ? body.providers : [];
        return providers.map((p: ProviderItem, i: number) => ({
            index: i + 1,
            providerId: typeof p.providerId === 'string' ? p.providerId : null,
            name: p.name,
            address: p.address || null,
            phone: p.phone ?? null,
            // Google Places results carry no email; only website + phone.
            email: null,
            website: p.website ?? null,
        }));
    } catch (e) {
        console.error('[whatsapp/contractor] matchContractors error:', e);
        return [];
    }
}

export interface LogLeadInput {
    providerId: string;
    diagnosisId: string;
    homeownerWhatsapp: string | null;
    requestOrigin?: string | null;
}

/**
 * Record a lead by POSTing to `/api/contact/contractor`, which performs the
 * dedupe + `provider_contact_events` write AND fires the contractor
 * notification (Phase B). Returns true when the call succeeded.
 */
export async function logContractorLead(input: LogLeadInput): Promise<boolean> {
    const origin = resolveOrigin(input.requestOrigin);
    try {
        const res = await fetch(`${origin}/api/contact/contractor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                providerId: input.providerId,
                diagnosisId: input.diagnosisId,
                homeownerWhatsapp: input.homeownerWhatsapp,
                channel: 'whatsapp',
            }),
        });
        if (!res.ok) {
            console.error('[whatsapp/contractor] lead log failed:', res.status);
            return false;
        }
        return true;
    } catch (e) {
        console.error('[whatsapp/contractor] logContractorLead error:', e);
        return false;
    }
}
