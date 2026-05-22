/**
 * Transactional email sent to a contractor immediately after they submit
 * their application to the Mendr contractor network.
 *
 * Upgrades the legacy `confirmationEmail()` function in resend-mail.ts to a
 * proper React Email component while keeping the same content structure.
 *
 * Usage:
 *   import {
 *     ContractorApplicationReceivedEmail,
 *     contractorApplicationReceivedText,
 *   } from '@/lib/email/templates/contractor-application-received';
 */

import React from 'react';
import { Text, Section } from '@react-email/components';
import { MendrEmailLayout } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContractorApplicationReceivedEmailProps {
    firstName: string;
    businessName: string;
}

// ── Step data ─────────────────────────────────────────────────────────────────

const STEPS = [
    {
        number: '1',
        heading: 'We review your application',
        detail: 'Our team checks your details and service area fit — usually within 1–2 business days.',
    },
    {
        number: '2',
        heading: 'If approved, you receive a profile link',
        detail: 'You\'ll get a secure link to review and finalise your Mendr profile before it goes live.',
    },
    {
        number: '3',
        heading: 'You start appearing in homeowner matches',
        detail: 'Once your profile is live, Mendr connects you with pre-diagnosed homeowner leads in your area.',
    },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function ContractorApplicationReceivedEmail({
    firstName,
    businessName,
}: ContractorApplicationReceivedEmailProps) {
    const businessSuffix = businessName ? ` on behalf of ${businessName}` : '';
    const previewText = `We've received your Mendr application, ${firstName}`;

    return (
        <MendrEmailLayout previewText={previewText}>
            {/* Greeting */}
            <Text
                style={{
                    margin:     '0 0 12px',
                    fontSize:   15,
                    color:      '#2F3E4E',
                    lineHeight: 1.6,
                }}
            >
                Hi {firstName},
            </Text>

            {/* Opening */}
            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   15,
                    color:      '#2F3E4E',
                    lineHeight: 1.6,
                }}
            >
                Thanks for applying to join the Mendr contractor network{businessSuffix}.
                We&apos;ve received your application and will be in touch shortly.
            </Text>

            {/* Steps heading */}
            <Text
                style={{
                    margin:     '0 0 12px',
                    fontSize:   14,
                    fontWeight: 600,
                    color:      '#1C2B3A',
                    lineHeight: 1.5,
                }}
            >
                What happens next:
            </Text>

            {/* Steps */}
            {STEPS.map((step) => (
                <Section
                    key={step.number}
                    style={{
                        display:      'flex',
                        marginBottom: 12,
                    }}
                >
                    <table
                        width="100%"
                        cellPadding={0}
                        cellSpacing={0}
                        role="presentation"
                        style={{ borderCollapse: 'collapse' }}
                    >
                        <tr>
                            {/* Number bubble */}
                            <td
                                style={{
                                    width:          32,
                                    verticalAlign:  'top',
                                    paddingRight:   12,
                                    paddingTop:     2,
                                }}
                            >
                                <span
                                    style={{
                                        display:         'inline-block',
                                        width:           24,
                                        height:          24,
                                        backgroundColor: '#1C2B3A',
                                        borderRadius:    '50%',
                                        color:           '#FFFFFF',
                                        fontSize:        12,
                                        fontWeight:      700,
                                        lineHeight:      '24px',
                                        textAlign:       'center',
                                    }}
                                >
                                    {step.number}
                                </span>
                            </td>
                            {/* Content */}
                            <td style={{ verticalAlign: 'top' }}>
                                <Text
                                    style={{
                                        margin:     '0 0 2px',
                                        fontSize:   14,
                                        fontWeight: 600,
                                        color:      '#1C2B3A',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {step.heading}
                                </Text>
                                <Text
                                    style={{
                                        margin:     0,
                                        fontSize:   13,
                                        color:      '#7A7064',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {step.detail}
                                </Text>
                            </td>
                        </tr>
                    </table>
                </Section>
            ))}

            {/* Sign-off */}
            <Text
                style={{
                    margin:     '20px 0 0',
                    fontSize:   15,
                    color:      '#2F3E4E',
                    lineHeight: 1.6,
                }}
            >
                If you have any questions in the meantime, just reply to this email.
            </Text>

            <Text
                style={{
                    margin:     '12px 0 0',
                    fontSize:   15,
                    color:      '#2F3E4E',
                    lineHeight: 1.6,
                }}
            >
                Kind regards,
                <br />
                The Mendr team
            </Text>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function contractorApplicationReceivedText(
    firstName: string,
    businessName: string,
): string {
    const businessSuffix = businessName ? ` on behalf of ${businessName}` : '';
    return [
        `Hi ${firstName},`,
        '',
        `Thanks for applying to join the Mendr contractor network${businessSuffix}.`,
        "We've received your application and will be in touch shortly.",
        '',
        'What happens next:',
        '',
        '1. We review your application',
        '   Our team checks your details and service area fit — usually within 1–2 business days.',
        '',
        '2. If approved, you receive a profile link',
        "   You'll get a secure link to review and finalise your Mendr profile before it goes live.",
        '',
        '3. You start appearing in homeowner matches',
        '   Once your profile is live, Mendr connects you with pre-diagnosed homeowner leads in your area.',
        '',
        'If you have any questions in the meantime, just reply to this email.',
        '',
        'Kind regards,',
        'The Mendr team',
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
    ].join('\n');
}
