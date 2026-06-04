import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import ApplicationEditClient from './client';

export const metadata: Metadata = {
    title: 'Review your Mendr profile',
    description: 'Review and edit your Mendr contractor profile summary before it goes live.',
    robots: { index: false, follow: false },
};

export default async function ApplicationEditPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/pro/auth/login?next=/contractors/application/edit');
    }

    return <ApplicationEditClient />;
}
