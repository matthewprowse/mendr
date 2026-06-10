/**
 * Admin authorization guard for API route handlers.
 *
 * The legacy ADMIN_PASSWORD HMAC `admin_session` cookie path was removed
 * (finding M5): it was dead weight — the real gate is per-account, tied to the
 * signed-in user's `profiles.is_admin` flag. requireAdmin delegates to
 * isAdminUser, which validates the Supabase JWT and reads the flag with the
 * service role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdminUser } from './admin-access';

/**
 * Use in API route handlers. Returns a 401 NextResponse if the caller is not an
 * admin; otherwise null.
 *
 * Usage:
 *   const deny = await requireAdmin(req);
 *   if (deny) return deny;
 */
export async function requireAdmin(_req: NextRequest): Promise<NextResponse | null> {
    if (await isAdminUser()) return null;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
