import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type Service = {
    id: string;
    label: string;
    search_query: string;
    sort_order?: number;
};

const SERVICES_FETCH_TIMEOUT_MS = 8000;

/** Fetch active services directly from Supabase. Never hangs: times out and returns [] after 8s. */
export async function getServices(): Promise<Service[]> {
    // This data depends on request cookies (via Supabase), so opt out of Next.js caching.
    noStore();

    try {
        const timeout = new Promise<Service[]>((resolve) =>
            setTimeout(() => resolve([]), SERVICES_FETCH_TIMEOUT_MS)
        );

        const fetchServices = async (): Promise<Service[]> => {
            try {
                const supabase = await createSupabaseServerClient();
                const { data, error } = await supabase
                    .from('services')
                    .select('id, label, search_query')
                    .eq('active', true);
                if (error) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn('getServices error:', error);
                    }
                    return [];
                }
                return data ?? [];
            } catch (e) {
                // Important: never throw from a server component dependency (RSC can fail hard).
                if (process.env.NODE_ENV === 'development') {
                    console.warn('getServices failed:', e);
                }
                return [];
            }
        };

        // Ensure fetch never results in an unhandled rejection, even if it loses the race.
        const safeFetch = fetchServices().catch(() => []);

        return await Promise.race([safeFetch, timeout]);
    } catch (e) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('getServices failed:', e);
        }
        return [];
    }
}
