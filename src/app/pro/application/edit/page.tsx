import { redirect } from 'next/navigation';

/** Permanent redirect — route moved to /contractors/application/edit */
export default async function ProApplicationEditPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string | string[] }>;
}) {
    const params = await searchParams;
    const token = typeof params.token === 'string' ? params.token : '';
    redirect(`/contractors/application/edit${token ? `?token=${encodeURIComponent(token)}` : ''}`);
}
