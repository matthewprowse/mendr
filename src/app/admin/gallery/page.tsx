import type { Metadata } from 'next';
import AdminGalleryClient from './client';

export const metadata: Metadata = {
    title: 'Gallery',
    robots: { index: false, follow: false },
};

export default function AdminGalleryPage() {
    return <AdminGalleryClient />;
}
