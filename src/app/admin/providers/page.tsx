import { META_ADMIN_PROVIDERS } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import ProvidersHubClient from './hub-client';

export const metadata = META_ADMIN_PROVIDERS;

export default async function AdminProvidersPage() {
    await requireAdminPage();
    return <ProvidersHubClient />;
}
