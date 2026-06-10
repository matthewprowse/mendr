import { NextResponse, type NextRequest } from 'next/server';

// ── Beta access gate ──────────────────────────────────────────────────────────

const BETA_COOKIE_NAME  = 'beta_access';
const BETA_COOKIE_VALUE = 'granted';

/** Paths that bypass the beta gate entirely. */
const BETA_PUBLIC_PREFIXES = [
    '/launch',
    '/api/beta-access',
    '/api/contact',     // Pre-launch interest form on /launch
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

    // Beta gate: redirect to /launch unless the visitor has the access cookie.
    // Disabled when COMING_SOON_PASSWORD is empty/unset.
    if (process.env.COMING_SOON_PASSWORD && !isBetaPublicPath(pathname)) {
        const cookie = req.cookies.get(BETA_COOKIE_NAME);
        if (cookie?.value !== BETA_COOKIE_VALUE) {
            const url = req.nextUrl.clone();
            url.pathname = '/launch';
            return NextResponse.redirect(url);
        }
    }

    // Admin authorization is enforced per-page (requireAdminPage) and per-API
    // route (requireAdmin) against profiles.is_admin — not at the edge here.
    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!.*\\..*).*)'],
};
