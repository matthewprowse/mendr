/**
 * Realtime contractor lead-alert helper.
 *
 * Called fire-and-forget from `/api/contact/contractor` immediately after a
 * homeowner contacts a provider. Sends a transactional email to the contractor
 * with the diagnosis summary, suburb, and an optional wa.me deeplink so they
 * can reply directly on WhatsApp.
 *
 * This is the realtime counterpart to the monthly `/api/cron/lead-digest`
 * retrospective summary — both coexist.
 */

import { createHmac } from 'crypto';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { contractorLeadAlertEmail, sendScandioEmail } from '@/lib/resend-mail';
import { getSiteUrl } from '@/lib/site-url';

export type NotifyResult = { ok: boolean; reason?: string };

interface ProviderRow {
    id: string;
    name: string | null;
    email: string | null;
    notify_realtime?: boolean | null;
    is_active?: boolean | null;
}

interface DiagnosisRow {
    user_id: string | null;
    customer_address: string | null;
    diagnosis: Record<string, unknown> | null;
}

function extractSuburb(customerAddress: string | null): string | null {
    if (!customerAddress) return null;
    // Common SA address shape: "12 Main Rd, Sea Point, Cape Town, 8005".
    // Pick the second comma-delimited component if available, else fall back.
    const parts = customerAddress
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    return parts[1] ?? parts[0];
}

function pickSeverity(value: unknown): 'low' | 'medium' | 'high' | null {
    if (typeof value !== 'string') return null;
    const v = value.toLowerCase().trim();
    if (v === 'low' || v === 'medium' || v === 'high') return v;
    return null;
}

function normalizeWhatsappNumber(raw: string): string | null {
    const digits = raw.replace(/\D+/g, '');
    if (!digits) return null;
    // South Africa: convert 0XXXXXXXXX → 27XXXXXXXXX.
    if (digits.startsWith('27')) return digits;
    if (digits.startsWith('0')) return `27${digits.slice(1)}`;
    // Already an international number without a leading +: trust as-is.
    return digits;
}

function buildWhatsappDeeplink(
    homeownerWhatsapp: string | null,
    contractorName: string,
): string | null {
    if (!homeownerWhatsapp) return null;
    const normalized = normalizeWhatsappNumber(homeownerWhatsapp);
    if (!normalized) return null;
    const text = `Hi, this is ${contractorName} replying to your Mendr enquiry.`;
    return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

function buildUnsubscribeToken(email: string, secret: string): string {
    const ts = Date.now().toString();
    const payload = `${email}:${ts}`;
    const payloadB64 = Buffer.from(payload).toString('base64url');
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payloadB64}.${sig}`;
}

export async function notifyContractorOfLead(input: {
    contractorId: string;
    diagnosisId: string;
    homeownerWhatsapp: string | null;
}): Promise<NotifyResult> {
    const { contractorId, diagnosisId, homeownerWhatsapp } = input;

    let admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>;
    try {
        admin = await createSupabaseAdminClient();
    } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : 'admin_client_failed' };
    }

    // 1. Load provider (must be active).
    const { data: providerRaw, error: providerErr } = await admin
        .from('providers')
        .select('id, name, email, notify_realtime, is_active')
        .eq('id', contractorId)
        .maybeSingle();

    if (providerErr) {
        return { ok: false, reason: providerErr.message };
    }
    const provider = providerRaw as ProviderRow | null;
    if (!provider) {
        return { ok: false, reason: 'not_found' };
    }
    if (provider.is_active === false) {
        return { ok: false, reason: 'inactive' };
    }
    if (!provider.email) {
        return { ok: false, reason: 'no_email' };
    }

    // 5. Opt-out — default to true when column is absent/null.
    if (provider.notify_realtime === false) {
        return { ok: false, reason: 'opted_out' };
    }

    const email = provider.email.toLowerCase();
    const contractorName = provider.name?.trim() || 'there';

    // 4. Suppression list.
    const { data: suppression } = await admin
        .from('email_suppressions')
        .select('email')
        .eq('email', email)
        .maybeSingle();
    if (suppression) {
        return { ok: false, reason: 'suppressed' };
    }

    // 2. Load diagnosis.
    const { data: diagnosisRaw, error: diagnosisErr } = await admin
        .from('diagnoses')
        .select('user_id, customer_address, diagnosis')
        .eq('id', diagnosisId)
        .maybeSingle();

    if (diagnosisErr) {
        return { ok: false, reason: diagnosisErr.message };
    }
    const diagnosis = diagnosisRaw as DiagnosisRow | null;
    if (!diagnosis) {
        return { ok: false, reason: 'diagnosis_not_found' };
    }

    const diagBlob = (diagnosis.diagnosis ?? {}) as Record<string, unknown>;
    const titleCandidate =
        (typeof diagBlob.title === 'string' && diagBlob.title.trim()) ||
        (typeof diagBlob.diagnosis === 'string' && diagBlob.diagnosis.trim()) ||
        (typeof diagBlob.trade_detail === 'string' && diagBlob.trade_detail.trim()) ||
        '';
    const diagnosisTitle = titleCandidate || 'Home fault diagnosis';
    const trade = typeof diagBlob.trade === 'string' && diagBlob.trade.trim()
        ? diagBlob.trade.trim()
        : 'General Handyman';
    const severity = pickSeverity(diagBlob.severity);
    const suburb = extractSuburb(diagnosis.customer_address);

    // 3. Homeowner first name (best effort).
    let homeownerFirstName: string | null = null;
    if (diagnosis.user_id) {
        const { data: profile } = await admin
            .from('profiles')
            .select('first_name')
            .eq('id', diagnosis.user_id)
            .maybeSingle();
        const fn = (profile as { first_name?: string | null } | null)?.first_name;
        if (typeof fn === 'string' && fn.trim()) {
            homeownerFirstName = fn.trim();
        }
    }

    // 6. Unsubscribe URL — same HMAC pattern as the monthly digest.
    const siteUrl = getSiteUrl();
    const cronSecret = process.env.CRON_SECRET ?? '';
    const unsubscribeToken = buildUnsubscribeToken(provider.email, cronSecret);
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

    // 7. WhatsApp deeplink.
    const whatsappDeeplink = buildWhatsappDeeplink(homeownerWhatsapp, contractorName);

    // 8. Report URL.
    const reportUrl = `${siteUrl}/report/${diagnosisId}`;

    // 9. Send.
    const { text, html } = contractorLeadAlertEmail({
        contractorName,
        homeownerFirstName,
        suburb,
        diagnosisTitle,
        trade,
        severity,
        reportUrl,
        whatsappDeeplink,
        unsubscribeUrl,
    });

    const subject = `New Mendr lead — ${trade} in ${suburb ?? 'the Western Cape'}`;

    const result = await sendScandioEmail({
        to: { email: provider.email, name: contractorName },
        subject,
        text,
        html,
    });

    if (!result.ok) {
        return { ok: false, reason: result.error };
    }
    return { ok: true };
}
