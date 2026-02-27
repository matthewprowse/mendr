import { redirect } from 'next/navigation';

type PageProps = { params: Promise<{ placeId: string }> };

function normalizePlaceId(id: string) {
    return (id || '').replace(/^places\//, '');
}

/** Redirect legacy /pros/place/[placeId] to /pro/[placeId] (ID-based URL). */
export default async function ProviderPlaceRedirectPage({ params }: PageProps) {
    const { placeId } = await params;
    const decoded = decodeURIComponent(placeId);
    if (!decoded.trim()) redirect('/');
    redirect(`/pro/${encodeURIComponent(normalizePlaceId(decoded))}`);
}
