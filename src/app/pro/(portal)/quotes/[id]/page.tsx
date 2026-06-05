import { notFound, redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';
import QuoteEditorClient, { type QuoteEditorData } from './client';
import type { QuoteStatus } from '../client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Quote' },
    robots: { index: false, follow: false },
};

type CustomerRef = { name: string | null };
type QuoteRecord = {
    id: string;
    provider_id: string;
    number: string | null;
    status: QuoteStatus;
    deposit_percent: number | null;
    valid_until: string | null;
    terms: string | null;
    provider_customers: CustomerRef | CustomerRef[] | null;
};
type ItemRecord = {
    description: string | null;
    qty: number | null;
    unit_price: number | null;
    position: number;
};

export default async function QuoteEditorPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/pro/auth/login?next=/pro/quotes/${id}`);

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) notFound();

    const admin = await createSupabaseAdminClient();
    const { data: quote } = await admin
        .from('quotes')
        .select(
            'id, provider_id, number, status, deposit_percent, valid_until, terms, provider_customers(name)'
        )
        .eq('id', id)
        .maybeSingle();
    const q = quote as QuoteRecord | null;
    if (!q || q.provider_id !== providerId) notFound();

    const [{ data: items }, { data: branding }] = await Promise.all([
        admin
            .from('quote_items')
            .select('description, qty, unit_price, position')
            .eq('quote_id', id)
            .order('position', { ascending: true }),
        admin
            .from('provider_branding')
            .select('vat_registered')
            .eq('provider_id', providerId)
            .maybeSingle(),
    ]);

    const cust = Array.isArray(q.provider_customers) ? q.provider_customers[0] : q.provider_customers;

    const data: QuoteEditorData = {
        id: q.id,
        number: q.number ?? '',
        status: q.status,
        customerName: cust?.name ?? null,
        depositPercent: q.deposit_percent != null ? String(q.deposit_percent) : '',
        validUntil: q.valid_until ?? '',
        terms: q.terms ?? '',
        vatRegistered: Boolean((branding as { vat_registered?: boolean } | null)?.vat_registered),
        items: ((items ?? []) as ItemRecord[]).map((it) => ({
            description: it.description ?? '',
            qty: it.qty != null ? String(it.qty) : '1',
            unitPrice: it.unit_price != null ? String(it.unit_price) : '0',
        })),
    };

    return <QuoteEditorClient data={data} />;
}
