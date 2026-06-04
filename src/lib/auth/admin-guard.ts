/**
 * Server-component admin guard.
 *
 * Usage — first line of every protected admin page.tsx (a Server Component):
 *
 *   export default async function SomeAdminPage() {
 *       await requireAdminPage();
 *       return <SomeAdminClient />;
 *   }
 *
 * Access is granted only to a signed-in user whose `profiles.is_admin` is true.
 * Everyone else (signed out, or signed in without the flag) is redirected to
 * /home before any admin HTML is rendered. New admin pages MUST call this —
 * there is no layout-level guard.
 */

import { redirect } from 'next/navigation';
import { isAdminUser } from './admin-access';

/** Redirect to /home unless the signed-in user is an admin. */
export async function requireAdminPage(): Promise<void> {
    if (!(await isAdminUser())) {
        redirect('/home');
    }
}
