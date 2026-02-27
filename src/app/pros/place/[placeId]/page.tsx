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
        .from('cached_providers')
        .select('id')
        .eq('place_id', norm)
        .maybeSingle();
    if (row?.id) redirect(`/pro/${encodeURIComponent(row.id)}`);
    const { data: row2 } = await supabase
        .from('cached_providers')
        .select('id')
        .eq('place_id', `places/${norm}`)
        .maybeSingle();
    if (!row2?.id) notFound();
    redirect(`/pro/${encodeURIComponent(row2.id)}`);
}
