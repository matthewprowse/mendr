/* eslint-disable no-console */
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
import { getSavedLocations, saveLocationForUser } from './profile';
import { geocodeAddress } from './geocode';
import {
    detectGlobalCommand,
    detectNonEnglishGreeting,
    resolveOption,
    resolveYesNo,
    looksLikeQuestion,
    looksConfusedOrFrustrated,
    type ParserOption,
    type IntentClassifier,
} from './forgiving-parser';
import { classifyIntent } from './intent-classifier';
import * as fmt from './message-formatter';
import { createMagicLink, findUserByVerifiedPhone, normalisePhone } from './linking';
import { recordOptOut } from './opt-out';
import { sendOutbound } from './outbox';
import { channelConfigured } from './channel/meta-cloud';
import { leadAlertContractorTemplate } from './templates';
import { getSiteUrl } from '@/lib/site-url';
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

/** Outbound message with native button/list options for real channels. */
function outWithOptions(
    text: string,
    interactiveBody: string,
    options: Array<{ id: string; title: string; description?: string }>,
    listButtonLabel?: string,
): OutboundMessage {
    return {
        text,
        interactiveBody,
        options: options.slice(0, 10).map((o) => ({
            id: o.id,
            title: o.title.slice(0, 24),
            description: o.description?.slice(0, 72),
        })),
        listButtonLabel,
    };
}

const YES_NO_OPTIONS = [
    { id: 'yes', title: 'Yes' },
    { id: 'no', title: 'No' },
];

/** Build the contractor list message for a 0-based page, with MORE affordance. */
function contractorPageMessage(
    trade: string,
    contractors: PendingContractor[],
    page: number,
): OutboundMessage {
    const start = page * CONTRACTORS_PER_PAGE;
    const slice = contractors.slice(start, start + CONTRACTORS_PER_PAGE);
    const hasMore = contractors.length > start + CONTRACTORS_PER_PAGE;
    const options = slice.map((c) => ({
        id: String(c.index),
        title: c.name,
        description: c.address ?? undefined,
    }));
    if (hasMore) options.push({ id: 'more', title: 'More options', description: undefined });
    return outWithOptions(
        fmt.formatContractorList(trade, slice, { hasMore }),
        trade
            ? `Here are the closest contractors for ${trade}. Pick one for contact details.`
            : 'Here are the closest contractors. Pick one for contact details.',
        options,
        'View contractors',
    );
}

/** True when the reply asks for the next page of contractors. */
function isMoreRequest(text: string): boolean {
    return /^(more|more options|show more|next)\.?$/i.test(text.trim());
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
    // Route to clarification when the pipeline flags it OR when it produced
    // usable clarification options even with requires_clarification=false.
    // The shared diagnosis pipeline can return an internally inconsistent
    // result for vague text-only input (e.g. title "Unspecified Garage Door
    // Fault", confidence 95, requires_clarification=false, yet
    // clarification_questions populated). Offering a report link and
    // contractors for an unspecified fault is useless, so prefer clarifying
    // whenever there is something concrete to ask.
    const clar = extractClarificationOptions(data);
    const hasClarificationOptions = clar !== null && clar.options.length > 0;
    // The shared pipeline keeps emitting clarification_questions even AFTER it
    // commits to a specific diagnosis (e.g. "Detached Left Side Tension Spring",
    // confidence 95, requires_clarification=false, failed_component set). If we
    // clarified on the mere presence of options the bot would loop forever,
    // asking ever-finer questions. So only override a commit and clarify when
    // the diagnosis is genuinely unspecified: no failed_component AND a vague or
    // placeholder title. A specific committed diagnosis goes straight to the
    // summary and contractor offer.
    const probe = data as unknown as { failed_component?: unknown; diagnosis?: unknown };
    const failedComponent =
        typeof probe.failed_component === 'string' ? probe.failed_component.trim() : '';
    const title = typeof probe.diagnosis === 'string' ? probe.diagnosis.trim() : '';
    const looksUnspecified =
        failedComponent.length === 0 &&
        (title.length === 0 ||
            /\b(unspecified|unclear|unknown|undiagnosed|general)\b/i.test(title));
    if (data.requires_clarification || (hasClarificationOptions && looksUnspecified)) {
        if (hasClarificationOptions && clar) {
            await updateSession(phone, {
                state: 'awaiting_clarification',
                active_diagnosis_id: diagnosisId,
                pending_clarification: clar,
            });
            return {
                messages: [
                    outWithOptions(
                        fmt.formatClarification(clar.intro, clar.options),
                        clar.intro ||
                            'I can see enough to make a good guess. One question will lock it in:',
                        clar.options.map((o) => ({
                            id: String(o.index),
                            title: o.text,
                        })),
                        'Choose one',
                    ),
                ],
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
        messages: [
            ...summary.map(out),
            outWithOptions(
                fmt.formatContractorOffer(),
                fmt.formatContractorOffer(),
                YES_NO_OPTIONS,
            ),
        ],
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
        // No saved addresses → let them type one directly in chat (geocoded on
        // reply). Empty options signals free-text entry mode to the handler.
        await updateSession(session.phone_number, {
            state: 'awaiting_address',
            pending_address: { options: [], trade, tradeDetail },
        });
        return {
            messages: [out(fmt.formatAddressEntryPrompt())],
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
        messages: [
            outWithOptions(
                fmt.formatAddressSelection(options),
                'Which address should I search near?',
                options.map((o) => ({
                    id: String(o.index),
                    title: o.isOther ? o.label : o.label || o.address,
                    description: o.isOther ? undefined : o.address,
                })),
                'Choose address',
            ),
        ],
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

    // Resolve coordinates: prefer the stored ones; otherwise geocode the
    // address text on the fly rather than dead-ending at the web form.
    let lat = chosen.lat;
    let lng = chosen.lng;
    let resolvedAddress: string | null = chosen.address || null;
    if (lat == null || lng == null) {
        const geo = chosen.address
            ? await geocodeAddress(chosen.address, { requestOrigin: deps.requestOrigin })
            : null;
        if (!geo) {
            return {
                messages: [out(fmt.formatAddressNotFound())],
                state: 'awaiting_address',
            };
        }
        lat = geo.lat;
        lng = geo.lng;
        resolvedAddress = geo.address;
    }

    // Copy the chosen coordinates onto the diagnosis — matching keys off these.
    if (session.active_diagnosis_id) {
        await setDiagnosisLocation(session.active_diagnosis_id, {
            lat,
            lng,
            address: resolvedAddress,
        });
    }

    const contractors = await matchContractors({
        lat,
        lng,
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

    await updateSession(session.phone_number, {
        state: 'awaiting_contractor_choice',
        pending_address: null,
        pending_contractors: { contractors, trade, page: 0 },
    });
    return {
        messages: [contractorPageMessage(trade, contractors, 0)],
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
    // The bot needs a Mendr account to own the diagnosis + count quota. A real
    // phone gets a magic link that verifies the number by possession; the
    // guest sentinel (simulator) falls back to the plain register URL.
    if (!session.user_id) {
        const normalised = phone === GUEST_PHONE ? null : normalisePhone(phone);
        const magicLink = normalised ? await createMagicLink(normalised) : null;
        return {
            messages: [out(fmt.formatRegistrationGate(magicLink))],
            state: session.state,
        };
    }

    // The user replied — any pending resume nudge is resolved.
    if (session.resume_prompted_at) {
        void updateSession(session.phone_number, {
            resume_prompted_at: null,
            touch: false,
        });
    }

    // ── Graceful non-English greeting handling ───────────────────────────────
    // Conservative: only short greeting-like messages at idle with no images.
    // Full multilingual support is a fast-follow; misrouting a real diagnosis
    // request would be worse than this nudge.
    if (
        text &&
        images.length === 0 &&
        session.state === 'idle' &&
        !session.pending_clarification &&
        !session.pending_address &&
        detectNonEnglishGreeting(text)
    ) {
        return {
            messages: [
                out(
                    'Hello! I work best in English for now — more languages are coming soon. Send me a photo of the problem, or describe it, and I will tell you what is likely going on.',
                ),
            ],
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
                    const reprompt = fmt.formatReprompt(fmt.formatContractorOffer());
                    return {
                        messages: [outWithOptions(reprompt, reprompt, YES_NO_OPTIONS)],
                        state: 'idle',
                    };
                }
                // Looks like a new problem → topic-change offer, preserve diagnosis.
                const offer = fmt.formatTopicChangeOffer(diagnosisTitle(lastData));
                return {
                    messages: [outWithOptions(offer, offer, YES_NO_OPTIONS)],
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
    // a registered user. Real numbers are looked up against profiles.phone
    // where phone_verified_at is set (Phase C linking).
    if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(phone)
    ) {
        return phone;
    }
    const normalised = normalisePhone(phone);
    if (!normalised) return null;
    return findUserByVerifiedPhone(normalised);
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
            // Persist the opt-out so proactive sends (templates, nudges) are
            // suppressed until an explicit START. Best-effort; the reply goes
            // out regardless. Guest (simulator) numbers are not recorded.
            if (session.phone_number !== GUEST_PHONE) {
                void recordOptOut(session.phone_number);
            }
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
        // Free-text address-entry mode. "ready"/"yes" means they saved one on
        // the web — re-load saved locations. Otherwise treat the message as the
        // address itself: geocode it, save it for next time, and search.
        const yn = await resolveYesNo(text, classifier);
        if (yn === 'yes' || /\bready\b/i.test(text)) {
            return beginAddressSelection(
                session,
                session.active_diagnosis_id
                    ? await loadDiagnosis(session.active_diagnosis_id)
                    : null,
            );
        }
        const geo = await geocodeAddress(text, { requestOrigin: deps.requestOrigin });
        if (!geo) {
            return {
                messages: [out(fmt.formatAddressNotFound())],
                state: 'awaiting_address',
            };
        }
        if (session.user_id) {
            await saveLocationForUser(session.user_id, {
                address: geo.address,
                lat: geo.lat,
                lng: geo.lng,
            });
        }
        return runContractorSearch(
            session,
            {
                index: 0,
                id: 'typed',
                label: '',
                address: geo.address,
                lat: geo.lat,
                lng: geo.lng,
            },
            deps,
        );
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
        // Switch to free-text entry mode (empty options) so the next message is
        // geocoded as a typed address.
        await updateSession(session.phone_number, {
            state: 'awaiting_address',
            pending_address: {
                options: [],
                trade: pending.trade,
                tradeDetail: pending.tradeDetail,
            },
        });
        return {
            messages: [out(fmt.formatAddressEntryPrompt())],
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

    const page = pending.page ?? 0;

    // MORE → next page (or a gentle "that's everyone" on the last page).
    if (isMoreRequest(text)) {
        const nextStart = (page + 1) * CONTRACTORS_PER_PAGE;
        if (nextStart >= pending.contractors.length) {
            return {
                messages: [
                    out('That is everyone I found nearby.'),
                    contractorPageMessage(pending.trade, pending.contractors, page),
                ],
                state: 'awaiting_contractor_choice',
            };
        }
        await updateSession(session.phone_number, {
            pending_contractors: { ...pending, page: page + 1 },
        });
        return {
            messages: [
                contractorPageMessage(pending.trade, pending.contractors, page + 1),
            ],
            state: 'awaiting_contractor_choice',
        };
    }

    const options: ParserOption[] = pending.contractors.map((c) => ({
        index: c.index,
        text: c.address ? `${c.name} ${c.address}` : c.name,
    }));

    if (looksLikeQuestion(text) || looksConfusedOrFrustrated(text)) {
        const repeat = contractorPageMessage(pending.trade, pending.contractors, page);
        return {
            messages: [
                {
                    ...repeat,
                    text:
                        'Reply with the number of the contractor you would like contact details for. ' +
                        repeat.text,
                },
            ],
            state: 'awaiting_contractor_choice',
        };
    }

    const resolved = await resolveOption(text, options, classifier);
    const chosen =
        resolved.kind === 'option'
            ? (pending.contractors.find(
                  (c) => c.index === resolved.index,
              ) as PendingContractor | undefined)
            : undefined;
    if (!chosen) {
        const repeat = contractorPageMessage(pending.trade, pending.contractors, page);
        return {
            messages: [{ ...repeat, text: fmt.formatReprompt(repeat.text) }],
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
        // Pros live on WhatsApp, not email: fire the lead-alert template at
        // the contractor too (best-effort, channel + approved template
        // permitting). Outbox handles opt-out + retries + dead-letter.
        if (notified && channelConfigured() && chosen.phone) {
            const providerPhone = normalisePhone(chosen.phone);
            if (providerPhone) {
                void sendOutbound({
                    to: providerPhone,
                    kind: 'proactive',
                    template: leadAlertContractorTemplate(
                        pending.trade,
                        chosen.address ?? '',
                        `${getSiteUrl()}/pro/leads`,
                    ),
                });
            }
        }
    }

    // Schedule the "did it work out?" follow-up — this is what converts
    // contact_initiated from a dead end into reviews + outcome data.
    if (session.phone_number !== GUEST_PHONE) {
        void scheduleJobFollowup(session, chosen);
    }

    await updateSession(session.phone_number, { state: 'contact_initiated' });
    return {
        messages: [out(fmt.formatContractorContact(chosen, { notified }))],
        state: 'contact_initiated',
    };
}

/** Insert a job_followup row processed by /api/cron/whatsapp ~5 days later. */
async function scheduleJobFollowup(
    session: WhatsappSession,
    chosen: PendingContractor,
): Promise<void> {
    try {
        const data = session.active_diagnosis_id
            ? await loadDiagnosis(session.active_diagnosis_id)
            : null;
        const admin = await createSupabaseAdminClient();
        await admin.from('whatsapp_followups').insert({
            phone_number: session.phone_number,
            user_id: session.user_id,
            kind: 'job_followup',
            payload: {
                provider_name: chosen.name,
                issue_title: diagnosisTitle(data),
                provider_id: chosen.providerId,
                diagnosis_id: session.active_diagnosis_id,
            },
            due_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        });
    } catch (e) {
        console.error('[whatsapp/bot] scheduleJobFollowup failed', e);
    }
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
