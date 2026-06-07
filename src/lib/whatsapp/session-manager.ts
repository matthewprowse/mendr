/* eslint-disable no-console */
/**
 * WhatsApp session read/write layer (Phase A1).
 *
 * Sessions are keyed on phone_number and stored in the `whatsapp_sessions`
 * table. All access goes through the Supabase admin client because the bot is
 * a trusted server-side actor and the table has RLS enabled with no
 * anon/authenticated policies.
 *
 * IMPORTANT: `active_diagnosis_id` references `diagnoses(id)` — there is no
 * `conversations` table.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import type {
    WhatsappSession,
    WhatsappState,
    PendingContractorsState,
    PendingAddressState,
    PendingClarificationState,
} from './types';

/** A sentinel phone number for the "Guest, unregistered" simulator path. */
export const GUEST_PHONE = 'guest';

/** Re-entry resume window: offer to continue an unresolved session within 72h. */
export const RESUME_WINDOW_MS = 72 * 60 * 60 * 1000;

/** Conversation window: after 24h with no activity a new window opens. */
export const CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Debounce window for rapid fragmented messages. */
export const DEBOUNCE_MS = 2000;

type SessionRow = {
    id: string;
    phone_number: string;
    user_id: string | null;
    state: string;
    active_diagnosis_id: string | null;
    pending_contractors: unknown;
    pending_address: unknown;
    pending_clarification: unknown;
    last_message_at: string;
    created_at: string;
};

function rowToSession(row: SessionRow): WhatsappSession {
    return {
        id: row.id,
        phone_number: row.phone_number,
        user_id: row.user_id,
        state: (row.state as WhatsappState) ?? 'idle',
        active_diagnosis_id: row.active_diagnosis_id,
        pending_contractors:
            (row.pending_contractors as PendingContractorsState | null) ?? null,
        pending_address: (row.pending_address as PendingAddressState | null) ?? null,
        pending_clarification:
            (row.pending_clarification as PendingClarificationState | null) ?? null,
        last_message_at: row.last_message_at,
        created_at: row.created_at,
    };
}

const SELECT_COLS =
    'id, phone_number, user_id, state, active_diagnosis_id, pending_contractors, pending_address, pending_clarification, last_message_at, created_at';

/** Fetch a session by phone number, or null when none exists yet. */
export async function getSession(
    phoneNumber: string,
): Promise<WhatsappSession | null> {
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('whatsapp_sessions')
        .select(SELECT_COLS)
        .eq('phone_number', phoneNumber)
        .maybeSingle();
    if (error) {
        console.error('[whatsapp/session] getSession error:', error);
        return null;
    }
    return data ? rowToSession(data as SessionRow) : null;
}

/**
 * Fetch the existing session or create a fresh idle one. Sets `user_id` when
 * provided (the simulator looks this up from the chosen profile).
 */
export async function getOrCreateSession(
    phoneNumber: string,
    userId: string | null,
): Promise<WhatsappSession> {
    const existing = await getSession(phoneNumber);
    if (existing) {
        // Keep user_id in sync if the caller now knows it and the row doesn't.
        if (userId && existing.user_id !== userId) {
            const updated = await updateSession(phoneNumber, { user_id: userId });
            return updated ?? existing;
        }
        return existing;
    }

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('whatsapp_sessions')
        .insert({
            phone_number: phoneNumber,
            user_id: userId,
            state: 'idle',
            last_message_at: new Date().toISOString(),
        })
        .select(SELECT_COLS)
        .single();

    if (error || !data) {
        // Insert race: another concurrent message created it first. Re-read.
        const fallback = await getSession(phoneNumber);
        if (fallback) return fallback;
        throw new Error(
            `[whatsapp/session] failed to create session: ${error?.message ?? 'unknown'}`,
        );
    }
    return rowToSession(data as SessionRow);
}

export interface SessionPatch {
    state?: WhatsappState;
    user_id?: string | null;
    active_diagnosis_id?: string | null;
    pending_contractors?: PendingContractorsState | null;
    pending_address?: PendingAddressState | null;
    pending_clarification?: PendingClarificationState | null;
    /** When true, bump last_message_at to now (default true). */
    touch?: boolean;
}

/** Patch a session and return the updated row. */
export async function updateSession(
    phoneNumber: string,
    patch: SessionPatch,
): Promise<WhatsappSession | null> {
    const admin = await createSupabaseAdminClient();
    const { touch = true, ...fields } = patch;
    const update: Record<string, unknown> = { ...fields };
    if (touch) update.last_message_at = new Date().toISOString();

    const { data, error } = await admin
        .from('whatsapp_sessions')
        .update(update)
        .eq('phone_number', phoneNumber)
        .select(SELECT_COLS)
        .maybeSingle();

    if (error) {
        console.error('[whatsapp/session] updateSession error:', error);
        return null;
    }
    return data ? rowToSession(data as SessionRow) : null;
}

/**
 * Reset a session to idle, clearing all pending state but PRESERVING the
 * `active_diagnosis_id` so the user can resume their last diagnosis. Used by
 * "start over" — the only intentional reset — but note even "start over" keeps
 * the diagnosis row in the DB (it is owned by the user), it just detaches it
 * from the live flow.
 */
export async function resetSession(
    phoneNumber: string,
    opts: { clearDiagnosis?: boolean } = {},
): Promise<WhatsappSession | null> {
    return updateSession(phoneNumber, {
        state: 'idle',
        pending_contractors: null,
        pending_address: null,
        pending_clarification: null,
        ...(opts.clearDiagnosis ? { active_diagnosis_id: null } : {}),
    });
}

/** Milliseconds since the session was last touched. */
export function msSinceLastMessage(session: WhatsappSession): number {
    const last = new Date(session.last_message_at).getTime();
    if (!Number.isFinite(last)) return Number.POSITIVE_INFINITY;
    return Date.now() - last;
}
