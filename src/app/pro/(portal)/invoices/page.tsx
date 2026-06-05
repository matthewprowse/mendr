import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import InvoicesClient, { type InvoiceRow, type InvoiceStatus } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Invoices' },
    robots: { index: false, follow: false },
};

type CustomerRef = { name: string | null };
type InvoiceRecord = {
    id: string;
    number: string | null;
    status: InvoiceStatus;
    total: number | null;
    amount_paid: number | null;
    created_at: string;
    provider_customers: CustomerRef | CustomerRef[] | null;
};

export default async function ProInvoicesPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/invoices');

    const { providerId, pending } = await getProviderState(user.id);
    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Invoices</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. You can invoice once your business is verified.'
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
        .from('invoices')
        .select('id, number, status, total, amount_paid, created_at, provider_customers(name)')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });

    const rows: InvoiceRow[] = ((data ?? []) as InvoiceRecord[]).map((inv) => {
        const cust = Array.isArray(inv.provider_customers)
            ? inv.provider_customers[0]
            : inv.provider_customers;
        return {
            id: inv.id,
            number: inv.number,
            status: inv.status,
            total: Number(inv.total ?? 0),
            amountPaid: Number(inv.amount_paid ?? 0),
            customerName: cust?.name ?? null,
            createdAt: inv.created_at,
        };
    });

    return <InvoicesClient rows={rows} />;
}
