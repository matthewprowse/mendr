/**
 * POST /api/beta-access
 *
 * Validates an early-access code (or the master COMING_SOON_PASSWORD) and sets a
 * `beta_access` cookie on success. Used by the /launch page to unlock the
 * rest of the app.
 *
 * Body: { password: string }   (the field is named `password` for historical
 *                                reasons — it now carries a per-person code)
 * On success: sets cookie + returns { ok: true }
 * On failure: returns 401 { error: 'Wrong password' }
 *
 * Individual codes live in public.beta_access_codes. Each successful redemption
 * is logged to public.beta_access_redemptions (ip + user agent + session) so the
 * admin can spot a single code being shared across many devices. The atomic
 * redeem happens in the redeem_beta_access_code() SQL function.
 *
 * The master COMING_SOON_PASSWORD env var still works as an owner override and
 * keeps the gate disable-able (unset = open to everyone).
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit, getCallerIp } from '@/lib/rate-limit-config';

const COOKIE_NAME  = 'beta_access';
const COOKIE_VALUE = 'granted';
/** Cookie lives for 30 days — long enough not to annoy testers. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Stable per-browser id. Lets the admin tell "one person re-entering their code"
 * apart from "a shared code being redeemed in several browsers" (the strongest
 * sharing signal — stronger than IP, which shifts on mobile networks). Set the
 * first time a device hits the gate and reused on every later visit.
 */
const DEVICE_COOKIE_NAME  = 'mendr_did';
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function grant(deviceId: string, isNewDevice: boolean): NextResponse {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, COOKIE_VALUE, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
        secure: process.env.NODE_ENV === 'production',
    });
    if (isNewDevice) {
        res.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: DEVICE_COOKIE_MAX_AGE,
            secure: process.env.NODE_ENV === 'production',
        });
    }
    return res;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    // Throttle attempts so individual codes can't be brute-forced.
    const limited = await checkRateLimit(req, 'betaAccess');
    if (limited) return limited;

    let submitted: string;
    try {
        const body = await req.json();
        submitted = typeof body?.password === 'string' ? body.password.trim() : '';
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const master = process.env.COMING_SOON_PASSWORD;

    // Reuse the browser's device id, or mint one to set on the way out.
    const existingDevice = req.cookies.get(DEVICE_COOKIE_NAME)?.value ?? null;
    const deviceId = existingDevice ?? randomUUID();
    const isNewDevice = !existingDevice;

    // Gate disabled — no master password and no way to issue codes safely; let
    // everyone through (matches previous behaviour + the proxy check).
    if (!master) {
        return grant(deviceId, isNewDevice);
    }

    if (!submitted) {
        return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
    }

    // Owner override.
    if (submitted === master) {
        return grant(deviceId, isNewDevice);
    }

    // Individual access code — validate + log redemption atomically.
    try {
        const admin = await createSupabaseAdminClient();
        const { data, error } = await admin.rpc('redeem_beta_access_code', {
            p_code:       submitted,
            p_ip:         getCallerIp(req),
            p_user_agent: req.headers.get('user-agent'),
            p_session_id: deviceId,
        });

        if (error) {
            return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
        }
        if (!data) {
            return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
        }
    } catch {
        return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    }

    return grant(deviceId, isNewDevice);
}
