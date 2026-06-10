import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

let serviceRoleClient: SupabaseClient | null = null;

/**
 * Cookie-aware Supabase client for Route Handlers and auth flows (anon key + user session).
 */
export async function createSupabaseServerClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    const cookieStore = await cookies();

    return createServerClient(url, key, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                } catch {
                    /* ignore when called from a Server Component without mutable cookies */
                }
            },
        },
    });
}

/**
 * Service-role client for trusted server-only operations (bypasses RLS).
 */
export async function createSupabaseAdminClient() {
    if (serviceRoleClient) return serviceRoleClient;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    }

    serviceRoleClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return serviceRoleClient;
}

/**
 * Anon Supabase client for Server Components when env is configured; otherwise `null`
 * (caller may fall back to client-side loading).
 */
export async function tryCreateSupabaseServerClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        return null;
    }

    const cookieStore = await cookies();

    return createServerClient(url, key, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                } catch {
                    /* ignore */
                }
            },
        },
    });
}
