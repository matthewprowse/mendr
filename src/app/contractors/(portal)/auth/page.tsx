import { redirect } from 'next/navigation';

type Props = {
    searchParams: Promise<{ next?: string }>;
};

export default async function ContractorsAuthPage({ searchParams }: Props) {
    const params = await searchParams;
    const next = params.next ?? '/contractors/network';
    redirect(`/pro/auth/login?next=${encodeURIComponent(next)}`);
}
