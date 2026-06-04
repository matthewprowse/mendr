import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import ProRegisterClient from './client';

export const metadata: Metadata = {
    title: { absolute: 'Create Pro Account | Mendr Pro' },
    robots: { index: false, follow: false },
};

export default async function ProRegisterPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/contractors/network');
    return <ProRegisterClient />;
}
