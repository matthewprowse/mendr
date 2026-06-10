/* eslint-disable no-console */
/**
 * Opt-out persistence (Phase C, Workstream 6).
 *
 * "stop" suppresses all PROACTIVE sends (templates, follow-ups, resume
 * nudges). Per WhatsApp policy we may still answer messages the user sends to
 * us. "start" lifts the suppression. Rows live in `whatsapp_opt_outs`.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export async function recordOptOut(phone: string): Promise<void> {
    try {
        const admin = await createSupabaseAdminClient();
        await admin
            .from('whatsapp_opt_outs')
            .upsert({ phone_number: phone }, { onConflict: 'phone_number' });
    } catch (e) {
        console.error('[whatsapp/opt-out] recordOptOut failed', e);
    }
}

export async function clearOptOut(phone: string): Promise<void> {
    try {
        const admin = await createSupabaseAdminClient();
        await admin.from('whatsapp_opt_outs').delete().eq('phone_number', phone);
    } catch (e) {
        console.error('[whatsapp/opt-out] clearOptOut failed', e);
    }
}

/** Fail-open (false) on errors: a DB blip must not block normal replies. */
export async function isOptedOut(phone: string): Promise<boolean> {
    try {
        const admin = await createSupabaseAdminClient();
        const { data } = await admin
            .from('whatsapp_opt_outs')
            .select('phone_number')
            .eq('phone_number', phone)
            .maybeSingle();
        return Boolean(data);
    } catch (e) {
        console.error('[whatsapp/opt-out] isOptedOut failed', e);
        return false;
    }
}
