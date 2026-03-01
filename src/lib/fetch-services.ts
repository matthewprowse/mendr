import { createSupabaseServerClient } from '@/lib/supabase-server';

export type Service = {
    id: string;
    label: string;
    search_query: string;
    sort_order: number;
};

const SERVICES_FETCH_TIMEOUT_MS = 8000;

/** Fetches active services from Supabase, ordered by sort_order. Never hangs: times out and returns [] after 8s. */
export async function getServices(): Promise<Service[]> {
    const timeout = new Promise<Service[]>((_, reject) =>
        setTimeout(() => reject(new Error('getServices timeout')), SERVICES_FETCH_TIMEOUT_MS)
    );
    const fetchServices = async (): Promise<Service[]> => {
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase
            .from('services')
            .select('id, label, search_query, sort_order')
            .eq('active', true)
            .order('sort_order', { ascending: true });
        if (error) {
            console.error('getServices error:', error);
            return [];
        }
        return data ?? [];
    };
    try {
        return await Promise.race([fetchServices(), timeout]);
    } catch (e) {
        console.error('getServices failed:', e);
        return [];
    }
}
