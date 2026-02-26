import { createSupabaseServerClient } from '@/lib/supabase-server';

export type Service = {
    id: string;
    label: string;
    search_query: string;
    sort_order: number;
};

/** Fetches active services from Supabase, ordered by sort_order. */
export async function getServices(): Promise<Service[]> {
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
}
