/* eslint-disable no-console */
/**
 * Phone ↔ account linking (Phase C, Workstream 4).
 *
 * Two directions:
 *   1. WhatsApp-first (primary): an unknown number messages the bot → we mint
 *      a magic-link token bound to that phone. Opening the link while signed
 *      in (or after registering) verifies the phone by possession — they are
 *      messaging from it — and sets profiles.phone + phone_verified_at.
 *   2. Web-first: a signed-in user enters their number → we send a 6-digit
 *      OTP via the `link_account_otp` template → correct code verifies.
 *
 * Tokens are stored hashed (sha256) in `whatsapp_link_tokens`.
 */

import { createHash, randomBytes, randomInt } from 'crypto';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getSiteUrl } from '@/lib/site-url';

const MAGIC_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

function sha256(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Normalise to digits-only E.164 without plus, SA default (27…). */
export function normalisePhone(raw: string): string | null {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return null;
    if (digits.startsWith('27') && digits.length === 11) return digits;
    if (digits.startsWith('0') && digits.length === 10) return `27${digits.slice(1)}`;
    if (digits.length >= 10 && digits.length <= 15) return digits;
    return null;
}

/** Mint a magic link for a WhatsApp-first registration. Returns the URL. */
export async function createMagicLink(phone: string): Promise<string | null> {
    try {
        const token = randomBytes(24).toString('base64url');
        const admin = await createSupabaseAdminClient();
        const { error } = await admin.from('whatsapp_link_tokens').insert({
            token_hash: sha256(token),
            phone_number: phone,
            kind: 'magic_link',
            expires_at: new Date(Date.now() + MAGIC_TOKEN_TTL_MS).toISOString(),
        });
        if (error) {
            console.error('[whatsapp/linking] createMagicLink insert failed', error);
            return null;
        }
        return `${getSiteUrl()}/api/whatsapp/link?token=${token}`;
    } catch (e) {
        console.error('[whatsapp/linking] createMagicLink error', e);
        return null;
    }
}

/**
 * Consume a magic-link token for the signed-in user. Sets profiles.phone +
 * phone_verified_at. Returns the linked phone, or an error reason.
 */
export async function consumeMagicLink(
    token: string,
    userId: string,
): Promise<{ ok: true; phone: string } | { ok: false; reason: string }> {
    try {
        const admin = await createSupabaseAdminClient();
        const { data: row } = await admin
            .from('whatsapp_link_tokens')
            .select('id, phone_number, expires_at, consumed_at')
            .eq('token_hash', sha256(token))
            .eq('kind', 'magic_link')
            .maybeSingle();
        if (!row) return { ok: false, reason: 'invalid' };
        if (row.consumed_at) return { ok: false, reason: 'used' };
        if (new Date(row.expires_at).getTime() < Date.now()) {
            return { ok: false, reason: 'expired' };
        }
        const linked = await linkPhoneToUser(row.phone_number, userId);
        if (!linked.ok) return linked;
        await admin
            .from('whatsapp_link_tokens')
            .update({ consumed_at: new Date().toISOString(), consumed_by: userId })
            .eq('id', row.id);
        return { ok: true, phone: row.phone_number };
    } catch (e) {
        console.error('[whatsapp/linking] consumeMagicLink error', e);
        return { ok: false, reason: 'error' };
    }
}

/** Start a web-first OTP verification. Returns the code to send via template. */
export async function createOtp(
    phone: string,
    userId: string,
): Promise<string | null> {
    try {
        const code = String(randomInt(100000, 1000000));
        const admin = await createSupabaseAdminClient();
        // Invalidate previous pending OTPs for this user.
        await admin
            .from('whatsapp_link_tokens')
            .update({ consumed_at: new Date().toISOString() })
            .eq('kind', 'otp')
            .eq('created_for', userId)
            .is('consumed_at', null);
        const { error } = await admin.from('whatsapp_link_tokens').insert({
            token_hash: sha256(`${phone}:${code}`),
            phone_number: phone,
            kind: 'otp',
            created_for: userId,
            expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        });
        if (error) {
            console.error('[whatsapp/linking] createOtp insert failed', error);
            return null;
        }
        return code;
    } catch (e) {
        console.error('[whatsapp/linking] createOtp error', e);
        return null;
    }
}

/** Verify a web-first OTP and link the phone. */
export async function verifyOtp(
    phone: string,
    code: string,
    userId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
        const admin = await createSupabaseAdminClient();
        const { data: row } = await admin
            .from('whatsapp_link_tokens')
            .select('id, expires_at, consumed_at, attempts')
            .eq('kind', 'otp')
            .eq('created_for', userId)
            .eq('phone_number', phone)
            .is('consumed_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!row) return { ok: false, reason: 'invalid' };
        if (new Date(row.expires_at).getTime() < Date.now()) {
            return { ok: false, reason: 'expired' };
        }
        if ((row.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
            return { ok: false, reason: 'too_many_attempts' };
        }
        const { data: match } = await admin
            .from('whatsapp_link_tokens')
            .select('id')
            .eq('id', row.id)
            .eq('token_hash', sha256(`${phone}:${code}`))
            .maybeSingle();
        if (!match) {
            await admin
                .from('whatsapp_link_tokens')
                .update({ attempts: (row.attempts ?? 0) + 1 })
                .eq('id', row.id);
            return { ok: false, reason: 'wrong_code' };
        }
        const linked = await linkPhoneToUser(phone, userId);
        if (!linked.ok) return linked;
        await admin
            .from('whatsapp_link_tokens')
            .update({ consumed_at: new Date().toISOString(), consumed_by: userId })
            .eq('id', row.id);
        return { ok: true };
    } catch (e) {
        console.error('[whatsapp/linking] verifyOtp error', e);
        return { ok: false, reason: 'error' };
    }
}

/** Set profiles.phone + phone_verified_at, guarding phone uniqueness. */
async function linkPhoneToUser(
    phone: string,
    userId: string,
): Promise<{ ok: true; phone: string } | { ok: false; reason: string }> {
    const admin = await createSupabaseAdminClient();
    // A verified phone may belong to at most one profile.
    const { data: existing } = await admin
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .not('phone_verified_at', 'is', null)
        .neq('id', userId)
        .maybeSingle();
    if (existing) return { ok: false, reason: 'phone_in_use' };
    const { error } = await admin
        .from('profiles')
        .update({ phone, phone_verified_at: new Date().toISOString() })
        .eq('id', userId);
    if (error) {
        console.error('[whatsapp/linking] linkPhoneToUser update failed', error);
        return { ok: false, reason: 'error' };
    }
    return { ok: true, phone };
}

/** Look up the user owning a verified phone. Used by the bot's registration gate. */
export async function findUserByVerifiedPhone(phone: string): Promise<string | null> {
    try {
        const admin = await createSupabaseAdminClient();
        const { data } = await admin
            .from('profiles')
            .select('id')
            .eq('phone', phone)
            .not('phone_verified_at', 'is', null)
            .maybeSingle();
        return data?.id ?? null;
    } catch (e) {
        console.error('[whatsapp/linking] findUserByVerifiedPhone error', e);
        return null;
    }
}
