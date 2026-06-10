import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState, getProviderRole } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import SettingsClient, { type ProfileSettings, type NotificationSettings } from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Settings' },
    robots: { index: false, follow: false },
};

export default async function ProSettingsPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/settings');

    const { providerId, pending } = await getProviderState(user.id);
    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. Settings unlock once your business is verified.'
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
    const [{ data: provider }, { data: prefs }] = await Promise.all([
        admin
            .from('providers')
            .select(
                'insurance_cover, typical_response_time, pricing_model, callout_fee, preferred_contact_channel, notify_realtime',
            )
            .eq('id', providerId)
            .maybeSingle(),
        admin
            .from('provider_notification_preferences')
            .select(
                'new_enquiry, new_review, weekly_summary, quiet_hours_start, quiet_hours_end, preferred_channel',
            )
            .eq('provider_id', providerId)
            .eq('user_id', user.id)
            .maybeSingle(),
    ]);

    const p = (provider ?? {}) as Partial<ProfileSettings>;
    const profile: ProfileSettings = {
        insurance_cover: p.insurance_cover ?? '',
        typical_response_time: p.typical_response_time ?? '',
        pricing_model: p.pricing_model ?? '',
        callout_fee: p.callout_fee ?? null,
        preferred_contact_channel: p.preferred_contact_channel ?? '',
        notify_realtime: Boolean(p.notify_realtime),
    };

    const n = (prefs ?? {}) as Partial<NotificationSettings>;
    const notifications: NotificationSettings = {
        new_enquiry: n.new_enquiry ?? true,
        new_review: n.new_review ?? true,
        weekly_summary: n.weekly_summary ?? true,
        quiet_hours_start: n.quiet_hours_start ?? null,
        quiet_hours_end: n.quiet_hours_end ?? null,
        preferred_channel: n.preferred_channel ?? 'email',
    };

    return (
        <SettingsClient
            profile={profile}
            notifications={notifications}
            canEditProfile={role === 'owner' || role === 'admin'}
        />
    );
}
