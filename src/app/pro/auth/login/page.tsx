import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import ProLoginClient from './client';

export const metadata: Metadata = {
    title: { absolute: 'Pro Sign In | Mendr Pro' },
    robots: { index: false, follow: false },
};

export default async function ProLoginPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/contractors/network');
    return <ProLoginClient />;
}
