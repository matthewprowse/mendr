import { META_ADMIN_LOGIN } from '@/lib/site-metadata';
import AdminLoginClient from './client';

export const metadata = META_ADMIN_LOGIN;

export default function AdminLoginPage() {
    return <AdminLoginClient />;
}
