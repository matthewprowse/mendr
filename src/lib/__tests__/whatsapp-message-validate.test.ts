import { describe, it, expect } from 'vitest';
import {
    validateWhatsAppAiMessage,
    WHATSAPP_MESSAGE_MAX_CHARS,
} from '../whatsapp-message-validate';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REPORT_URL = 'https://mendr.co.za/report/abc123';
const PROFILE_URL = 'https://mendr.co.za/pro/cape-plumbing';

const VALID_MESSAGE =
    'Hi Cape Plumbing, here is my Mendr diagnosis report: ' +
    REPORT_URL +
    '. Can you quote on this and let me know your availability?';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('validateWhatsAppAiMessage — constants', () => {
    it('exports the max-chars cap', () => {
        expect(WHATSAPP_MESSAGE_MAX_CHARS).toBe(900);
    });
});

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

describe('validateWhatsAppAiMessage — empty input', () => {
    it('rejects empty string', () => {
        const result = validateWhatsAppAiMessage({
            text: '',
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'empty' });
    });

    it('rejects whitespace-only string', () => {
        const result = validateWhatsAppAiMessage({
            text: '   \n\t  ',
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'empty' });
    });
});

// ---------------------------------------------------------------------------
// Length
// ---------------------------------------------------------------------------

describe('validateWhatsAppAiMessage — length', () => {
    it('rejects when text exceeds 900 characters', () => {
        const huge = 'a'.repeat(WHATSAPP_MESSAGE_MAX_CHARS + 1);
        const result = validateWhatsAppAiMessage({
            text: huge,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'too_long' });
    });

    it('accepts text exactly at the cap (with required URL)', () => {
        // Build a string of length 900 with reportUrl embedded.
        const padding = 'a'.repeat(WHATSAPP_MESSAGE_MAX_CHARS - REPORT_URL.length - 1);
        const text = `${padding} ${REPORT_URL}`;
        expect(text.length).toBe(WHATSAPP_MESSAGE_MAX_CHARS);
        const result = validateWhatsAppAiMessage({
            text,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result.ok).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Markdown / structured syntax
// ---------------------------------------------------------------------------

describe('validateWhatsAppAiMessage — markdown / link syntax', () => {
    it('rejects bold markdown (**…**)', () => {
        const result = validateWhatsAppAiMessage({
            text: `Hi! **Important** see ${REPORT_URL}`,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'markdown_or_link_syntax' });
    });

    it('rejects underline markdown (__…__)', () => {
        const result = validateWhatsAppAiMessage({
            text: `Hi __team__ see ${REPORT_URL}`,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'markdown_or_link_syntax' });
    });

    it('rejects code fences (```)', () => {
        const result = validateWhatsAppAiMessage({
            text: `Hi here is code\n\`\`\`\nsome code\n\`\`\`\nsee ${REPORT_URL}`,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'markdown_or_link_syntax' });
    });

    it('rejects markdown links [text](url)', () => {
        const result = validateWhatsAppAiMessage({
            text: `Hi, see my [report](${REPORT_URL}) please`,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'markdown_or_link_syntax' });
    });

    it('rejects headings (# … ######)', () => {
        const result = validateWhatsAppAiMessage({
            text: `# Big heading\nMessage body ${REPORT_URL}`,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'markdown_or_link_syntax' });
    });

    it('rejects bullet lists (-, *, +)', () => {
        const result = validateWhatsAppAiMessage({
            text: `Issues:\n- one\n- two\nSee ${REPORT_URL}`,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'markdown_or_link_syntax' });
    });

    it('accepts an inline dash inside a sentence (not a list)', () => {
        const result = validateWhatsAppAiMessage({
            text: `Hi - quick question - see ${REPORT_URL}`,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result.ok).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// URL inclusion gates
// ---------------------------------------------------------------------------

describe('validateWhatsAppAiMessage — URL inclusion', () => {
    it('rejects when reportUrl is supplied but missing from text', () => {
        const result = validateWhatsAppAiMessage({
            text: 'Hi, no link here, can you call me about my issue?',
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'missing_report_url' });
    });

    it('accepts when reportUrl is included in the text', () => {
        const result = validateWhatsAppAiMessage({
            text: VALID_MESSAGE,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result.ok).toBe(true);
    });

    it('falls back to profileUrl gate when reportUrl is empty', () => {
        const result = validateWhatsAppAiMessage({
            text: 'Hi, no profile link here please get back to me',
            reportUrl: '',
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'missing_profile_url' });
    });

    it('accepts profile-only message when reportUrl is empty', () => {
        const result = validateWhatsAppAiMessage({
            text: `Hi, found you via ${PROFILE_URL}, can you help?`,
            reportUrl: '',
            profileUrl: PROFILE_URL,
        });
        expect(result.ok).toBe(true);
    });

    it('treats whitespace-only reportUrl as empty and uses profile gate', () => {
        const result = validateWhatsAppAiMessage({
            text: 'Hi without any URL at all here today friend',
            reportUrl: '   ',
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'missing_profile_url' });
    });

    it('passes when both URLs are empty (no URL gate fires)', () => {
        const result = validateWhatsAppAiMessage({
            text: 'Plain SMS-style message with no links whatsoever',
            reportUrl: '',
            profileUrl: '',
        });
        expect(result.ok).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Prefill / injection robustness
// ---------------------------------------------------------------------------

describe('validateWhatsAppAiMessage — prefill / injection', () => {
    it('detects markdown link injection even with valid URL embedded', () => {
        // Attacker tries to disguise as plain text but uses [name](url) syntax
        const result = validateWhatsAppAiMessage({
            text: `Hi see [my report](${REPORT_URL})!`,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result).toEqual({ ok: false, reason: 'markdown_or_link_syntax' });
    });

    it('accepts URL pasted bare next to friendly prose', () => {
        const result = validateWhatsAppAiMessage({
            text: `Good morning, please see my Mendr report at ${REPORT_URL} when you have a moment.`,
            reportUrl: REPORT_URL,
            profileUrl: PROFILE_URL,
        });
        expect(result.ok).toBe(true);
    });
});
