/**
 * GET   /api/pro/settings — business profile + this teammate's notifications.
 * PATCH /api/pro/settings — update the business profile (owner / admin only)
 *       and / or this teammate's own notification preferences (any role).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import {
    getClaimedProviderId,
    getProviderRole,
    type ProviderRole,
} from '@/lib/providers/claimed-provider';

const CONTACT_CHANNELS = ['email', 'whatsapp', 'sms', 'phone'];
const NOTIFY_CHANNELS = ['email', 'whatsapp', 'sms'];

async function resolve(): Promise<
    { providerId: string; userId: string; role: ProviderRole } | NextResponse
> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const providerId = await getClaimedProviderId(user.id);
    if (!providerId)
        return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });
    const role = await getProviderRole(user.id, providerId);
    if (!role) return NextResponse.json({ error: 'Not on this team.' }, { status: 403 });
    return { providerId, userId: user.id, role };
}

export async function GET(): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const admin = await createSupabaseAdminClient();
    const [{ data: provider }, { data: prefs }] = await Promise.all([
        admin
            .from('providers')
            .select(
                'insurance_cover, typical_response_time, pricing_model, callout_fee, preferred_contact_channel, notify_realtime',
            )
            .eq('id', ctx.providerId)
            .maybeSingle(),
        admin
            .from('provider_notification_preferences')
            .select(
                'new_enquiry, new_review, weekly_summary, quiet_hours_start, quiet_hours_end, preferred_channel',
            )
            .eq('provider_id', ctx.providerId)
            .eq('user_id', ctx.userId)
            .maybeSingle(),
    ]);

    return NextResponse.json({
        role: ctx.role,
        profile: provider ?? {},
        notifications: prefs ?? {
            new_enquiry: true,
            new_review: true,
            weekly_summary: true,
            quiet_hours_start: null,
            quiet_hours_end: null,
            preferred_channel: 'email',
        },
    });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const body = (await req.json().catch(() => ({}))) as {
        profile?: Record<string, unknown>;
        notifications?: Record<string, unknown>;
    };
    const admin = await createSupabaseAdminClient();
    const now = new Date().toISOString();

    // --- Business profile (owner / admin only) ---
    if (body.profile) {
        if (ctx.role !== 'owner' && ctx.role !== 'admin') {
            return NextResponse.json(
                { error: 'Only owners and admins can edit the business profile.' },
                { status: 403 },
            );
        }
        const p = body.profile;
        const update: Record<string, unknown> = {};
        if (p.insurance_cover !== undefined)
            update.insurance_cover =
                typeof p.insurance_cover === 'string'
                    ? p.insurance_cover.slice(0, 500) || null
                    : null;
        if (p.typical_response_time !== undefined)
            update.typical_response_time =
                typeof p.typical_response_time === 'string'
                    ? p.typical_response_time.slice(0, 200) || null
                    : null;
        if (p.pricing_model !== undefined)
            update.pricing_model =
                typeof p.pricing_model === 'string'
                    ? p.pricing_model.slice(0, 200) || null
                    : null;
        if (p.callout_fee !== undefined) {
            const n = Number(p.callout_fee);
            update.callout_fee = Number.isFinite(n) && n >= 0 ? n : null;
        }
        if (p.preferred_contact_channel !== undefined)
            update.preferred_contact_channel =
                typeof p.preferred_contact_channel === 'string' &&
                CONTACT_CHANNELS.includes(p.preferred_contact_channel)
                    ? p.preferred_contact_channel
                    : null;
        if (typeof p.notify_realtime === 'boolean') update.notify_realtime = p.notify_realtime;

        if (Object.keys(update).length > 0) {
            const { error } = await admin
                .from('providers')
                .update(update)
                .eq('id', ctx.providerId);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    // --- Notification preferences (own row, any role) ---
    if (body.notifications) {
        const n = body.notifications;
        const row: Record<string, unknown> = {
            provider_id: ctx.providerId,
            user_id: ctx.userId,
            updated_at: now,
        };
        if (typeof n.new_enquiry === 'boolean') row.new_enquiry = n.new_enquiry;
        if (typeof n.new_review === 'boolean') row.new_review = n.new_review;
        if (typeof n.weekly_summary === 'boolean') row.weekly_summary = n.weekly_summary;
        if (n.quiet_hours_start !== undefined) {
            const h = Number(n.quiet_hours_start);
            row.quiet_hours_start = Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
        }
        if (n.quiet_hours_end !== undefined) {
            const h = Number(n.quiet_hours_end);
            row.quiet_hours_end = Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
        }
        if (
            typeof n.preferred_channel === 'string' &&
            NOTIFY_CHANNELS.includes(n.preferred_channel)
        )
            row.preferred_channel = n.preferred_channel;

        const { error } = await admin
            .from('provider_notification_preferences')
            .upsert(row, { onConflict: 'provider_id,user_id' });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
