import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Singleton instance to avoid "Multiple GoTrueClient instances" warning
let supabaseInstance: any = null;
let hasWarnedMissingEnv = false;

export const getSupabase = () => {
    if (typeof window === 'undefined') return dummyClient;

    if (!supabaseInstance) {
        if (!supabaseUrl || !supabaseAnonKey) {
            // Avoid noisy production logs when auth is intentionally disabled.
            if (process.env.NODE_ENV !== 'production' && !hasWarnedMissingEnv) {
                console.warn(
                    'Supabase environment variables are missing. Client will not be initialized.'
                );
                hasWarnedMissingEnv = true;
            }
            supabaseInstance = dummyClient;
            return supabaseInstance;
        }

        supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                flowType: 'pkce',
                detectSessionInUrl: true,
                persistSession: true,
                autoRefreshToken: true,
            },
        });
    }
    return supabaseInstance;
};

// Export a dummy client when env vars are missing — prevents runtime crashes.
// Implements all methods the app uses so it degrades gracefully.
const noop = () => {};
const emptyResult = { data: [], error: null };
const emptySingle = { data: null, error: null };
const dummyFrom = (table: string) => {
    const chain = {
        eq: () => chain,
        /** Must return `chain` so callers can chain multiple `.order()` calls (e.g. gallery sort). */
        order: () => chain,
        in: () => Promise.resolve(emptyResult),
        maybeSingle: () => Promise.resolve(emptySingle),
        single: () => Promise.resolve(emptySingle),
        then: (resolve: (v: any) => void) => resolve(emptyResult),
        catch: (fn: (e: any) => void) => chain,
    };
    return {
        select: () => chain,
        insert: () => Promise.resolve(emptySingle),
        upsert: () => Promise.resolve(emptySingle),
        update: () => ({ eq: () => Promise.resolve(emptySingle) }),
    };
};

const dummyClient = {
    auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
        signInAnonymously: async () => ({ data: { session: null, user: null }, error: null }),
        signInWithOtp: async () => ({ data: null, error: null }),
        signInWithPassword: async () => ({ data: null, error: null }),
        signInWithOAuth: async () => ({ data: null, error: null }),
        signUp: async () => ({ data: null, error: null }),
        resetPasswordForEmail: async () => ({ data: null, error: null }),
        updateUser: async () => ({ data: null, error: null }),
        exchangeCodeForSession: async () => ({ data: null, error: null }),
        verifyOtp: async () => ({ data: null, error: null }),
        signOut: async () => ({ error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: dummyFrom,
    channel: () => ({
        on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: noop,
} as any;

export const supabase =
    typeof window !== 'undefined' && supabaseUrl && supabaseAnonKey ? getSupabase() : dummyClient;
