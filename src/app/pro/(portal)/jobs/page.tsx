import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import JobsClient, { type JobRow } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Jobs' },
    robots: { index: false, follow: false },
};

type CustomerRef = { name: string | null };
type JobRecord = {
    id: string;
    title: string | null;
    site_address: string | null;
    status: JobRow['status'];
    scheduled_for: string | null;
    created_at: string;
    provider_customers: CustomerRef | CustomerRef[] | null;
};

export default async function ProJobsPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/jobs');

    const { providerId, pending } = await getProviderState(user.id);
    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Jobs</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. Your jobs will appear here once your business is verified.'
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
        .from('jobs')
        .select('id, title, site_address, status, scheduled_for, created_at, provider_customers(name)')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });

    const rows: JobRow[] = ((data ?? []) as JobRecord[]).map((j) => {
        const cust = Array.isArray(j.provider_customers) ? j.provider_customers[0] : j.provider_customers;
        return {
            id: j.id,
            title: j.title ?? 'Job',
            siteAddress: j.site_address,
            status: j.status,
            scheduledFor: j.scheduled_for,
            customerName: cust?.name ?? null,
        };
    });

    return <JobsClient rows={rows} />;
}
