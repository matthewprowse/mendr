import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState, getProviderRole } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import TeamClient, { type TeamMember } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Team' },
    robots: { index: false, follow: false },
};

type MemberRecord = {
    id: string;
    user_id: string | null;
    role: 'owner' | 'admin' | 'member';
    invited_email: string | null;
    status: 'invited' | 'active' | 'removed';
    created_at: string;
};

export default async function ProTeamPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/team');

    const { providerId, pending } = await getProviderState(user.id);
    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Team</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. You can invite your team once your business is verified.'
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
    const { data } = await admin
        .from('provider_members')
        .select('id, user_id, role, invited_email, status, created_at')
        .eq('provider_id', providerId)
        .neq('status', 'removed')
        .order('created_at', { ascending: true });

    const rows = (data ?? []) as MemberRecord[];
    const userIds = rows.map((r) => r.user_id).filter((v): v is string => Boolean(v));
    const names = new Map<string, string>();
    if (userIds.length > 0) {
        const { data: profiles } = await admin
            .from('profiles')
            .select('user_id, first_name, surname')
            .in('user_id', userIds);
        for (const p of (profiles ?? []) as {
            user_id: string;
            first_name: string | null;
            surname: string | null;
        }[]) {
            const name = [p.first_name, p.surname].filter(Boolean).join(' ').trim();
            if (name) names.set(p.user_id, name);
        }
    }

    const members: TeamMember[] = rows.map((r) => ({
        id: r.id,
        role: r.role,
        status: r.status,
        isYou: r.user_id === user.id,
        name: (r.user_id && names.get(r.user_id)) || r.invited_email || 'Pending',
        email: r.invited_email,
    }));

    return <TeamClient members={members} role={role ?? 'member'} />;
}
