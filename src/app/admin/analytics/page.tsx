import { META_ADMIN_ANALYTICS } from '@/lib/site-metadata';
import AdminAnalyticsClient from './client';

export const metadata = META_ADMIN_ANALYTICS;

export default function AdminAnalyticsPage() {
    return <AdminAnalyticsClient />;
}
