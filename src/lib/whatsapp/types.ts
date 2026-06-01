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
}

/** Inbound message into the bot. Mirrors the simulator + future webhook payloads. */
export interface InboundMessage {
    /** Phone number (or "guest" sentinel for the unregistered path). */
    from: string;
    text?: string;
    /** Up to 4 data-URI images. */
    imageDataUri?: string[];
}

/** One outbound WhatsApp message (plain text). */
export interface OutboundMessage {
    text: string;
}

/** Result of running the bot handler for one inbound message. */
export interface BotResult {
    messages: OutboundMessage[];
    /** Resulting state, for the simulator payload view. */
    state: WhatsappState;
}
