import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdminCookie } from '@/lib/auth/admin-auth';

// ── Beta access gate ──────────────────────────────────────────────────────────

const BETA_COOKIE_NAME  = 'beta_access';
const BETA_COOKIE_VALUE = 'granted';

/** Paths that bypass the beta gate entirely. */
const BETA_PUBLIC_PREFIXES = [
    '/coming-soon',
    '/api/beta-access',
    '/api/contact',     // Pre-launch interest form on /coming-soon
    '/api/geocode',     // Internal server-side fetch (WhatsApp bot) — no beta cookie
    '/api/providers',   // Internal server-side fetch (WhatsApp bot) — no beta cookie
    '/admin',           // Admin has its own auth — handled below
    '/_next/',
    '/fonts/',
    '/docs/',
    '/landing1',        // Public homeowner marketing page
    '/landing2',        // Public contractor marketing page
];
const BETA_PUBLIC_EXACT = ['/favicon.ico', '/site.webmanifest'];

function isBetaPublicPath(pathname: string): boolean {
    if (BETA_PUBLIC_EXACT.includes(pathname)) return true;
    return BETA_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ── Main proxy ────────────────────────────────────────────────────────────────

export async function proxy(req: NextRequest) {
    const { nextUrl } = req;
    const pathname = nextUrl.pathname;

    // Beta gate: redirect to /coming-soon unless the visitor has the access cookie.
    // Disabled when COMING_SOON_PASSWORD is empty/unset.
    if (process.env.COMING_SOON_PASSWORD && !isBetaPublicPath(pathname)) {
        const cookie = req.cookies.get(BETA_COOKIE_NAME);
        if (cookie?.value !== BETA_COOKIE_VALUE) {
            const url = req.nextUrl.clone();
            url.pathname = '/coming-soon';
            return NextResponse.redirect(url);
        }
    }

    // Admin route protection: HMAC-signed session cookie.
    if (pathname.startsWith('/admin')) {
        if (pathname === '/admin/login') return NextResponse.next();

        const valid = await verifyAdminCookie(req);
        if (!valid) {
            const loginUrl = new URL('/admin/login', req.url);
            loginUrl.searchParams.set('next', pathname);
            return NextResponse.redirect(loginUrl);
        }

        return NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!.*\\..*).*)'],
};
