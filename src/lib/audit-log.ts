import type { SupabaseClient } from '@supabase/supabase-js';

export type LogCategory = 'AUTH' | 'DIAGNOSTIC' | 'TRANSACTIONAL' | 'SYSTEM' | 'MARKETING';

/** Phase 6: Standard job lifecycle audit actions (non-repudiation) */
export const JOB_AUDIT_ACTIONS = {
    LEAD_ACCEPTED: 'LEAD_ACCEPTED',
    QUOTE_SENT: 'QUOTE_SENT',
    JOB_ACTIVATED: 'JOB_ACTIVATED',
    JOB_COMPLETED: 'JOB_COMPLETED',
    PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
    PAYMENT_PROOF_UPLOADED: 'PAYMENT_PROOF_UPLOADED',
} as const;

export type JobAuditAction = (typeof JOB_AUDIT_ACTIONS)[keyof typeof JOB_AUDIT_ACTIONS];

export interface ScandioEvent {
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

export async function logScandioEvent(
    supabase: SupabaseClient,
    event: ScandioEvent,
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

/**
 * Phase 6: Log a job lifecycle or finance audit event (non-repudiation).
 * Call on every status change: Lead → Quoted, Quoted → Active, Active → Completed,
 * and on is_paid / payment_proof updates.
 */
export async function logJobAudit(
    supabase: SupabaseClient,
    action: JobAuditAction | string,
    jobId: string,
    payload?: Record<string, unknown>,
    options?: { metadata?: ClientMetadata; headers?: Headers }
): Promise<{ error: Error | null }> {
    return logScandioEvent(
        supabase,
        {
            action,
            type: 'TRANSACTIONAL',
            entityType: 'job',
            entityId: jobId,
            payload: payload ?? undefined,
        },
        options
    );
}
