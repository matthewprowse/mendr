import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId, getProviderRole } from '@/lib/providers/claimed-provider';
import ManagePhotosClient, { type GalleryItem } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Photos' },
    robots: { index: false, follow: false },
};

export default async function ProAccountPhotosPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/account/photos');

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) redirect('/pro/account');

    const role = await getProviderRole(user.id, providerId);
    const canEdit = role === 'owner' || role === 'admin';

    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('provider_images')
        .select('id, path, bucket, caption, status, sort_order')
        .eq('provider_id', providerId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const rows = (data ?? []) as Array<{
        id: string;
        path: string | null;
        bucket: string | null;
        caption: string | null;
        status: string | null;
    }>;
    const images: GalleryItem[] = rows.map((r) => ({
        id: String(r.id),
        url: `${supabaseUrl}/storage/v1/object/public/${r.bucket || 'gallery'}/${r.path}`,
        caption: typeof r.caption === 'string' ? r.caption : null,
        pending: (r.status ?? '') !== 'approved',
    }));

    return <ManagePhotosClient providerId={providerId} canEdit={canEdit} images={images} />;
}
