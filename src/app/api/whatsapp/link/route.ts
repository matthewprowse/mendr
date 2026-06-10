/* eslint-disable no-console */
/**
 * Magic-link consumption (Phase C, Workstream 4).
 *
 * GET /api/whatsapp/link?token=…
 *   - signed in  → links the token's phone to the user, redirects home with a
 *     status flag the UI can toast on.
 *   - signed out → redirects to /register carrying `next` so the user lands
 *     back here after signup and the link completes automatically.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { consumeMagicLink } from '@/lib/whatsapp/linking';
import { sendOutbound } from '@/lib/whatsapp/outbox';
import { getSiteUrl } from '@/lib/site-url';

export async function GET(req: NextRequest) {
    const limited = await checkRateLimit(req, 'whatsappLink');
    if (limited) return limited;

    const token = req.nextUrl.searchParams.get('token') ?? '';
    const site = getSiteUrl();
    if (!token) return NextResponse.redirect(`${site}/?whatsapp_link=invalid`);

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        const next = encodeURIComponent(`/api/whatsapp/link?token=${token}`);
        return NextResponse.redirect(`${site}/register?next=${next}`);
    }

    const result = await consumeMagicLink(token, user.id);
    if (!result.ok) {
        return NextResponse.redirect(`${site}/?whatsapp_link=${result.reason}`);
    }

    // Close the loop in the chat so the user knows it worked without
    // switching back to the browser.
    void sendOutbound({
        to: result.phone,
        kind: 'reply',
        text: 'Your WhatsApp is now linked to your Mendr account. Send a photo of the problem and I will take a look.',
    });

    return NextResponse.redirect(`${site}/?whatsapp_link=success`);
}
