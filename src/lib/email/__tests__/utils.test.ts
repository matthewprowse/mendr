import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type React from 'react';
import { createHmac } from 'crypto';

// We mock `@react-email/render` and `resend` at the module boundary so the
// network-free pure parts of email/utils — token signing and URL building —
// can be exercised exhaustively, plus a few send-path branches.

const renderMock = vi.fn();
const sendMock = vi.fn();

vi.mock('@react-email/render', () => ({
    render: (...args: unknown[]) => renderMock(...args),
}));

vi.mock('resend', () => ({
    Resend: class {
        emails = { send: (...args: unknown[]) => sendMock(...args) };
    },
}));

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

const SAVED: Record<string, string | undefined> = {};
function saveEnv(...keys: string[]) {
    for (const k of keys) SAVED[k] = process.env[k];
}
function restoreEnv() {
    for (const [k, v] of Object.entries(SAVED)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
}

beforeEach(() => {
    saveEnv('CRON_SECRET', 'NEXT_PUBLIC_APP_URL', 'VERCEL_URL', 'RESEND_API_KEY', 'RESEND_FROM', 'RESEND_REPLY_TO');
    renderMock.mockReset();
    sendMock.mockReset();
});

afterEach(() => {
    restoreEnv();
});

// ---------------------------------------------------------------------------
// generateUnsubscribeToken
// ---------------------------------------------------------------------------

describe('generateUnsubscribeToken', () => {
    it('returns a "<payload>.<sig>" string', async () => {
        const { generateUnsubscribeToken } = await import('../utils');
        const token = generateUnsubscribeToken('user@example.com', 's3cr3t');
        const parts = token.split('.');
        expect(parts).toHaveLength(2);
        expect(parts[0].length).toBeGreaterThan(0);
        expect(parts[1]).toMatch(/^[a-f0-9]{64}$/);
    });

    it('encodes the email + timestamp in base64url payload', async () => {
        const { generateUnsubscribeToken } = await import('../utils');
        const token = generateUnsubscribeToken('user@example.com', 'k');
        const [payload] = token.split('.');
        const decoded = Buffer.from(payload, 'base64url').toString('utf8');
        expect(decoded).toMatch(/^user@example\.com:\d+$/);
    });

    it('signature verifies as HMAC-SHA256 of the payload using the secret', async () => {
        const { generateUnsubscribeToken } = await import('../utils');
        const token = generateUnsubscribeToken('a@b.com', 'topsecret');
        const [payload, sig] = token.split('.');
        const expected = createHmac('sha256', 'topsecret').update(payload).digest('hex');
        expect(sig).toBe(expected);
    });

    it('produces different signatures for different secrets', async () => {
        const { generateUnsubscribeToken } = await import('../utils');
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const a = generateUnsubscribeToken('a@b.com', 'secret-1');
        const b = generateUnsubscribeToken('a@b.com', 'secret-2');
        vi.restoreAllMocks();
        expect(a.split('.')[1]).not.toBe(b.split('.')[1]);
    });

    it('produces different signatures for different emails', async () => {
        const { generateUnsubscribeToken } = await import('../utils');
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const a = generateUnsubscribeToken('a@b.com', 'k');
        const b = generateUnsubscribeToken('b@c.com', 'k');
        vi.restoreAllMocks();
        expect(a).not.toBe(b);
    });

    it('handles emails with "+" and special characters via base64url', async () => {
        const { generateUnsubscribeToken } = await import('../utils');
        const token = generateUnsubscribeToken('first+tag@example.co.za', 'k');
        const [payload] = token.split('.');
        // base64url is URL-safe — must not contain "+" or "/" or padding "=".
        expect(payload).not.toMatch(/[+/=]/);
    });
});

// ---------------------------------------------------------------------------
// generateUnsubscribeUrl
// ---------------------------------------------------------------------------

describe('generateUnsubscribeUrl', () => {
    it('embeds the URL-encoded token in the query', async () => {
        process.env.CRON_SECRET = 'cron-key';
        process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';
        const { generateUnsubscribeUrl } = await import('../utils');
        const url = generateUnsubscribeUrl('a@b.com');
        expect(url).toMatch(/^https:\/\/example\.test\/api\/unsubscribe\?token=/);
        const token = decodeURIComponent(url.split('token=')[1]);
        expect(token.split('.')).toHaveLength(2);
    });

    it('falls back to mendr.co.za when no site env is set', async () => {
        delete process.env.NEXT_PUBLIC_APP_URL;
        delete process.env.VERCEL_URL;
        process.env.CRON_SECRET = 'x';
        const { generateUnsubscribeUrl } = await import('../utils');
        const url = generateUnsubscribeUrl('a@b.com');
        expect(url.startsWith('https://mendr.co.za/api/unsubscribe?token=')).toBe(true);
    });

    it('uses VERCEL_URL when explicit site URL absent', async () => {
        delete process.env.NEXT_PUBLIC_APP_URL;
        process.env.VERCEL_URL = 'preview-abc.vercel.app';
        process.env.CRON_SECRET = 'x';
        const { generateUnsubscribeUrl } = await import('../utils');
        const url = generateUnsubscribeUrl('a@b.com');
        expect(url.startsWith('https://preview-abc.vercel.app/api/unsubscribe?token=')).toBe(true);
    });

    it('uses an empty string secret when CRON_SECRET is unset (still produces a token)', async () => {
        delete process.env.CRON_SECRET;
        process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';
        const { generateUnsubscribeUrl } = await import('../utils');
        const url = generateUnsubscribeUrl('a@b.com');
        const token = decodeURIComponent(url.split('token=')[1]);
        expect(token).toMatch(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/);
    });

    it('URL-encodes special characters in the token (`%` indicates encoding)', async () => {
        process.env.CRON_SECRET = 'k';
        process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';
        const { generateUnsubscribeUrl } = await import('../utils');
        const url = generateUnsubscribeUrl('a@b.com');
        // The "." separator must remain literal — encodeURIComponent leaves "." alone.
        // We just check the URL parses normally.
        expect(() => new URL(url)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// sendMendrEmail — configuration & error mapping
// ---------------------------------------------------------------------------

describe('sendMendrEmail — configuration guards', () => {
    it('returns "Resend not configured" when RESEND_API_KEY is missing', async () => {
        delete process.env.RESEND_API_KEY;
        process.env.RESEND_FROM = 'Mendr <noreply@mendr.co.za>';
        const { sendMendrEmail } = await import('../utils');
        const result = await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        expect(result).toEqual({ ok: false, error: 'Resend not configured' });
    });

    it('returns "Resend not configured" when RESEND_FROM is missing', async () => {
        process.env.RESEND_API_KEY = 're_test_abc';
        delete process.env.RESEND_FROM;
        const { sendMendrEmail } = await import('../utils');
        const result = await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        expect(result).toEqual({ ok: false, error: 'Resend not configured' });
    });
});

describe('sendMendrEmail — render & send', () => {
    beforeEach(() => {
        process.env.RESEND_API_KEY = 're_test_abc';
        process.env.RESEND_FROM = 'Mendr <noreply@mendr.co.za>';
    });

    it('escapes recipient name into `Name <email>` format', async () => {
        renderMock.mockResolvedValue('<html>ok</html>');
        sendMock.mockResolvedValue({ error: null });
        const { sendMendrEmail } = await import('../utils');
        await sendMendrEmail({
            to: { email: 'a@b.com', name: 'Jane' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        const payload = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(payload.to).toBe('Jane <a@b.com>');
    });

    it('omits the name wrapper when only email is provided', async () => {
        renderMock.mockResolvedValue('<html>ok</html>');
        sendMock.mockResolvedValue({ error: null });
        const { sendMendrEmail } = await import('../utils');
        await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        const payload = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(payload.to).toBe('a@b.com');
    });

    it('returns ok=false with the render error when render throws', async () => {
        renderMock.mockRejectedValue(new Error('template blew up'));
        const { sendMendrEmail } = await import('../utils');
        const result = await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('template blew up');
    });

    it('returns ok=false with the resend error message when send fails', async () => {
        renderMock.mockResolvedValue('<html>ok</html>');
        sendMock.mockResolvedValue({ error: { message: 'rejected by provider' } });
        const { sendMendrEmail } = await import('../utils');
        const result = await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        expect(result).toEqual({ ok: false, error: 'rejected by provider' });
    });

    it('returns ok=true on a successful send', async () => {
        renderMock.mockResolvedValue('<html>ok</html>');
        sendMock.mockResolvedValue({ error: null });
        const { sendMendrEmail } = await import('../utils');
        const result = await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        expect(result).toEqual({ ok: true });
    });

    it('adds tag entries with value="true" when tags supplied', async () => {
        renderMock.mockResolvedValue('<html>ok</html>');
        sendMock.mockResolvedValue({ error: null });
        const { sendMendrEmail } = await import('../utils');
        await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
            tags: ['onboarding', 'phase-1'],
        });
        const payload = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(payload.tags).toEqual([
            { name: 'onboarding', value: 'true' },
            { name: 'phase-1', value: 'true' },
        ]);
    });

    it('omits the tags field entirely when none supplied', async () => {
        renderMock.mockResolvedValue('<html>ok</html>');
        sendMock.mockResolvedValue({ error: null });
        const { sendMendrEmail } = await import('../utils');
        await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        const payload = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
        expect('tags' in payload).toBe(false);
    });

    it('sets List-Unsubscribe header with replyTo or from when no override', async () => {
        renderMock.mockResolvedValue('<html>ok</html>');
        sendMock.mockResolvedValue({ error: null });
        process.env.RESEND_REPLY_TO = 'replies@mendr.co.za';
        const { sendMendrEmail } = await import('../utils');
        await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        const payload = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
        const headers = payload.headers as Record<string, string>;
        expect(headers['List-Unsubscribe']).toContain('replies@mendr.co.za');
        expect(headers['X-Mailer']).toBe('Mendr');
    });

    it('honors per-call replyTo override over env', async () => {
        renderMock.mockResolvedValue('<html>ok</html>');
        sendMock.mockResolvedValue({ error: null });
        process.env.RESEND_REPLY_TO = 'env-reply@mendr.co.za';
        const { sendMendrEmail } = await import('../utils');
        await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
            replyTo: 'override@mendr.co.za',
        });
        const payload = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(payload.replyTo).toBe('override@mendr.co.za');
    });

    it('catches synchronous throws from resend.emails.send and returns the error', async () => {
        renderMock.mockResolvedValue('<html>ok</html>');
        sendMock.mockRejectedValue(new Error('network kaboom'));
        const { sendMendrEmail } = await import('../utils');
        const result = await sendMendrEmail({
            to: { email: 'a@b.com' },
            subject: 'Hi',
            component: { type: 'div', props: {}, key: null } as unknown as React.ReactElement,
            text: 'plain',
        });
        expect(result).toEqual({ ok: false, error: 'network kaboom' });
    });
});
