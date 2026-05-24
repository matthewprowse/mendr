import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import ServiceAreaClient from './client';

export const metadata = {
    title: 'Service Area | Mendr Contractors',
    robots: { index: false, follow: false },
};

export default async function ContractorServiceAreaPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/contractors/auth?next=/contractors/account/service-area');
    }

    return <ServiceAreaClient />;
}
