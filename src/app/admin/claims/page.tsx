import { requireAdminPage } from '@/lib/auth/admin-guard';
import AdminClaimsClient from './client';

export const metadata = {
    title: { absolute: 'Mendr Admin: Claims' },
    robots: { index: false, follow: false },
};

export default async function AdminClaimsPage() {
    await requireAdminPage();
    return <AdminClaimsClient />;
}
