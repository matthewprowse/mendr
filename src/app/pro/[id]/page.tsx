import { redirect } from 'next/navigation';

/** Permanent redirect — route moved to /contractors/[id] */
export default async function ProByIdPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/contractors/${encodeURIComponent(id)}`);
}
