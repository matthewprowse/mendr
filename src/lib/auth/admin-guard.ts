/**
 * Server-component admin guard.
 *
 * Kept separate from `admin-auth.ts` because it imports `next/headers` and
 * `next/navigation`, which are server-component / route-handler only and must
 * not leak into the Edge-runtime-safe `admin-auth.ts` (used by the proxy).
 *
 * Usage — first line of every protected admin page.tsx (a Server Component):
 *
 *   export default async function SomeAdminPage() {
 *       await requireAdminPage();
 *       return <SomeAdminClient />;
 *   }
 *
 * If the admin_session cookie is missing/expired/invalid, the visitor is
 * redirected to /admin/login before any admin HTML is rendered. New admin
 * pages MUST call this — there is no layout-level guard (the login page lives
 * inside the same /admin tree and a layout guard would infinite-redirect it).
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE_NAME, verifyAdminToken } from './admin-auth';

/** Returns true when the current request carries a valid admin session cookie. */
export async function hasValidAdminSession(): Promise<boolean> {
    const store = await cookies();
    return verifyAdminToken(store.get(ADMIN_COOKIE_NAME)?.value);
}

/** Redirect to /admin/login unless the request carries a valid admin session. */
export async function requireAdminPage(): Promise<void> {
    const ok = await hasValidAdminSession();
    if (!ok) redirect('/admin/login');
}
