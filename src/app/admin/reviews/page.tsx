import { META_ADMIN_REVIEWS } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import AdminReviewsClient from './client';

export const metadata = META_ADMIN_REVIEWS;

export default async function AdminReviewsPage() {
    await requireAdminPage();
    return <AdminReviewsClient />;
}
