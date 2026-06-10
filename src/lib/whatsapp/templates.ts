/**
 * Template registry (Phase C, Workstream 5).
 *
 * Templates must be approved in the WABA before they can be sent. Names here
 * must match the approved names exactly; override via env when a BSP requires
 * a namespace prefix. All sends go through the outbox (opt-out aware).
 *
 * Submission copy lives in docs/WhatsApp Phase C Launch Plan.md — keep the
 * {{n}} parameter order in sync with `bodyParams` below.
 */

import type { TemplateParams } from './channel/types';

const LANG = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en';

function name(envKey: string, fallback: string): string {
    return process.env[envKey] ?? fallback;
}

/** "You were diagnosing {{1}}. Want to pick up where you left off?" */
export function resumeDiagnosisTemplate(issueTitle: string): TemplateParams {
    return {
        name: name('WHATSAPP_TEMPLATE_RESUME', 'resume_diagnosis'),
        language: LANG,
        bodyParams: [issueTitle.slice(0, 120) || 'your repair'],
    };
}

/** "New Mendr lead: {{1}} near {{2}}. Open your leads inbox: {{3}}" */
export function leadAlertContractorTemplate(
    trade: string,
    area: string,
    leadsUrl: string,
): TemplateParams {
    return {
        name: name('WHATSAPP_TEMPLATE_LEAD_ALERT', 'lead_alert_contractor'),
        language: LANG,
        bodyParams: [trade.slice(0, 80) || 'a job', area.slice(0, 80) || 'your area', leadsUrl],
    };
}

/** "Did {{1}} sort out your {{2}}? Reply YES or NO — it helps your neighbours." */
export function jobFollowupTemplate(providerName: string, issueTitle: string): TemplateParams {
    return {
        name: name('WHATSAPP_TEMPLATE_FOLLOWUP', 'job_followup'),
        language: LANG,
        bodyParams: [
            providerName.slice(0, 80) || 'the contractor',
            issueTitle.slice(0, 120) || 'repair',
        ],
    };
}

/** "Your Mendr verification code is {{1}}. It expires in 10 minutes." */
export function linkAccountOtpTemplate(code: string): TemplateParams {
    return {
        name: name('WHATSAPP_TEMPLATE_OTP', 'link_account_otp'),
        language: LANG,
        bodyParams: [code],
    };
}
