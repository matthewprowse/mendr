import { notFound, redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';
import InvoiceEditorClient, { type InvoiceEditorData } from './client';
import type { InvoiceStatus } from '../client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Invoice' },
    robots: { index: false, follow: false },
};

type CustomerRef = { name: string | null };
type InvoiceRecord = {
    id: string;
    provider_id: string;
    number: string | null;
    status: InvoiceStatus;
    issued_at: string | null;
    deposit_percent: number | null;
    due_date: string | null;
    terms: string | null;
    total: number | null;
    amount_paid: number | null;
    provider_customers: CustomerRef | CustomerRef[] | null;
};
type ItemRecord = {
    description: string | null;
    qty: number | null;
    unit_price: number | null;
    position: number;
};

export default async function InvoiceEditorPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/pro/auth/login?next=/pro/invoices/${id}`);

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) notFound();

    const admin = await createSupabaseAdminClient();
    const { data: invoice } = await admin
        .from('invoices')
        .select(
            'id, provider_id, number, status, issued_at, deposit_percent, due_date, terms, total, amount_paid, provider_customers(name)',
        )
        .eq('id', id)
        .maybeSingle();
    const inv = invoice as InvoiceRecord | null;
    if (!inv || inv.provider_id !== providerId) notFound();

    const [{ data: items }, { data: branding }] = await Promise.all([
        admin
            .from('invoice_items')
            .select('description, qty, unit_price, position')
            .eq('invoice_id', id)
            .order('position', { ascending: true }),
        admin
            .from('provider_branding')
            .select('vat_registered')
            .eq('provider_id', providerId)
            .maybeSingle(),
    ]);

    const cust = Array.isArray(inv.provider_customers)
        ? inv.provider_customers[0]
        : inv.provider_customers;

    const data: InvoiceEditorData = {
        id: inv.id,
        number: inv.number,
        status: inv.status,
        issued: Boolean(inv.issued_at),
        customerName: cust?.name ?? null,
        depositPercent: inv.deposit_percent != null ? String(inv.deposit_percent) : '',
        dueDate: inv.due_date ?? '',
        terms: inv.terms ?? '',
        total: Number(inv.total ?? 0),
        amountPaid: Number(inv.amount_paid ?? 0),
        vatRegistered: Boolean(
            (branding as { vat_registered?: boolean } | null)?.vat_registered,
        ),
        items: ((items ?? []) as ItemRecord[]).map((it) => ({
            description: it.description ?? '',
            qty: it.qty != null ? String(it.qty) : '1',
            unitPrice: it.unit_price != null ? String(it.unit_price) : '0',
        })),
    };

    return <InvoiceEditorClient data={data} />;
}
