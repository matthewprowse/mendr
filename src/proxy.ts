import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdminCookie } from '@/lib/admin-auth';

export async function proxy(req: NextRequest) {
    const { nextUrl } = req;
    const pathname = nextUrl.pathname;

    // Protect /admin routes with HMAC-signed session cookie.
    if (pathname.startsWith('/admin')) {
        // Login page is always accessible.
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
