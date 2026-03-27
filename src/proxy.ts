import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Only intercept /admin routes.
    if (!pathname.startsWith('/admin')) return NextResponse.next();

    // Login page is always accessible.
    if (pathname === '/admin/login') return NextResponse.next();

    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
        // If ADMIN_PASSWORD is not configured, block access entirely.
        return NextResponse.redirect(new URL('/admin/login', req.url));
    }

    const session = req.cookies.get('admin_session')?.value;
    const expected = Buffer.from(password).toString('base64');

    if (!session || session !== expected) {
        const loginUrl = new URL('/admin/login', req.url);
        loginUrl.searchParams.set('next', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*'],
};
