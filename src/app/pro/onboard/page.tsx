import { redirect } from 'next/navigation';

/** Permanent redirect — route moved to /contractors/network */
export default function ProOnboardPage() {
    redirect('/contractors/network');
}
