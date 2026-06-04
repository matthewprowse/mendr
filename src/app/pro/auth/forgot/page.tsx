import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import ProForgotClient from './client';

export const metadata: Metadata = {
    title: { absolute: 'Reset Pro Password | Mendr Pro' },
    robots: { index: false, follow: false },
};

export default async function ProForgotPasswordPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/contractors/network');
    return <ProForgotClient />;
}
