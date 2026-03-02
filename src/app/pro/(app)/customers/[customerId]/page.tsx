import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import { CustomerDetailClient } from './_components/customer-detail-client';

export const metadata: Metadata = {
    title: 'Customer',
    description: 'Customer profile and job history.',
};

type Props = { params: Promise<{ customerId: string }> };

export default async function ProCustomerPage({ params }: Props) {
    const { customerId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect('/auth/login?next=/pro/customers/' + customerId);
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, first_name, surname')
        .eq('id', customerId)
        .single();

    if (!profile) {
        notFound();
    }

    const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status, category, service_address, created_at, updated_at')
        .eq('provider_id', user.id)
        .eq('client_id', customerId)
        .order('updated_at', { ascending: false });

    const clientName = [profile.first_name, profile.surname].filter(Boolean).join(' ') || 'Customer';
    const primaryAddress =
        jobs?.[0]?.service_address ?? null;

    return (
        <CustomerDetailClient
            customerId={customerId}
            customerName={clientName}
            primaryAddress={primaryAddress}
            jobs={jobs ?? []}
        />
    );
}
