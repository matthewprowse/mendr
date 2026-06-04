import { META_ADMIN_HOME } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import AdminHomeClient from './client';

export const metadata = META_ADMIN_HOME;

export default async function AdminPage() {
    await requireAdminPage();
    return <AdminHomeClient />;
}
