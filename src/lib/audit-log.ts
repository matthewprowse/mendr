import type { SupabaseClient } from '@supabase/supabase-js';

export type LogCategory = 'AUTH' | 'DIAGNOSTIC' | 'TRANSACTIONAL' | 'SYSTEM' | 'MARKETING';

export interface MendrEvent {
    action: string;
    type: LogCategory;
    entityId?: string;
    entityType?: string;
    payload?: unknown;
}

export interface ClientMetadata {
    ip?: string;
    user_agent?: string;
    geo_lat?: number;
    geo_lng?: number;
}

export async function getClientMetadata(options?: {
    headers?: Headers;
}): Promise<ClientMetadata> {
    const meta: ClientMetadata = {};

    if (typeof navigator !== 'undefined') {
        meta.user_agent = navigator.userAgent;
    }

    const headers = options?.headers;
    if (headers) {
        const forwarded = headers.get('x-forwarded-for');
        const realIp = headers.get('x-real-ip');
        meta.ip = forwarded?.split(',')[0]?.trim() || realIp || undefined;
        if (!meta.user_agent) {
            meta.user_agent = headers.get('user-agent') || undefined;
        }
    }

    return meta;
}

export async function logMendrEvent(
    supabase: SupabaseClient,
    event: MendrEvent,
    options?: { metadata?: ClientMetadata; headers?: Headers }
): Promise<{ error: Error | null }> {
    try {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        const metadata =
            options?.metadata ?? (await getClientMetadata({ headers: options?.headers }));

        const { error } = await supabase.from('audit_logs').insert({
            user_id: user?.id ?? null,
            event_type: event.type,
            action: event.action,
            entity_id: event.entityId ?? null,
            entity_type: event.entityType ?? null,
            payload: event.payload ?? null,
            metadata: metadata ?? null,
        });

        if (error) return { error };
        return { error: null };
    } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
    }
}
