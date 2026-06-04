import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { META_CONTRACTORS_ONBOARD } from '@/lib/site-metadata';
import ProOnboardPageClient from './client';

export const metadata = META_CONTRACTORS_ONBOARD;

export default async function ProOnboardPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/pro/auth/login?next=/contractors/network');
    }

    return <ProOnboardPageClient />;
}
