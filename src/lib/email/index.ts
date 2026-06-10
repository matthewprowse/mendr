/**
 * Public surface of the Mendr email module.
 *
 * Import from '@/lib/email' rather than from the individual files.
 *
 * Layout / components:
 *   MendrEmailLayout  — wrapping layout for all emails
 *   MendrButton       — neutral primary CTA button
 *
 * Design tokens:
 *   EMAIL_COLORS, EMAIL_RADIUS, EMAIL_FONT_STACK — neutral shadcn palette + font
 *
 * Types:
 *   MendrEmailLayoutProps
 *   MendrButtonProps
 *   MendrEmailPayload
 *   SendEmailResult
 *
 * Send utility:
 *   sendMendrEmail(payload)        — render + send via Resend
 *
 * Unsubscribe helpers:
 *   generateUnsubscribeToken(email, secret)
 *   generateUnsubscribeUrl(email)
 */

export type { MendrEmailLayoutProps, MendrButtonProps } from './layout';
export { MendrEmailLayout, MendrButton } from './layout';

export {
    EMAIL_COLORS,
    EMAIL_RADIUS,
    EMAIL_FONT_STACK,
    getEmailAssetOrigin,
    anthropicSansFontFaceCss,
} from './tokens';

export type { MendrEmailPayload, SendEmailResult } from './utils';
export { sendMendrEmail, generateUnsubscribeToken, generateUnsubscribeUrl } from './utils';
