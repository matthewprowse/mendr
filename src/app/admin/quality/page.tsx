import { META_ADMIN } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import AdminQualityClient from './client';

export const metadata = META_ADMIN;

export default async function AdminQualityPage() {
    await requireAdminPage();
    return <AdminQualityClient />;
}
