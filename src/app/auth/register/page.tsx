import { redirect } from 'next/navigation';
import { META_REGISTER } from '@/lib/site-metadata';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import AuthRegisterClient from './client';

export const metadata = META_REGISTER;

export default async function RegisterPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/home');
    return <AuthRegisterClient />;
}
