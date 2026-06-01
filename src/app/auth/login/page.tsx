import { redirect } from 'next/navigation';
import { META_SIGN_IN } from '@/lib/site-metadata';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import LoginClient from './client';

export const metadata = META_SIGN_IN;

export default async function LoginPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/home');
    return <LoginClient />;
}
