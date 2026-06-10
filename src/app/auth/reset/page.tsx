import { META_RESET_PASSWORD } from '@/lib/site-metadata';
import AuthResetClient from './client';

export const metadata = META_RESET_PASSWORD;

/**
 * NOTE: Unlike /auth/login, /auth/register and /auth/forgot, this page does
 * NOT redirect authenticated users away. Visitors arrive here from a password
 * reset email link, which establishes a Supabase recovery session — so they
 * *are* signed in when they land. The client then calls
 * supabase.auth.updateUser({ password }), which requires that session. A
 * "redirect if logged in" guard here would hijack every legitimate reset and
 * break password recovery entirely. Leave this as a plain server shell.
 */
export default function ResetPasswordPage() {
    return <AuthResetClient />;
}
