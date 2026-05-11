import { META_ADMIN_CONTACT } from '@/lib/site-metadata';
import AdminContactClient from './client';

export const metadata = META_ADMIN_CONTACT;

export default function AdminContactPage() {
    return <AdminContactClient />;
}
