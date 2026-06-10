import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import CustomersClient, { type CustomerRow } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Customers' },
    robots: { index: false, follow: false },
};

export default async function ProCustomersPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/customers');

    const { providerId, pending } = await getProviderState(user.id);
    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Customers</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. Your customers will appear here once your business is verified.'
                            : 'Your business is not linked to a profile yet.'}
                    </p>
                </div>
                {pending ? null : (
                    <Button asChild className="w-fit">
                        <Link href="/pro/claim">Claim Your Business</Link>
                    </Button>
                )}
            </div>
        );
    }

    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('provider_customers')
        .select('id, name, phone, email, address, created_at')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });

    return <CustomersClient customers={(data ?? []) as CustomerRow[]} />;
}
