/**
 * Message formatter (Phase A3).
 *
 * Pure functions that turn diagnosis results, clarification options, address
 * lists, and contractor lists into ordered arrays of plain-text WhatsApp
 * messages. No markdown, links rendered as plain URLs, each message length
 * capped. These are the most-iterated surface in the simulator, so they are
 * pure and unit-tested.
 *
 * Field choices (per Conversation Design + verified against PROSE_SCHEMA in
 * `agent-prose.ts`):
 *   - Message 1 = `diagnosis` title + paragraph 1 of `message` (NOT `thought`).
 *   - Message 2 = the report link.
 */

import { getSiteUrl } from '@/lib/site-url';
import type { DiagnosisData } from '@/features/diagnosis/types';
import type {
    PendingClarificationOption,
    PendingContractor,
    PendingAddressOption,
} from './types';

/** Soft cap per WhatsApp message. The Meta limit is 4096; we stay well under. */
export const MAX_MESSAGE_CHARS = 1000;

/**
 * Strip light markdown the prose model occasionally emits and normalise
 * whitespace. WhatsApp uses *bold* / _italic_ but the prose schema forbids
 * em dashes and markdown, so we only need defensive cleanup here.
 */
export function stripMarkdown(input: string): string {
    if (typeof input !== 'string') return '';
    return input
        .replace(/\*\*(.+?)\*\*/g, '$1') // bold
        .replace(/__(.+?)__/g, '$1')
        .replace(/^#{1,6}\s+/gm, '') // headings
        .replace(/^\s*[-*]\s+/gm, '') // bullet markers
        .replace(/`([^`]+)`/g, '$1') // inline code
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
}

/** First paragraph of a `\n\n`-separated message body. */
export function firstParagraph(message: string): string {
    const cleaned = stripMarkdown(message);
    const para = cleaned.split(/\n\s*\n/)[0] ?? '';
    return para.trim();
}

/** Hard cap a single message, breaking on a sentence boundary when possible. */
export function capMessage(text: string, max: number = MAX_MESSAGE_CHARS): string {
    if (text.length <= max) return text;
    const slice = text.slice(0, max);
    const lastStop = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('.\n'),
    );
    if (lastStop > max * 0.5) return slice.slice(0, lastStop + 1).trim();
    return slice.trim() + '…';
}

/** Build the public report URL for a diagnosis id. */
export function reportUrl(diagnosisId: string): string {
    return `${getSiteUrl()}/report/${diagnosisId}`;
}

/**
 * Two-message diagnosis summary: headline + teaching paragraph, then the
 * report link. Returns an array of plain strings.
 */
export function formatDiagnosisSummary(
    data: DiagnosisData,
    diagnosisId: string,
): string[] {
    const title = stripMarkdown(String(data.diagnosis ?? '')).slice(0, 75).trim();
    const para1 = firstParagraph(String(data.message ?? ''));
    const headline =
        title && para1
            ? `${title}\n\n${para1}`
            : title || para1 || 'Here is what I found.';

    const messages: string[] = [capMessage(headline)];
    messages.push(
        `Your full diagnosis is ready, including what your technician will do and how to prepare. View it here: ${reportUrl(diagnosisId)}`,
    );
    return messages;
}

/** The separate contractor offer that follows a diagnosis summary. */
export function formatContractorOffer(): string {
    return 'Would you like me to find contractors near you for this? Reply Yes or No.';
}

/**
 * Clarification prompt: present ranked hypotheses as a numbered list. Uses the
 * structured_clarification intro when available.
 */
export function formatClarification(
    intro: string,
    options: PendingClarificationOption[],
): string {
    const lines: string[] = [];
    const introText = stripMarkdown(intro).trim();
    lines.push(
        introText ||
            'I can see enough to make a good guess. One question will lock it in:',
    );
    lines.push('');
    for (const opt of options) {
        lines.push(`${opt.index}. ${stripMarkdown(opt.text)}`);
    }
    lines.push('');
    lines.push('Reply with a number, or describe what you see in your own words.');
    return capMessage(lines.join('\n'));
}

/** Low-confidence fallback: ask for a photo using the prose photo_request. */
export function formatPhotoRequest(photoRequest: string): string {
    const req = stripMarkdown(photoRequest).trim();
    if (req) {
        return `The photo is a little unclear for a confident diagnosis. A closer shot of ${req} would help. Send it when you are ready and I will take another look.`;
    }
    return 'The photo is a little unclear for a confident diagnosis. A closer, sharper photo of the problem area would help. Send it when you are ready and I will take another look.';
}

/** Address selection prompt from saved locations + the "other" row. */
export function formatAddressSelection(options: PendingAddressOption[]): string {
    const lines: string[] = ['Which address should I search near?', ''];
    for (const opt of options) {
        const label = opt.isOther
            ? opt.label
            : opt.label
              ? `${opt.label} — ${opt.address}`
              : opt.address;
        lines.push(`${opt.index}. ${stripMarkdown(label)}`);
    }
    lines.push('');
    lines.push('Reply with a number.');
    return capMessage(lines.join('\n'));
}

/** Prompt sent when the user has no saved addresses. */
export function formatNoAddressPrompt(): string {
    return `To find contractors near you I need an address. Add one here: ${getSiteUrl()}/settings/addresses then reply "ready".`;
}

/**
 * Ask the user to type an address directly in the chat. This is the primary
 * path now (in-chat entry), with the web form mentioned only as an alternative.
 */
export function formatAddressEntryPrompt(): string {
    return (
        'What address should I search near? Reply with the street and suburb, ' +
        'for example: 12 Main Road, Claremont. ' +
        `You can also save addresses in your account: ${getSiteUrl()}/settings/addresses`
    );
}

/** Sent when a typed address could not be geocoded. */
export function formatAddressNotFound(): string {
    return (
        'I could not find that address. Please reply with a fuller address ' +
        'including the suburb, for example: 12 Main Road, Claremont.'
    );
}

/** The numbered contractor list (three per message handled by the caller). */
export function formatContractorList(
    trade: string,
    contractors: PendingContractor[],
): string {
    const heading = trade
        ? `Here are the closest contractors for ${stripMarkdown(trade)}:`
        : 'Here are the closest contractors:';
    const lines: string[] = [heading, ''];
    for (const c of contractors) {
        const where = c.address ? `${c.name}, ${c.address}` : c.name;
        lines.push(`${c.index}. ${stripMarkdown(where)}`);
    }
    lines.push('');
    lines.push('Reply with a number to get their contact details.');
    return capMessage(lines.join('\n'));
}

/**
 * Contact details for a chosen contractor. The "shared with them" line is only
 * included when `notified` is true (Phase B wiring), per the build caveat.
 */
export function formatContractorContact(
    contractor: PendingContractor,
    opts: { notified: boolean },
): string {
    const lines: string[] = [contractor.name];
    if (contractor.phone) lines.push(contractor.phone);
    if (contractor.email) lines.push(contractor.email);
    if (contractor.website) lines.push(contractor.website);
    if (opts.notified) {
        lines.push('');
        lines.push(
            'Your diagnosis has been shared with them so they have the detail before they call.',
        );
    }
    return capMessage(lines.join('\n'));
}

/** First-contact greeting for users who send nothing actionable. */
export function formatFirstContact(): string {
    return 'Hi, I am the Mendr repair assistant. Send me a photo of the problem, or describe what is wrong, and I will tell you what is likely going on.';
}

/** Registration gate for unknown numbers. */
export function formatRegistrationGate(): string {
    return `To get a diagnosis you need a free Mendr account. Sign up here: ${getSiteUrl()}/register`;
}

/** Resume prompt for an unresolved session within the 72h window. */
export function formatResumePrompt(lastTitle: string): string {
    const title = stripMarkdown(lastTitle).trim() || 'your last diagnosis';
    return `Welcome back. Continue your last diagnosis (${title}) or start a new one? Reply continue or new.`;
}

/** The help / menu text shown by the global commands. */
export function formatHelp(): string {
    return [
        'Here is what I can do:',
        '',
        'Send a photo or describe a problem and I will diagnose it.',
        'After a diagnosis I can find contractors near you.',
        '',
        'You can reply at any time with:',
        'help — show this message',
        'menu — show this message',
        'start over — begin a fresh diagnosis',
        'stop — end the conversation',
        'talk to a person — reach a human',
    ].join('\n');
}

/** Confirmation shown after a "start over" command. */
export function formatStartOver(): string {
    return 'No problem, let us start fresh. Send a photo of the problem or describe what is wrong.';
}

/** Response to "stop". */
export function formatStop(): string {
    return 'Okay, I will stop here. Message me any time with a photo or a description and I will pick things up again.';
}

/** Response to a human-escape request. */
export function formatHumanEscape(): string {
    return 'I will pass this to a person. In the meantime you can also reach the Mendr team through the website. Is there anything I can help with right now?';
}

/** Gentle, in-place re-prompt that repeats the options without resetting. */
export function formatReprompt(repeatedPrompt: string): string {
    return `Sorry, I did not quite catch that. ${repeatedPrompt}`;
}

/** Mid-flow topic-change offer that preserves the current diagnosis. */
export function formatTopicChangeOffer(currentTitle: string): string {
    const title = stripMarkdown(currentTitle).trim();
    const saved = title ? ` Your ${title} diagnosis is saved and you can come back to it.` : '';
    return `Want me to look at this new problem instead?${saved} Reply yes to switch, or no to stay with the current one.`;
}
