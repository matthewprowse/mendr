import { redirect } from 'next/navigation';
import { META_FORGOT_PASSWORD } from '@/lib/site-metadata';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import AuthForgotClient from './client';

export const metadata = META_FORGOT_PASSWORD;

export default async function ForgotPasswordPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/home');
    return <AuthForgotClient />;
}
