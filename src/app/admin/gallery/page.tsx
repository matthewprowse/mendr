import { META_ADMIN_GALLERY } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import AdminGalleryClient from './client';

export const metadata = META_ADMIN_GALLERY;

export default async function AdminGalleryPage() {
    await requireAdminPage();
    return <AdminGalleryClient />;
}
