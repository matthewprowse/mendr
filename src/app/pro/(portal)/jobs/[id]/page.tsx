import { notFound, redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';
import JobDetailClient, { type JobDetail } from './client';
import type { JobStatus } from '../client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Job' },
    robots: { index: false, follow: false },
};

type CustomerRef = { name: string | null };
type JobRecord = {
    id: string;
    provider_id: string;
    title: string | null;
    site_address: string | null;
    status: JobStatus;
    scheduled_for: string | null;
    contact_event_id: string | null;
    provider_customers: CustomerRef | CustomerRef[] | null;
};

export default async function JobDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/pro/auth/login?next=/pro/jobs/${id}`);

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) notFound();

    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('jobs')
        .select(
            'id, provider_id, title, site_address, status, scheduled_for, contact_event_id, provider_customers(name)'
        )
        .eq('id', id)
        .maybeSingle();
    const j = data as JobRecord | null;
    if (!j || j.provider_id !== providerId) notFound();

    const cust = Array.isArray(j.provider_customers) ? j.provider_customers[0] : j.provider_customers;

    const detail: JobDetail = {
        id: j.id,
        title: j.title ?? '',
        siteAddress: j.site_address ?? '',
        status: j.status,
        scheduledDate: j.scheduled_for ? j.scheduled_for.slice(0, 10) : '',
        customerName: cust?.name ?? null,
        contactEventId: j.contact_event_id,
    };

    return <JobDetailClient detail={detail} />;
}
