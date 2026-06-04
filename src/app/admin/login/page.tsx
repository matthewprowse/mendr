import { redirect } from 'next/navigation';

export default async function AdminLoginPage() {
    // The standalone admin password login is retired. Admin access is now tied to
    // the signed-in account (profiles.is_admin). Send through to /admin, which
    // gates via requireAdminPage — admins pass, everyone else goes to /home.
    redirect('/admin');
}
