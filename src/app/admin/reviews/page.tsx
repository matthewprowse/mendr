import { META_ADMIN_REVIEWS } from '@/lib/site-metadata';
import AdminReviewsClient from './client';

export const metadata = META_ADMIN_REVIEWS;

export default function AdminReviewsPage() {
    return <AdminReviewsClient />;
}
