/**
 * Shared SendGrid mail helper.
 *
 * Usage:
 *   const { ok, error } = await sendScandioEmail({
 *     to:      { email: 'contractor@example.com', name: 'Jane Doe' },
 *     subject: 'We received your application',
 *     text:    plainTextBody,
 *     html:    htmlBody,          // recommended — use buildEmailHtml()
 *   });
 *
 * Required env vars: SENDGRID_API_KEY, SENDGRID_FROM_EMAIL
 * Optional env vars: SENDGRID_REPLY_TO (defaults to SENDGRID_FROM_EMAIL)
 */

import sgMail from '@sendgrid/mail';

export type EmailRecipient = { email: string; name?: string };

export type SendScandioEmailOptions = {
    to: EmailRecipient;
    subject: string;
    /** Plain-text fallback — always required. */
    text: string;
    /** HTML body. Build with buildEmailHtml() for consistent spam-safe structure. */
    html?: string;
    /** Reply-to override. Defaults to SENDGRID_REPLY_TO env var. */
    replyTo?: string;
};

export type SendEmailResult =
    | { ok: true }
    | { ok: false; error: string };

export async function sendScandioEmail(options: SendScandioEmailOptions): Promise<SendEmailResult> {
    const apiKey    = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const replyTo   = options.replyTo ?? process.env.SENDGRID_REPLY_TO ?? fromEmail;

    if (!apiKey || !fromEmail) {
        return {
            ok: false,
            error: 'SendGrid is not configured (missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL)',
        };
    }

    sgMail.setApiKey(apiKey);

    const html = options.html ?? buildEmailHtml({ body: options.text });

    try {
        await sgMail.send({
            to:      options.to,
            from:    { email: fromEmail, name: 'Scandio' },
            replyTo: replyTo ? { email: replyTo } : undefined,
            subject: options.subject,
            text:    options.text,
            html,
            // Transactional category helps SendGrid reputation tracking
            categories: ['transactional'],
            // RFC 2369 List-Unsubscribe — helps inboxing even for transactional mail
            headers: {
                'List-Unsubscribe': `<mailto:${replyTo ?? fromEmail}?subject=unsubscribe>`,
                'X-Mailer': 'Scandio',
            },
        });
        return { ok: true };
    } catch (err: unknown) {
        const msg =
            (err as any)?.response?.body?.errors?.[0]?.message ||
            (err as any)?.message ||
            'SendGrid error';
        return { ok: false, error: msg };
    }
}

// ── HTML builder ──────────────────────────────────────────────────────────────

/**
 * Wraps a plain-text body in a clean, spam-safe HTML email shell.
 * Converts newlines to paragraphs and numbered lists to <ol>.
 *
 * Using a proper HTML structure (rather than a raw `text.replace(/\n/g, '<br>')`)
 * dramatically improves deliverability — spam filters penalise HTML that is just
 * a thin wrapper around plain text.
 */
export function buildEmailHtml({ body, ctaLabel, ctaUrl }: {
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
}): string {
    // Split into paragraphs; detect numbered list items (  1. foo)
    const paragraphs = body
        .split(/\n{2,}/)
        .map((block) => {
            const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
            if (!lines.length) return '';

            const isNumberedList = lines.every((l) => /^\d+\./.test(l));
            if (isNumberedList) {
                const items = lines.map((l) => `<li>${l.replace(/^\d+\.\s*/, '')}</li>`).join('\n');
                return `<ol style="margin:0 0 16px;padding-left:20px;">${items}</ol>`;
            }

            // Separator lines
            if (lines.length === 1 && lines[0] === '---') {
                return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">`;
            }

            return lines
                .map((l) => `<p style="margin:0 0 10px;line-height:1.6;">${escHtml(l)}</p>`)
                .join('');
        })
        .filter(Boolean)
        .join('\n');

    const ctaBlock = ctaLabel && ctaUrl
        ? `<div style="margin:28px 0;">
             <a href="${ctaUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">${escHtml(ctaLabel)}</a>
           </div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Scandio</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f9fafb;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #f3f4f6;">
              <span style="font-size:18px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Scandio</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;font-size:15px;color:#374151;">
              ${paragraphs}
              ${ctaBlock}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f3f4f6;background:#f9fafb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
                Scandio · Cape Town, South Africa<br>
                This is a transactional email related to your application.
                You received it because you submitted an application at scandio.co.za.<br>
                To unsubscribe from future emails, reply with "unsubscribe" in the subject.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Email body templates ──────────────────────────────────────────────────────

/**
 * Stage 1 — transactional confirmation after application submission.
 * Returns { text, html } — pass both to sendScandioEmail.
 */
export function confirmationEmail(firstName: string, businessName: string): { text: string; html: string } {
    const text = [
        `Hi ${firstName},`,
        '',
        `Thanks for applying to join the Scandio contractor network${businessName ? ` on behalf of ${businessName}` : ''}.`,
        '',
        'We have received your application and will be in touch within a couple of business days once we have reviewed your details.',
        '',
        'While you wait, here is what happens next:',
        '  1. We review your application and service area fit.',
        '  2. If approved, you will receive a link to complete your profile.',
        '  3. Once your profile is live, you will start appearing in relevant homeowner matches.',
        '',
        'If you have any questions in the meantime, just reply to this email.',
        '',
        'Kind regards,',
        'Matthew',
        'Scandio',
    ].join('\n');

    const html = buildEmailHtml({ body: text });
    return { text, html };
}

/**
 * @deprecated Use confirmationEmail() which returns { text, html }.
 * Kept for backwards compatibility with the apply route.
 */
export function confirmationEmailBody(firstName: string, businessName: string): string {
    return confirmationEmail(firstName, businessName).text;
}

/**
 * Stage 3 — admin-triggered invitation with Gemini summary and secure edit link.
 * Returns { text, html } — pass both to sendScandioEmail.
 */
export function invitationEmail(
    firstName: string,
    geminiSummary: string,
    editUrl: string,
): { text: string; html: string } {
    const text = [
        `Hi ${firstName},`,
        '',
        'Great news — your application has been reviewed and your Scandio profile is ready.',
        '',
        'Here is a draft summary we put together based on your application:',
        '',
        '---',
        geminiSummary,
        '---',
        '',
        'Before your profile goes live, you have the opportunity to review and adjust this text to make sure it represents your business accurately.',
        '',
        'Use the button below to review and edit your profile:',
        editUrl,
        '',
        'This link is valid for 14 days. Once you are happy with your profile, we will finalise it and you will start appearing in homeowner matches.',
        '',
        'If you have any questions, just reply to this email.',
        '',
        'Kind regards,',
        'Matthew',
        'Scandio',
    ].join('\n');

    const html = buildEmailHtml({
        body:     text,
        ctaLabel: 'Review your profile',
        ctaUrl:   editUrl,
    });

    return { text, html };
}

/**
 * @deprecated Use invitationEmail() which returns { text, html }.
 */
export function invitationEmailBody(
    firstName: string,
    geminiSummary: string,
    editUrl: string,
): string {
    return invitationEmail(firstName, geminiSummary, editUrl).text;
}
