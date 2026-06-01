import { META_ADMIN_ANALYTICS } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import AnalyticsTabsClient from './tabs-client';

export const metadata = META_ADMIN_ANALYTICS;

export default async function AdminAnalyticsPage() {
    await requireAdminPage();
    return <AnalyticsTabsClient />;
}
