/**
 * Per-account admin authorization.
 *
 * Admin access is granted to a signed-in user whose `profiles.is_admin` is true
 * (toggle in the Supabase dashboard / via service role). This replaces the old
 * shared ADMIN_PASSWORD cookie gate. Used by both the server-component guard
 * (requireAdminPage) and the API guard (requireAdmin).
 *
 * The is_admin lookup uses the service-role client so it is unaffected by RLS;
 * the identity itself comes from the cookie-bound user session (getUser, which
 * validates the JWT).
 */

import { createSupabaseServerClient, createSupabaseAdminClient } from './supabase-server';

export async function isAdminUser(): Promise<boolean> {
    try {
        const supabase = await createSupabaseServerClient();
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();
        if (error || !user) return false;

        const admin = await createSupabaseAdminClient();
        const { data } = await admin
            .from('profiles')
            .select('is_admin')
            .eq('user_id', user.id)
            .maybeSingle();

        return data?.is_admin === true;
    } catch {
        return false;
    }
}
