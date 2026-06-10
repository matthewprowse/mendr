import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId, getProviderRole } from '@/lib/providers/claimed-provider';
import EditProfileClient, { type EditableProfile } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Edit Profile' },
    robots: { index: false, follow: false },
};

export default async function ProAccountEditPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/account/edit');

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) redirect('/pro/account');

    const role = await getProviderRole(user.id, providerId);
    const canEdit = role === 'owner' || role === 'admin';

    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('providers')
        .select(
            'name, summary_long, about, past_work, website, phone, highlights, specialisations, years_in_business',
        )
        .eq('id', providerId)
        .maybeSingle();
    const p = (data ?? {}) as Record<string, unknown>;

    const initial: EditableProfile = {
        name: (p.name as string | null) ?? '',
        summary_long: (p.summary_long as string | null) ?? '',
        about: (p.about as string | null) ?? '',
        past_work: (p.past_work as string | null) ?? '',
        website: (p.website as string | null) ?? '',
        phone: (p.phone as string | null) ?? '',
        highlights: Array.isArray(p.highlights) ? (p.highlights as string[]).join(', ') : '',
        specialisations: Array.isArray(p.specialisations)
            ? (p.specialisations as string[]).join(', ')
            : '',
        years_in_business:
            typeof p.years_in_business === 'number' ? String(p.years_in_business) : '',
    };

    return <EditProfileClient initial={initial} canEdit={canEdit} />;
}
