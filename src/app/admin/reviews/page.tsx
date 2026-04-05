import type { Metadata } from 'next';
import AdminReviewsClient from './admin-reviews-client';

export const metadata: Metadata = {
    title: 'Reviews',
    robots: { index: false, follow: false },
};

export default function AdminReviewsPage() {
    return <AdminReviewsClient />;
}
