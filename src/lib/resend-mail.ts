// Required env vars: RESEND_API_KEY, RESEND_FROM
// Optional env vars: RESEND_REPLY_TO (defaults to RESEND_FROM)

import { Resend } from 'resend';

export type EmailRecipient = { email: string; name?: string };

export type SendScandioEmailOptions = {
    to: EmailRecipient;
    subject: string;
    /** Plain-text fallback — always required. */
    text: string;
    /** HTML body. Build with buildEmailHtml() for consistent spam-safe structure. */
    html?: string;
    /** Reply-to override. Defaults to RESEND_REPLY_TO env var. */
    replyTo?: string;
};

export type SendEmailResult =
    | { ok: true }
    | { ok: false; error: string };

export async function sendScandioEmail(options: SendScandioEmailOptions): Promise<SendEmailResult> {
    const apiKey    = process.env.RESEND_API_KEY;
    const from      = process.env.RESEND_FROM;
    const replyTo   = options.replyTo ?? process.env.RESEND_REPLY_TO ?? undefined;

    if (!apiKey || !from) {
        return {
            ok: false,
            error: 'Resend is not configured (missing RESEND_API_KEY or RESEND_FROM)',
        };
    }

    const html = options.html ?? buildEmailHtml({ body: options.text });

    const toField = options.to.name
        ? `${options.to.name} <${options.to.email}>`
        : options.to.email;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
        from,
        to: toField,
        replyTo,
        subject: options.subject,
        text:    options.text,
        html,
        headers: {
            'List-Unsubscribe': `<mailto:${replyTo ?? from}?subject=unsubscribe>`,
            'X-Mailer':         'Mendr',
        },
    });

    if (error) {
        return { ok: false, error: error.message };
    }
    return { ok: true };
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
  <title>Mendr</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f9fafb;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #f3f4f6;">
              <span style="font-size:18px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Mendr</span>
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
                Mendr · Cape Town, South Africa<br>
                This is a transactional email related to your application.
                You received it because you submitted an application at mendr.co.za. <!-- TODO(mendr-domain): update to real domain once mendr.co.za is live --><br>
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
        `Thanks for applying to join the Mendr contractor network${businessName ? ` on behalf of ${businessName}` : ''}.`,
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
        'Mendr',
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
        'Great news — your application has been reviewed and your Mendr profile is ready.',
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
        'Mendr',
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

/**
 * Post-job rating request email sent to homeowners ~48 h after they contact a contractor.
 * Each star links directly to /api/job-outcome?token=<uuid>&rating=N for one-click submission.
 */
export function jobRatingRequestEmail(params: {
    providerName: string;
    ratingBaseUrl: string; // e.g. https://mendr.co.za/api/job-outcome?token=<uuid>&rating=
}): { text: string; html: string } {
    const { providerName, ratingBaseUrl } = params;

    const stars = [1, 2, 3, 4, 5];
    const starLabels = ['Poor', 'Below average', 'Okay', 'Good', 'Excellent'];

    const text = [
        `Hi there,`,
        ``,
        `You recently contacted ${providerName} through Mendr. Did they help you sort out your home fault?`,
        ``,
        `Rate your experience:`,
        ...stars.map((n) => `  ${n} star${n > 1 ? 's' : ''} (${starLabels[n - 1]}): ${ratingBaseUrl}${n}`),
        ``,
        `This takes one click and helps other homeowners find great contractors.`,
        ``,
        `Thanks,`,
        `The Mendr team`,
    ].join('\n');

    const starButtonsHtml = stars
        .map((n) => {
            const emoji = '★'.repeat(n) + '☆'.repeat(5 - n);
            return `<a href="${ratingBaseUrl}${n}"
  style="display:inline-block;margin:0 4px;padding:10px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:22px;text-decoration:none;color:#111827;"
  title="${starLabels[n - 1]}">${emoji}</a>`;
        })
        .join('\n');

    const html = buildEmailHtml({
        body: [
            `Hi there,`,
            ``,
            `You recently contacted <strong>${escHtml(providerName)}</strong> through Mendr. Did they help you sort out your home fault?`,
            ``,
            `Rate your experience — it only takes one click:`,
        ].join('\n'),
    }).replace(
        '</td>',
        `<div style="margin:20px 0;text-align:center;">${starButtonsHtml}</div>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
  Your rating helps other homeowners find great contractors on Mendr.
</p></td>`,
    );

    return { text, html };
}

/**
 * Monthly lead digest email for providers.
 * Sent once per month to providers who received homeowner contact events.
 */
export function leadDigestEmail(params: {
    businessName: string;
    contactCount: number;
    tradeTypes: string[];
    month: string; // e.g. "April 2026"
    unsubscribeUrl: string;
    isRegistered: boolean;
}): { text: string; html: string } {
    const { businessName, contactCount, tradeTypes, month, unsubscribeUrl, isRegistered } = params;

    const contactWord = contactCount === 1 ? 'homeowner' : 'homeowners';
    const contactVerb = contactCount === 1 ? 'tried' : 'tried';
    const tradeList = tradeTypes.filter(Boolean).join(', ') || 'general home services';
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mendr.co.za'; // TODO(mendr-domain): update once live

    const body = isRegistered
        ? [
              `Hi ${businessName},`,
              '',
              `You received ${contactCount} homeowner contact${contactCount === 1 ? '' : 's'} last month via Mendr during ${month}.`,
              '',
              `Service types enquired about: ${tradeList}`,
              '',
              'Sign in to your Mendr account to view your application status and profile.',
              '',
              `${siteUrl}/contractors/account`,
              '',
              '---',
              `You're receiving this because your business appears in our local contractor directory.`,
              `To stop receiving these emails: ${unsubscribeUrl}`,
          ].join('\n')
        : [
              `Hi ${businessName},`,
              '',
              `${contactCount} ${contactWord} in your area ${contactVerb} to contact you through Mendr during ${month}.`,
              '',
              `Service types enquired about: ${tradeList}`,
              '',
              'Mendr connects homeowners with trusted local contractors. Claim your free profile to respond to future leads and grow your business.',
              '',
              `${siteUrl}/contractors/network`,
              '',
              '---',
              `You're receiving this because your business appears in our local contractor directory.`,
              `To stop receiving these emails: ${unsubscribeUrl}`,
          ].join('\n');

    const html = buildEmailHtml({
        body,
        ctaLabel: isRegistered ? 'View my account' : 'Claim your free profile',
        ctaUrl: isRegistered ? `${siteUrl}/contractors/account` : `${siteUrl}/contractors/network`,
    });

    return { text: body, html };
}
