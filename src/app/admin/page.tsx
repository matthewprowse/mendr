import { META_ADMIN } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import AdminHomeClient from './client';

export const metadata = META_ADMIN;

export default async function AdminPage() {
    await requireAdminPage();
    return <AdminHomeClient />;
}
