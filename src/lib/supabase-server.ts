import { createServerClient as createClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function createSupabaseServerClient() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error(
            'Missing Supabase config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env'
        );
    }

    const cookieStore = await cookies();

    return createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch (error) {
                        // Ignore if called from Server Component
                    }
                },
            },
        }
    );
}

// Alias for compatibility while debugging
export const createServerClient = createSupabaseServerClient;

export async function createSupabaseAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            'Missing Supabase admin config. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
        );
    }
    return createClient(
        url,
        key,
        {
            cookies: {
                getAll() {
                    return [];
                },
                setAll() {},
            },
        }
    );
}
