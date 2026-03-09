import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type PageProps = { params: Promise<{ placeId: string }> };

function normalizePlaceId(id: string) {
    return (id || '').replace(/^places\//, '');
}

/** Redirect legacy /pros/place/[placeId] to /pro/[id] using cached_providers.id */
export default async function ProsPlaceRedirect({ params }: PageProps) {
    const { placeId } = await params;
    const decoded = decodeURIComponent(placeId);
    if (!decoded.trim()) redirect('/');
    const norm = normalizePlaceId(decoded);
    const supabase = await createSupabaseServerClient();
    const { data: row } = await supabase
        .from('providers')
        .select('id')
        .eq('google_place_id', norm.startsWith('places/') ? norm : `places/${norm}`)
        .maybeSingle();
    if (row?.id) redirect(`/pro/${encodeURIComponent(row.id)}`);
    notFound();
}
