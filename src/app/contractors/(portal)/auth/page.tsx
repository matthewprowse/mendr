import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import ContractorsAuthClient from './client';

type Props = {
    searchParams: Promise<{ next?: string }>;
};

export default async function ContractorsAuthPage({ searchParams }: Props) {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        redirect('/contractors/account');
    }

    const params = await searchParams;
    const redirectTo = params.next ?? '/contractors/account';

    return <ContractorsAuthClient redirectTo={redirectTo} />;
}
