/**
 * Conversation state machine + the full forgiving parser and robustness rules
 * (Phase A4).
 *
 * Takes an inbound message plus the current session and returns the outbound
 * messages, routing by state. Implements every flow in Conversation Design:
 * registration gate, diagnosis, clarification, address selection, contractor
 * selection (with the provider_contact_events write via /api/contact/contractor),
 * re-entry, and free-text handling.
 *
 * THE ONE RULE governs everything: an unrecognised message must never wipe the
 * session, restart the flow, or make the user feel they failed.
 */

import type { DiagnosisData } from '@/features/diagnosis/types';
import {
    getOrCreateSession,
    updateSession,
    resetSession,
    msSinceLastMessage,
    RESUME_WINDOW_MS,
    GUEST_PHONE,
} from './session-manager';
import {
    runWhatsappDiagnosis,
    setDiagnosisLocation,
} from './diagnosis-runner';
import { matchContractors, logContractorLead } from './contractor-matcher';
import { getSavedLocations } from './profile';
import {
    detectGlobalCommand,
    resolveOption,
    resolveYesNo,
    looksLikeQuestion,
    looksConfusedOrFrustrated,
    type ParserOption,
    type IntentClassifier,
} from './forgiving-parser';
import { classifyIntent } from './intent-classifier';
import * as fmt from './message-formatter';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import type {
    InboundMessage,
    BotResult,
    OutboundMessage,
    WhatsappSession,
    PendingClarificationOption,
    PendingClarificationState,
    PendingContractor,
    PendingAddressOption,
} from './types';

/** Sentinel id for the "Enter a different address" row. */
const OTHER_ADDRESS_ID = '__other__';

/** Contractors shown per message page. */
const CONTRACTORS_PER_PAGE = 3;

export interface HandleMessageDeps {
    /** Layer-2 intent classifier (injectable for tests). */
    classifier?: IntentClassifier;
    /** Origin for internal API calls (providers, contact). */
    requestOrigin?: string | null;
}

function out(text: string): OutboundMessage {
    return { text };
}

/**
 * Heuristic: a text reply that reads like a new/different problem rather than a
 * Yes/No to the contractor offer. Used to surface the topic-change offer that
 * preserves the existing diagnosis rather than silently discarding it.
 */
function looksLikeNewProblem(text: string): boolean {
    const t = text.toLowerCase();
    if (t.length < 8) return false;
    return /\b(also|actually|another|new|instead|leaking|broken|not working|tripping|stuck|cracked|geyser|gate|door|pipe|tap|drain|light|switch|wall|roof|pump)\b/.test(
        t,
    );
}

// ── structured_clarification extraction ──────────────────────────────────────

interface RawChip {
    id?: unknown;
    text?: unknown;
    effect?: unknown;
}
interface RawHypothesis {
    id?: unknown;
    label?: unknown;
    answer_chips?: unknown;
}
interface RawStructuredClarification {
    intro?: unknown;
    escape?: { prompt?: unknown };
    hypotheses?: unknown;
}

/**
 * Flatten the structured_clarification hypotheses into a single numbered list
 * of chips. Each chip becomes a selectable option carrying its hypothesis +
 * chip ids, so a selection can be fed back into the refinement path.
 */
export function extractClarificationOptions(
    data: DiagnosisData,
): PendingClarificationState | null {
    const sc = (data as unknown as { structured_clarification?: RawStructuredClarification })
        .structured_clarification;
    if (!sc || typeof sc !== 'object') {
        // Fall back to the flat clarification_questions list.
        const flat = Array.isArray(data.clarification_questions)
            ? data.clarification_questions.filter(
                  (s): s is string => typeof s === 'string' && s.trim().length > 0,
              )
            : [];
        if (flat.length === 0) return null;
        return {
            intro: 'A quick question will help me confirm this:',
            escapePrompt:
                "Doesn't match? Tell me what you're seeing in your own words.",
            options: flat.map((text, i) => ({
                index: i + 1,
                hypothesisId: 'h1',
                chipId: `c${i + 1}`,
                text: text.trim(),
            })),
        };
    }

    const hyps = Array.isArray(sc.hypotheses) ? (sc.hypotheses as RawHypothesis[]) : [];
    const options: PendingClarificationOption[] = [];
    let idx = 1;
    for (const h of hyps) {
        const hid = typeof h.id === 'string' ? h.id : `h${idx}`;
        const chips = Array.isArray(h.answer_chips) ? (h.answer_chips as RawChip[]) : [];
        for (const c of chips) {
            const text = typeof c.text === 'string' ? c.text.trim() : '';
            if (!text) continue;
            options.push({
                index: idx,
                hypothesisId: hid,
                chipId: typeof c.id === 'string' ? c.id : `c${idx}`,
                text,
            });
            idx += 1;
        }
    }
    if (options.length === 0) return null;
    return {
        intro: typeof sc.intro === 'string' ? sc.intro : '',
        escapePrompt:
            typeof sc.escape?.prompt === 'string'
                ? (sc.escape.prompt as string)
                : "Doesn't match? Tell me what you're seeing in your own words.",
        options,
    };
}

function clarificationOptionsToParser(
    state: PendingClarificationState,
): ParserOption[] {
    return state.options.map((o) => ({ index: o.index, text: o.text }));
}

// ── Post-diagnosis routing ───────────────────────────────────────────────────

/**
 * After a diagnosis runs, decide what to send and which state to enter.
 * - requires_clarification with options → awaiting_clarification
 * - requires_clarification, no usable options, has photo_request → re-prompt for photo, stay diagnosing
 * - committed → summary + contractor offer, idle (offer pending)
 */
async function presentDiagnosis(
    phone: string,
    diagnosisId: string,
    data: DiagnosisData,
): Promise<{ messages: OutboundMessage[]; state: WhatsappSession['state'] }> {
    if (data.requires_clarification) {
        const clar = extractClarificationOptions(data);
        if (clar && clar.options.length > 0) {
            await updateSession(phone, {
                state: 'awaiting_clarification',
                active_diagnosis_id: diagnosisId,
                pending_clarification: clar,
            });
            return {
                messages: [out(fmt.formatClarification(clar.intro, clar.options))],
                state: 'awaiting_clarification',
            };
        }
        // No usable hypotheses — fall back to a photo request, stay diagnosing.
        await updateSession(phone, {
            state: 'diagnosing',
            active_diagnosis_id: diagnosisId,
            pending_clarification: null,
        });
        return {
            messages: [out(fmt.formatPhotoRequest(String(data.photo_request ?? '')))],
            state: 'diagnosing',
        };
    }

    // Committed diagnosis: two-message summary, then the contractor offer.
    // We mark the offer as pending via an empty `pending_contractors` list so a
    // following Yes/No is routed to the offer reply rather than a new diagnosis.
    await updateSession(phone, {
        state: 'idle',
        active_diagnosis_id: diagnosisId,
        pending_clarification: null,
        pending_contractors: { contractors: [], trade: diagnosisTrade(data) },
        pending_address: null,
    });
    const summary = fmt.formatDiagnosisSummary(data, diagnosisId);
    return {
        messages: [...summary.map(out), out(fmt.formatContractorOffer())],
        state: 'idle',
    };
}

// ── Diagnosis loading ────────────────────────────────────────────────────────

async function loadDiagnosis(
    diagnosisId: string,
): Promise<DiagnosisData | null> {
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('diagnoses')
        .select('diagnosis')
        .eq('id', diagnosisId)
        .maybeSingle();
    if (error || !data) return null;
    return (data.diagnosis as DiagnosisData) ?? null;
}

function diagnosisTitle(data: DiagnosisData | null): string {
    return data && typeof data.diagnosis === 'string' ? data.diagnosis : '';
}

function diagnosisTrade(data: DiagnosisData | null): string {
    return data && typeof data.trade === 'string' ? data.trade : '';
}

// ── Address selection helpers ─────────────────────────────────────────────────

async function beginAddressSelection(
    session: WhatsappSession,
    data: DiagnosisData | null,
): Promise<{ messages: OutboundMessage[]; state: WhatsappSession['state'] }> {
    const trade = diagnosisTrade(data);
    const tradeDetail =
        data && typeof data.trade_detail === 'string' ? data.trade_detail : '';

    const locations = session.user_id
        ? await getSavedLocations(session.user_id)
        : [];

    if (locations.length === 0) {
        // No saved addresses → send them to the web form, stay awaiting_address.
        await updateSession(session.phone_number, {
            state: 'awaiting_address',
            pending_address: { options: [], trade, tradeDetail },
        });
        return {
            messages: [out(fmt.formatNoAddressPrompt())],
            state: 'awaiting_address',
        };
    }

    const options: PendingAddressOption[] = locations.map((l, i) => ({
        index: i + 1,
        id: l.id,
        label: l.label,
        address: l.address,
        lat: l.lat,
        lng: l.lng,
    }));
    options.push({
        index: options.length + 1,
        id: OTHER_ADDRESS_ID,
        label: 'Enter a different address',
        address: '',
        lat: null,
        lng: null,
        isOther: true,
    });

    await updateSession(session.phone_number, {
        state: 'awaiting_address',
        pending_address: { options, trade, tradeDetail },
    });
    return {
        messages: [out(fmt.formatAddressSelection(options))],
        state: 'awaiting_address',
    };
}

async function runContractorSearch(
    session: WhatsappSession,
    chosen: PendingAddressOption,
    deps: HandleMessageDeps,
): Promise<{ messages: OutboundMessage[]; state: WhatsappSession['state'] }> {
    const pending = session.pending_address;
    const trade = pending?.trade ?? '';
    const tradeDetail = pending?.tradeDetail ?? '';

    if (chosen.lat == null || chosen.lng == null) {
        // Saved address without coordinates — cannot geocode reliably from text.
        return {
            messages: [out(fmt.formatNoAddressPrompt())],
            state: 'awaiting_address',
        };
    }

    // Copy the chosen coordinates onto the diagnosis — matching keys off these.
    if (session.active_diagnosis_id) {
        await setDiagnosisLocation(session.active_diagnosis_id, {
            lat: chosen.lat,
            lng: chosen.lng,
            address: chosen.address || null,
        });
    }

    const contractors = await matchContractors({
        lat: chosen.lat,
        lng: chosen.lng,
        trade,
        tradeDetail,
        requestOrigin: deps.requestOrigin,
    });

    if (contractors.length === 0) {
        await updateSession(session.phone_number, {
            state: 'idle',
            pending_address: null,
        });
        return {
            messages: [
                out(
                    'I could not find contractors near that address right now. You can try a different address, or check back later.',
                ),
            ],
            state: 'idle',
        };
    }

    const firstPage = contractors.slice(0, CONTRACTORS_PER_PAGE);
    await updateSession(session.phone_number, {
        state: 'awaiting_contractor_choice',
        pending_address: null,
        pending_contractors: { contractors, trade },
    });
    return {
        messages: [out(fmt.formatContractorList(trade, firstPage))],
        state: 'awaiting_contractor_choice',
    };
}

// ── Main entry ─────────────────────────────────────────────────────────────

/**
 * Handle one inbound message. Loads/creates the session, applies global
 * commands and re-entry rules, then routes by state.
 */
export async function handleMessage(
    inbound: InboundMessage,
    deps: HandleMessageDeps = {},
): Promise<BotResult> {
    const classifier = deps.classifier ?? classifyIntent;
    const phone = inbound.from;
    const text = (inbound.text ?? '').trim();
    const images = (inbound.imageDataUri ?? []).filter(
        (s) => typeof s === 'string' && s.trim().length > 0,
    );

    // Resolve the owning user for this phone (null for guest / unregistered).
    const userId = await resolveUserId(phone);
    const session = await getOrCreateSession(phone, userId);

    // ── Global commands (work from any state, bypass the state machine) ──────
    const cmd = text ? detectGlobalCommand(text) : null;
    if (cmd) {
        return handleGlobalCommand(cmd, session);
    }

    // ── Registration gate for unknown numbers ────────────────────────────────
    // The bot needs a Mendr account to own the diagnosis + count quota.
    if (!session.user_id) {
        return {
            messages: [out(fmt.formatRegistrationGate())],
            state: session.state,
        };
    }

    // ── Re-entry / resume handling ────────────────────────────────────────────
    // Within a fresh conversation window we just continue. If there is an
    // unresolved session beyond the conversation window but inside 72h, offer to
    // resume. We treat "continue"/"new" via the forgiving yes/no when offered.
    // (Continuation is implicit here: the state below drives behaviour.)

    // ── First contact / nothing actionable ───────────────────────────────────
    if (!text && images.length === 0) {
        return {
            messages: [out(fmt.formatFirstContact())],
            state: session.state,
        };
    }

    // ── Route by state ────────────────────────────────────────────────────────
    switch (session.state) {
        case 'idle':
        case 'diagnosing': {
            // A contractor offer is pending when there is an active diagnosis and
            // an (empty) pending_contractors marker. A text-only Yes/No routes to
            // the offer; anything else (or a new photo) starts a new turn — which
            // for an active diagnosis is a topic-change / refinement that
            // preserves the existing diagnosis row.
            const offerPending =
                session.state === 'idle' &&
                Boolean(session.active_diagnosis_id) &&
                session.pending_contractors !== null &&
                session.pending_contractors.contractors.length === 0;
            if (offerPending && text && images.length === 0) {
                const offerResult = await handleContractorOfferReply(
                    session,
                    text,
                    classifier,
                    deps,
                );
                if (offerResult) {
                    // Clear the offer marker once resolved.
                    if (offerResult.state !== 'awaiting_address') {
                        await updateSession(session.phone_number, {
                            pending_contractors: null,
                        });
                    }
                    return offerResult;
                }
                // Yes/No unclear and it does not look like a new problem → re-ask.
                const lastData = session.active_diagnosis_id
                    ? await loadDiagnosis(session.active_diagnosis_id)
                    : null;
                if (!looksLikeNewProblem(text)) {
                    return {
                        messages: [out(fmt.formatReprompt(fmt.formatContractorOffer()))],
                        state: 'idle',
                    };
                }
                // Looks like a new problem → topic-change offer, preserve diagnosis.
                return {
                    messages: [out(fmt.formatTopicChangeOffer(diagnosisTitle(lastData)))],
                    state: 'idle',
                };
            }
            return handleIdleOrDiagnosing(session, text, images, classifier);
        }
        case 'awaiting_clarification':
            return handleAwaitingClarification(session, text, images, classifier, deps);
        case 'awaiting_address':
            return handleAwaitingAddress(session, text, images, classifier, deps);
        case 'awaiting_contractor_choice':
            return handleAwaitingContractorChoice(session, text, images, classifier, deps);
        case 'contact_initiated':
            // After contact, a new message is treated as a fresh diagnosis input.
            return handleIdleOrDiagnosing(session, text, images, classifier);
        default:
            return handleIdleOrDiagnosing(session, text, images, classifier);
    }
}

/** Resolve which Mendr user a phone number belongs to. */
async function resolveUserId(phone: string): Promise<string | null> {
    if (phone === GUEST_PHONE) return null;
    // The simulator passes a profile id directly as `from` when "simulating as"
    // a registered user; a real phone would be looked up against a verified
    // phone column (Phase C). We accept a UUID `from` as the user id.
    if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(phone)
    ) {
        return phone;
    }
    return null;
}

// ── State handlers ────────────────────────────────────────────────────────────

function handleGlobalCommand(
    cmd: ReturnType<typeof detectGlobalCommand>,
    session: WhatsappSession,
): BotResult {
    switch (cmd) {
        case 'help':
        case 'menu':
            return { messages: [out(fmt.formatHelp())], state: session.state };
        case 'start_over':
            // The only intentional reset. Preserve the diagnosis row (owned by
            // the user) but detach pending flow state.
            void resetSession(session.phone_number, { clearDiagnosis: true });
            return { messages: [out(fmt.formatStartOver())], state: 'idle' };
        case 'stop':
            return { messages: [out(fmt.formatStop())], state: session.state };
        case 'human':
            return { messages: [out(fmt.formatHumanEscape())], state: session.state };
        default:
            return { messages: [out(fmt.formatHelp())], state: session.state };
    }
}

async function handleIdleOrDiagnosing(
    session: WhatsappSession,
    text: string,
    images: string[],
    _classifier: IntentClassifier,
): Promise<BotResult> {
    // Mid-flow topic change is handled per-state; in idle/diagnosing any new
    // photo/description starts (or refines) a diagnosis. When there is an active
    // committed diagnosis and the user sends a follow-up, treat it as a
    // refinement that PRESERVES the existing diagnosis (a new row is created and
    // becomes active, the old row remains in the DB).
    const hasActive = Boolean(session.active_diagnosis_id);
    const previous = hasActive
        ? await loadDiagnosis(session.active_diagnosis_id as string)
        : null;

    await updateSession(session.phone_number, { state: 'diagnosing' });

    const history =
        hasActive && previous
            ? [
                  {
                      role: 'assistant' as const,
                      content: `Previous diagnosis: ${diagnosisTitle(previous)}`,
                  },
              ]
            : [];

    const outcome = await runWhatsappDiagnosis({
        phoneNumber: session.phone_number,
        userId: session.user_id,
        text,
        images,
        history,
        previousDiagnosis: previous,
    });

    if (!outcome.ok) {
        if (outcome.reason === 'quota_exceeded') {
            await updateSession(session.phone_number, { state: 'idle' });
            return {
                messages: [
                    out(
                        'You have reached the daily diagnosis limit. Please try again tomorrow, or view your existing reports on the website.',
                    ),
                ],
                state: 'idle',
            };
        }
        await updateSession(session.phone_number, { state: 'idle' });
        return {
            messages: [
                out(
                    'Something went wrong analysing that. Please try again in a moment, or send a clearer photo.',
                ),
            ],
            state: 'idle',
        };
    }

    const presented = await presentDiagnosis(
        session.phone_number,
        outcome.result.diagnosisId,
        outcome.result.data,
    );
    return { messages: presented.messages, state: presented.state };
}

async function handleAwaitingClarification(
    session: WhatsappSession,
    text: string,
    images: string[],
    classifier: IntentClassifier,
    _deps: HandleMessageDeps,
): Promise<BotResult> {
    const clar = session.pending_clarification;

    // A new photo mid-clarification is a refinement input — run it as a new
    // diagnosis turn (preserving the existing diagnosis row).
    if (images.length > 0) {
        return handleIdleOrDiagnosing(session, text, images, classifier);
    }

    if (!clar || clar.options.length === 0) {
        // Stuck state with no options — re-orient by running a fresh diagnosis
        // from the text rather than dead-ending.
        return handleIdleOrDiagnosing(session, text, images, classifier);
    }

    const options = clarificationOptionsToParser(clar);

    // Question instead of an answer → answer briefly, then re-ask.
    if (looksLikeQuestion(text)) {
        return {
            messages: [
                out(
                    'Good question. Answering the option below helps me give you the most accurate diagnosis at no cost. ' +
                        fmt.formatClarification(clar.intro, clar.options),
                ),
            ],
            state: 'awaiting_clarification',
        };
    }

    const resolved = await resolveOption(text, options, classifier);
    if (resolved.kind === 'unclear') {
        // Layer 3 gentle re-prompt — never reset.
        return {
            messages: [
                out(fmt.formatReprompt(fmt.formatClarification(clar.intro, clar.options))),
            ],
            state: 'awaiting_clarification',
        };
    }

    // Feed the chosen chip text into the refinement path.
    const chosen = clar.options.find((o) => o.index === resolved.index);
    const chipText = chosen?.text ?? text;
    const previous = session.active_diagnosis_id
        ? await loadDiagnosis(session.active_diagnosis_id)
        : null;

    await updateSession(session.phone_number, {
        state: 'diagnosing',
        pending_clarification: null,
    });

    const outcome = await runWhatsappDiagnosis({
        phoneNumber: session.phone_number,
        userId: session.user_id,
        text: chipText,
        history: previous
            ? [
                  {
                      role: 'assistant' as const,
                      content: `Previous diagnosis: ${diagnosisTitle(previous)}`,
                  },
                  { role: 'user' as const, content: chipText },
              ]
            : [{ role: 'user' as const, content: chipText }],
        previousDiagnosis: previous,
    });

    if (!outcome.ok) {
        await updateSession(session.phone_number, { state: 'idle' });
        return {
            messages: [
                out('Something went wrong. Please try again in a moment.'),
            ],
            state: 'idle',
        };
    }

    const presented = await presentDiagnosis(
        session.phone_number,
        outcome.result.diagnosisId,
        outcome.result.data,
    );
    return { messages: presented.messages, state: presented.state };
}

async function handleAwaitingAddress(
    session: WhatsappSession,
    text: string,
    images: string[],
    classifier: IntentClassifier,
    deps: HandleMessageDeps,
): Promise<BotResult> {
    const pending = session.pending_address;

    // No saved options → the user was sent to the web form and asked to reply
    // "ready". On "ready" (or yes), re-load saved locations and re-present.
    if (!pending || pending.options.length === 0) {
        const yn = await resolveYesNo(text, classifier);
        if (yn === 'yes' || /ready/i.test(text)) {
            return beginAddressSelection(
                session,
                session.active_diagnosis_id
                    ? await loadDiagnosis(session.active_diagnosis_id)
                    : null,
            );
        }
        return {
            messages: [out(fmt.formatReprompt(fmt.formatNoAddressPrompt()))],
            state: 'awaiting_address',
        };
    }

    const options: ParserOption[] = pending.options.map((o) => ({
        index: o.index,
        text: o.isOther ? 'Enter a different address' : `${o.label} ${o.address}`,
    }));

    if (looksLikeQuestion(text)) {
        return {
            messages: [
                out(
                    'I just need to know which address to search near. ' +
                        fmt.formatAddressSelection(pending.options),
                ),
            ],
            state: 'awaiting_address',
        };
    }

    const resolved = await resolveOption(text, options, classifier);
    if (resolved.kind === 'unclear') {
        return {
            messages: [
                out(fmt.formatReprompt(fmt.formatAddressSelection(pending.options))),
            ],
            state: 'awaiting_address',
        };
    }

    const chosen = pending.options.find((o) => o.index === resolved.index);
    if (!chosen) {
        return {
            messages: [
                out(fmt.formatReprompt(fmt.formatAddressSelection(pending.options))),
            ],
            state: 'awaiting_address',
        };
    }

    if (chosen.isOther) {
        await updateSession(session.phone_number, { state: 'awaiting_address' });
        return {
            messages: [out(fmt.formatNoAddressPrompt())],
            state: 'awaiting_address',
        };
    }

    return runContractorSearch(session, chosen, deps);
}

async function handleAwaitingContractorChoice(
    session: WhatsappSession,
    text: string,
    images: string[],
    classifier: IntentClassifier,
    deps: HandleMessageDeps,
): Promise<BotResult> {
    const pending = session.pending_contractors;
    if (!pending || pending.contractors.length === 0) {
        // Stuck — re-orient by treating input as a fresh diagnosis.
        return handleIdleOrDiagnosing(session, text, images, classifier);
    }

    const options: ParserOption[] = pending.contractors.map((c) => ({
        index: c.index,
        text: c.address ? `${c.name} ${c.address}` : c.name,
    }));

    if (looksLikeQuestion(text) || looksConfusedOrFrustrated(text)) {
        const firstPage = pending.contractors.slice(0, CONTRACTORS_PER_PAGE);
        return {
            messages: [
                out(
                    'Reply with the number of the contractor you would like contact details for. ' +
                        fmt.formatContractorList(pending.trade, firstPage),
                ),
            ],
            state: 'awaiting_contractor_choice',
        };
    }

    const resolved = await resolveOption(text, options, classifier);
    if (resolved.kind === 'unclear') {
        const firstPage = pending.contractors.slice(0, CONTRACTORS_PER_PAGE);
        return {
            messages: [
                out(
                    fmt.formatReprompt(
                        fmt.formatContractorList(pending.trade, firstPage),
                    ),
                ),
            ],
            state: 'awaiting_contractor_choice',
        };
    }

    const chosen = pending.contractors.find(
        (c) => c.index === resolved.index,
    ) as PendingContractor | undefined;
    if (!chosen) {
        const firstPage = pending.contractors.slice(0, CONTRACTORS_PER_PAGE);
        return {
            messages: [
                out(
                    fmt.formatReprompt(
                        fmt.formatContractorList(pending.trade, firstPage),
                    ),
                ),
            ],
            state: 'awaiting_contractor_choice',
        };
    }

    // Only registered providers (with an internal providerId) produce an
    // attributable, sellable lead. Log the lead only for those; the
    // notification "shared with them" line is gated on whether we logged it.
    let notified = false;
    if (chosen.providerId && session.active_diagnosis_id) {
        notified = await logContractorLead({
            providerId: chosen.providerId,
            diagnosisId: session.active_diagnosis_id,
            homeownerWhatsapp:
                session.phone_number === GUEST_PHONE ? null : session.phone_number,
            requestOrigin: deps.requestOrigin,
        });
    }

    await updateSession(session.phone_number, { state: 'contact_initiated' });
    return {
        messages: [out(fmt.formatContractorContact(chosen, { notified }))],
        state: 'contact_initiated',
    };
}

/** Exported for the simulator UI to expose the contractor-offer Yes/No flow. */
export async function handleContractorOfferReply(
    session: WhatsappSession,
    text: string,
    classifier: IntentClassifier,
    deps: HandleMessageDeps,
): Promise<BotResult | null> {
    const yn = await resolveYesNo(text, classifier);
    if (yn === 'yes') {
        const data = session.active_diagnosis_id
            ? await loadDiagnosis(session.active_diagnosis_id)
            : null;
        const res = await beginAddressSelection(session, data);
        return { messages: res.messages, state: res.state };
    }
    if (yn === 'no') {
        return {
            messages: [
                out(
                    'No problem. Your diagnosis is saved and you can find contractors any time by replying here.',
                ),
            ],
            state: 'idle',
        };
    }
    return null;
}

// Re-export for callers that want the resume window without importing the
// session manager directly.
export { RESUME_WINDOW_MS, msSinceLastMessage };
