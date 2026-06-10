/**
 * Shared types for the WhatsApp bot simulator (Phase A).
 *
 * These types are deliberately framework-agnostic: nothing here imports Next
 * or Meta. The same `bot-handler` that powers the browser simulator will power
 * the Meta webhook adapter in Phase C, so the input/output contract is plain
 * data.
 */

/** Conversation state machine states (mirrors the whatsapp_sessions.state column). */
export type WhatsappState =
    | 'idle'
    | 'diagnosing'
    | 'awaiting_clarification'
    | 'awaiting_address'
    | 'awaiting_contractor_choice'
    | 'contact_initiated';

/**
 * A clarification option currently presented to the user. Persisted on the
 * session so the forgiving parser can map a reply back to a hypothesis chip
 * even across re-entry.
 */
export interface PendingClarificationOption {
    /** 1-based position shown to the user. */
    index: number;
    /** Hypothesis id (h1/h2/...) this chip belongs to. */
    hypothesisId: string;
    /** Chip id (c1/c2/...). */
    chipId: string;
    /** The chip text shown to the user — also the refinement follow-up text. */
    text: string;
}

/** A contractor option presented in the numbered list. */
export interface PendingContractor {
    index: number;
    /** Internal providers.id when this is a registered provider (sellable lead). */
    providerId: string | null;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
}

/** A saved-address option presented in the numbered list. */
export interface PendingAddressOption {
    index: number;
    /** Saved location id, or a sentinel for the "enter a different address" row. */
    id: string;
    label: string;
    address: string;
    lat: number | null;
    lng: number | null;
    /** True for the synthetic "Enter a different address" / web-form row. */
    isOther?: boolean;
}

/** The JSONB blob stored in whatsapp_sessions.pending_address. */
export interface PendingAddressState {
    /** Options shown to the user (saved locations + the "other" row). */
    options: PendingAddressOption[];
    /** The trade / tradeDetail to search once an address is chosen. */
    trade: string;
    tradeDetail: string;
}

/** The JSONB blob stored in whatsapp_sessions.pending_contractors. */
export interface PendingContractorsState {
    contractors: PendingContractor[];
    /** Trade label carried through so the lead row records diagnosis_trade. */
    trade: string;
    /** 0-based page currently shown (MORE paging). Absent = 0. */
    page?: number;
}

/** The JSONB blob stored in whatsapp_sessions.pending_clarification. */
export interface PendingClarificationState {
    /** Short intro line shown above the options. */
    intro: string;
    /** Free-text escape prompt ("none of these match …"). */
    escapePrompt: string;
    options: PendingClarificationOption[];
}

/** Row shape of whatsapp_sessions. */
export interface WhatsappSession {
    id: string;
    phone_number: string;
    user_id: string | null;
    state: WhatsappState;
    active_diagnosis_id: string | null;
    pending_contractors: PendingContractorsState | null;
    pending_address: PendingAddressState | null;
    pending_clarification: PendingClarificationState | null;
    last_message_at: string;
    created_at: string;
    /** Set when a resume nudge template went out for the current stall. */
    resume_prompted_at: string | null;
}

/** Inbound message into the bot. Mirrors the simulator + future webhook payloads. */
export interface InboundMessage {
    /** Phone number (or "guest" sentinel for the unregistered path). */
    from: string;
    text?: string;
    /** Up to 4 data-URI images. */
    imageDataUri?: string[];
}

/** An option the channel may render as a native button or list row. */
export interface OutboundOption {
    /** Echoed back on tap. The bot uses the numeric option index as a string. */
    id: string;
    /** Visible label (channel truncates: buttons 20 chars, list rows 24). */
    title: string;
    description?: string;
}

/**
 * One outbound WhatsApp message. `text` is always populated and is the full
 * fallback rendering (numbered lists included), used by the simulator and by
 * channels without interactive support. When `options` is present, a real
 * channel renders `interactiveBody` (the prompt without the numbered list)
 * with native reply buttons (≤3 options) or a list message (≤10) instead.
 */
export interface OutboundMessage {
    text: string;
    options?: OutboundOption[];
    interactiveBody?: string;
    listButtonLabel?: string;
}

/** Result of running the bot handler for one inbound message. */
export interface BotResult {
    messages: OutboundMessage[];
    /** Resulting state, for the simulator payload view. */
    state: WhatsappState;
}
