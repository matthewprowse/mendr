/**
 * Utility functions for sending React Email components via Resend.
 *
 * Usage:
 *   import { sendMendrEmail, generateUnsubscribeUrl } from '@/lib/email';
 */

import React from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import { createHmac } from 'crypto';
import { getSiteUrl } from '@/lib/site-url';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MendrEmailPayload {
    to: { email: string; name?: string };
    subject: string;
    /** Rendered React Email component — use MendrEmailLayout as the root. */
    component: React.ReactElement;
    /** Plain-text fallback — always required for deliverability. */
    text: string;
    /** Reply-to address override. Defaults to RESEND_FROM. */
    replyTo?: string;
    /** Resend tag slugs for analytics (max 10, letters/numbers/hyphens only). */
    tags?: string[];
}

export type SendEmailResult =
    | { ok: true }
    | { ok: false; error: string };

// ── sendMendrEmail ────────────────────────────────────────────────────────────

/**
 * Renders a React Email component to HTML and sends it via Resend.
 *
 * Returns `{ ok: false, error: 'Resend not configured' }` when env vars are
 * absent (safe to call in dev without real credentials).
 */
export async function sendMendrEmail(
    payload: MendrEmailPayload,
): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from   = process.env.RESEND_FROM;

    if (!apiKey || !from) {
        return { ok: false, error: 'Resend not configured' };
    }

    const replyTo = payload.replyTo ?? process.env.RESEND_REPLY_TO ?? undefined;

    const toField = payload.to.name
        ? `${payload.to.name} <${payload.to.email}>`
        : payload.to.email;

    let html: string;
    try {
        html = await render(payload.component);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Email render failed: ${message}` };
    }

    const resend = new Resend(apiKey);

    try {
        const { error } = await resend.emails.send({
            from,
            to:      toField,
            replyTo,
            subject: payload.subject,
            text:    payload.text,
            html,
            headers: {
                'List-Unsubscribe': `<mailto:${replyTo ?? from}?subject=unsubscribe>`,
                'X-Mailer':         'Mendr',
            },
            ...(payload.tags?.length
                ? {
                      tags: payload.tags.map((name) => ({ name, value: 'true' })),
                  }
                : {}),
        });

        if (error) {
            return { ok: false, error: error.message };
        }
        return { ok: true };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
    }
}

// ── Unsubscribe token helpers ─────────────────────────────────────────────────

/**
 * Creates an HMAC-SHA256 signed unsubscribe token.
 *
 * Format: `<base64url(email:timestamp)>.<hex-signature>`
 *
 * The token encodes the recipient email and a timestamp so the API route can
 * validate it without a DB lookup.
 */
export function generateUnsubscribeToken(email: string, secret: string): string {
    const timestamp = Date.now().toString();
    const payload   = Buffer.from(`${email}:${timestamp}`).toString('base64url');
    const sig       = createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
}

/**
 * Builds the full unsubscribe URL for a given email address.
 *
 * Uses `CRON_SECRET` as the signing key (already an env var used for cron
 * auth; no additional secret needed for phase 0).
 *
 * Returns the URL regardless — callers should treat a missing CRON_SECRET as
 * a misconfiguration and log accordingly.
 */
export function generateUnsubscribeUrl(email: string): string {
    const secret  = process.env.CRON_SECRET ?? '';
    const token   = generateUnsubscribeToken(email, secret);
    const siteUrl = getSiteUrl();
    return `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}
