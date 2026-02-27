import { redirect } from 'next/navigation';

type PageProps = { params: Promise<{ slug: string }> };

/** Redirect old /pros/[param] to /pro/[param]. Works when param is a provider id (UUID). */
export default async function ProsRedirect({ params }: PageProps) {
    const { slug } = await params;
    redirect(`/pro/${encodeURIComponent(slug)}`);
}
