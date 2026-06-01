import { redirect } from 'next/navigation';
import { META_ADMIN_LOGIN } from '@/lib/site-metadata';
import { hasValidAdminSession } from '@/lib/auth/admin-guard';
import AdminLoginClient from './client';

export const metadata = META_ADMIN_LOGIN;

export default async function AdminLoginPage() {
    // Already authenticated admins skip the password form.
    if (await hasValidAdminSession()) redirect('/admin');
    return <AdminLoginClient />;
}
