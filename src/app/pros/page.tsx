import { redirect } from 'next/navigation';

/** Pros discovery page removed for now; redirect to home. */
export default function ProsPage() {
    redirect('/');
}
