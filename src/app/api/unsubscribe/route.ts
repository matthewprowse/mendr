import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getSiteUrl } from '@/lib/site-url';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function verifyUnsubscribeToken(token: string, secret: string): string | null {
    try {
        const lastDot = token.lastIndexOf('.');
        if (lastDot === -1) return null;

        const payloadB64 = token.slice(0, lastDot);
        const sigProvided = token.slice(lastDot + 1);

        const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
        const sigExpected = createHmac('sha256', secret).update(payload).digest('base64url');

        // Constant-time comparison
        const a = Buffer.from(sigProvided, 'base64url');
        const b = Buffer.from(sigExpected, 'base64url');
        if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

        // payload is "email:timestamp"
        const colonIdx = payload.lastIndexOf(':');
        if (colonIdx === -1) return null;

        const email = payload.slice(0, colonIdx);
        const ts = parseInt(payload.slice(colonIdx + 1), 10);
        if (!email || !Number.isFinite(ts)) return null;

        if (Date.now() - ts > THIRTY_DAYS_MS) return null;

        return email;
    } catch {
        return null;
    }
}

function htmlResponse(heading: string, message: string, siteUrl: string): Response {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${heading} | Mendr</title>
  <style>
    body { margin: 0; padding: 0; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrap { max-width: 480px; margin: 80px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 40px 32px; }
    h1 { font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 12px; }
    p { font-size: 15px; color: #6b7280; margin: 0 0 24px; line-height: 1.6; }
    a { color: #111827; font-size: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${heading}</h1>
    <p>${message}</p>
    <a href="${siteUrl}">Return to Mendr</a>
  </div>
</body>
</html>`;

    return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
    });
}

export async function GET(req: NextRequest): Promise<Response> {
    const siteUrl = getSiteUrl();
    const cronSecret = process.env.CRON_SECRET ?? '';
    const token = req.nextUrl.searchParams.get('token') ?? '';

    if (!token) {
        return htmlResponse(
            'Invalid link',
            'This unsubscribe link has expired or is invalid.',
            siteUrl
        );
    }

    const email = verifyUnsubscribeToken(token, cronSecret);
    if (!email) {
        return htmlResponse(
            'Link expired',
            'This unsubscribe link has expired or is invalid. Links are valid for 30 days.',
            siteUrl
        );
    }

    try {
        const admin = await createSupabaseAdminClient();
        await admin
            .from('email_suppressions')
            .upsert({ email: email.toLowerCase(), reason: 'unsubscribed' }, { onConflict: 'email', ignoreDuplicates: true });
    } catch (err) {
        console.error('[unsubscribe] upsert error:', err instanceof Error ? err.message : String(err));
    }

    return htmlResponse(
        "You've been unsubscribed",
        `We've removed ${email} from our mailing list. You will no longer receive digest emails from Mendr.`,
        siteUrl
    );
}
