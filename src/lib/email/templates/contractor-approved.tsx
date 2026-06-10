/**
 * Transactional email sent to a contractor when their Mendr application is approved.
 *
 * Stage 3 invitation: the Pro's profile is ready to review. Rendered as a
 * proper React Email component while keeping the same content and intent.
 *
 * Usage:
 *   import {
 *     ContractorApprovedEmail,
 *     contractorApprovedText,
 *   } from '@/lib/email/templates/contractor-approved';
 */

import React from 'react';
import { Text, Section } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContractorApprovedEmailProps {
    firstName: string;
    geminiSummary: string;
    editUrl: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContractorApprovedEmail({
    firstName,
    geminiSummary,
    editUrl,
}: ContractorApprovedEmailProps) {
    const previewText = `Your Mendr application has been approved, ${firstName}`;

    return (
        <MendrEmailLayout previewText={previewText}>
            {/* Greeting */}
            <Text
                style={{
                    margin:     '0 0 12px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                Hi {firstName},
            </Text>

            {/* Headline */}
            <Text
                style={{
                    margin:     '0 0 16px',
                    fontSize:   24,
                    fontWeight: 600,
                    color:      '#0A0A0A',
                    lineHeight: 1.25,
                }}
            >
                Great news — you&apos;re approved.
            </Text>

            <Text
                style={{
                    margin:     '0 0 16px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                Here is a draft summary we put together based on your application:
            </Text>

            {/* Profile summary box */}
            <Section
                style={{
                    backgroundColor: '#F5F5F5',
                    border:          '1px solid #E5E5E5',
                    borderRadius:    14,
                    padding:         '16px 20px',
                    marginBottom:    20,
                }}
            >
                <Text
                    style={{
                        margin:     0,
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {geminiSummary}
                </Text>
            </Section>

            {/* Review note */}
            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                Review this summary and edit any details before your profile goes live.
            </Text>

            {/* CTA */}
            <Section style={{ margin: '0 0 16px' }}>
                <MendrButton href={editUrl}>Review your profile</MendrButton>
            </Section>

            {/* Validity note */}
            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   13,
                    color:      '#737373',
                    lineHeight: 1.6,
                }}
            >
                This link is valid for 14 days.
            </Text>

            {/* Sign-off */}
            <Text
                style={{
                    margin:     '0',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                If you have any questions, just reply to this email.
            </Text>

            <Text
                style={{
                    margin:     '12px 0 0',
                    fontSize:   14,
                    color:      '#404040',
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

export function contractorApprovedText(
    firstName: string,
    geminiSummary: string,
    editUrl: string,
): string {
    return [
        `Hi ${firstName},`,
        '',
        "Great news — you're approved.",
        '',
        'Here is a draft summary we put together based on your application:',
        '',
        '---',
        geminiSummary,
        '---',
        '',
        'Review this summary and edit any details before your profile goes live.',
        '',
        'Review your profile:',
        editUrl,
        '',
        'This link is valid for 14 days.',
        '',
        'If you have any questions, just reply to this email.',
        '',
        'Kind regards,',
        'The Mendr team',
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
    ].join('\n');
}
