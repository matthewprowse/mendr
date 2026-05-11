import { redirect } from 'next/navigation';

/** Permanent redirect — route moved to /contractors */
export default function ProJoinPage() {
    redirect('/contractors');
}
