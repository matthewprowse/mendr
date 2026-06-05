import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState, getProviderRole } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import { toPlanId } from '@/lib/pro/plans';
import PlanClient from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Plan' },
    robots: { index: false, follow: false },
};

export default async function ProPlanPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/plan');

    const { providerId, pending } = await getProviderState(user.id);
    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Plan</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. You can choose a plan once your business is verified.'
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

    const role = await getProviderRole(user.id, providerId);

    const admin = await createSupabaseAdminClient();
    const [{ data: provider }, { count: seats }] = await Promise.all([
        admin.from('providers').select('plan').eq('id', providerId).maybeSingle(),
        admin
            .from('provider_members')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId)
            .neq('status', 'removed'),
    ]);

    return (
        <PlanClient
            current={toPlanId((provider as { plan?: string } | null)?.plan)}
            seatsUsed={seats ?? 0}
            canManage={role === 'owner'}
        />
    );
}
