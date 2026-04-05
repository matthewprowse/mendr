import type { Metadata } from 'next';
import AdminAnalyticsClient from './admin-analytics-client';

export const metadata: Metadata = {
    title: 'Analytics',
    robots: { index: false, follow: false },
};

export default function AdminAnalyticsPage() {
    return <AdminAnalyticsClient />;
}
