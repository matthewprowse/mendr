import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import QuotesClient, { type QuoteRow, type QuoteStatus } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Quotes' },
    robots: { index: false, follow: false },
};

type CustomerRef = { name: string | null };
type QuoteRecord = {
    id: string;
    number: string | null;
    status: QuoteStatus;
    total: number | null;
    valid_until: string | null;
    created_at: string;
    provider_customers: CustomerRef | CustomerRef[] | null;
};

export default async function ProQuotesPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/quotes');

    const { providerId, pending } = await getProviderState(user.id);
    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Quotes</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. You can build quotes once your business is verified.'
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
        .from('quotes')
        .select('id, number, status, total, valid_until, created_at, provider_customers(name)')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });

    const rows: QuoteRow[] = ((data ?? []) as QuoteRecord[]).map((q) => {
        const cust = Array.isArray(q.provider_customers) ? q.provider_customers[0] : q.provider_customers;
        return {
            id: q.id,
            number: q.number ?? '—',
            status: q.status,
            total: Number(q.total ?? 0),
            customerName: cust?.name ?? null,
            createdAt: q.created_at,
        };
    });

    return <QuotesClient rows={rows} />;
}
