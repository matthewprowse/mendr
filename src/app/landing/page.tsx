import { redirect } from 'next/navigation';

/** Preserves old `/landing` links and bookmarks. */
export default function LandingLegacyRedirect() {
    redirect('/');
}
