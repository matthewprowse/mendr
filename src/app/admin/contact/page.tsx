import { META_ADMIN_CONTACT } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import AdminContactClient from './client';

export const metadata = META_ADMIN_CONTACT;

export default async function AdminContactPage() {
    await requireAdminPage();
    return <AdminContactClient />;
}
