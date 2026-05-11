import { META_ADMIN_GALLERY } from '@/lib/site-metadata';
import AdminGalleryClient from './client';

export const metadata = META_ADMIN_GALLERY;

export default function AdminGalleryPage() {
    return <AdminGalleryClient />;
}
