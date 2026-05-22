import { redirect } from 'next/navigation';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import AccountClient from './client';

export const metadata = {
    title: 'My Account | Mendr Contractors',
    robots: { index: false, follow: false },
};

export default async function ContractorAccountPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/contractors/auth?next=/contractors/account');
    }

    const admin = await createSupabaseAdminClient();
    const { data: applications } = await admin
        .from('provider_applications')
        .select(
            'id, business_name, contact_name, status, rejection_reason, created_at, resubmission_of, matched_provider_id'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    return <AccountClient applications={applications ?? []} />;
}
