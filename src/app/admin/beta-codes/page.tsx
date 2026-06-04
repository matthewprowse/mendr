import { META_ADMIN_BETA_CODES } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import AdminBetaCodesClient from './client';

export const metadata = META_ADMIN_BETA_CODES;

export default async function AdminBetaCodesPage() {
    await requireAdminPage();
    return <AdminBetaCodesClient />;
}
