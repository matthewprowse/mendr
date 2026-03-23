import { redirect } from 'next/navigation';

export default async function ChatIndexPage({
    searchParams,
}: {
    searchParams: Promise<{ id?: string }>;
}) {
    const params = await searchParams;
    if (params.id) {
        redirect(`/scan/${params.id}`);
    }
    redirect('/');
}
