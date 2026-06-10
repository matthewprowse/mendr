/**
 * Transactional email sent immediately when a contractor application is approved.
 *
 * Usage:
 *   import { ContractorWelcomeEmail, contractorWelcomeText } from '@/lib/email/templates/contractor-welcome';
 */

import React from 'react';
import { Text, Section } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContractorWelcomeEmailProps {
    firstName: string;
    businessName: string;
    profileUrl: string;
    unsubscribeUrl: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContractorWelcomeEmail({
    firstName,
    businessName,
    profileUrl,
}: ContractorWelcomeEmailProps) {
    const previewText = `Welcome to Mendr, ${firstName} — your profile is live`;

    return (
        <MendrEmailLayout previewText={previewText}>
            {/* Heading */}
            <Text
                style={{
                    margin:     '0 0 6px',
                    fontSize:   24,
                    fontWeight: 600,
                    color:      '#0A0A0A',
                    lineHeight: 1.25,
                }}
            >
                You&apos;re in. Welcome to Mendr.
            </Text>

            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                Hi {firstName}, your application has been approved and {businessName} is now live
                on the Mendr network.
            </Text>

            {/* How leads work */}
            <Text
                style={{
                    margin:     '0 0 12px',
                    fontSize:   14,
                    fontWeight: 600,
                    color:      '#0A0A0A',
                    lineHeight: 1.4,
                }}
            >
                Here&apos;s how leads work:
            </Text>

            {/* Step 1 */}
            <Section
                style={{
                    display:      'flex',
                    marginBottom: 12,
                }}
            >
                <Text
                    style={{
                        margin:     0,
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.6,
                    }}
                >
                    <span
                        style={{
                            display:         'inline-block',
                            backgroundColor: '#171717',
                            color:           '#FFFFFF',
                            borderRadius:    '50%',
                            width:           22,
                            height:          22,
                            fontSize:        12,
                            fontWeight:      600,
                            textAlign:       'center',
                            lineHeight:      '22px',
                            marginRight:     10,
                            verticalAlign:   'middle',
                        }}
                    >
                        1
                    </span>
                    A homeowner uploads a photo of a fault — Mendr diagnoses it.
                </Text>
            </Section>

            {/* Step 2 */}
            <Section
                style={{
                    marginBottom: 12,
                }}
            >
                <Text
                    style={{
                        margin:     0,
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.6,
                    }}
                >
                    <span
                        style={{
                            display:         'inline-block',
                            backgroundColor: '#171717',
                            color:           '#FFFFFF',
                            borderRadius:    '50%',
                            width:           22,
                            height:          22,
                            fontSize:        12,
                            fontWeight:      600,
                            textAlign:       'center',
                            lineHeight:      '22px',
                            marginRight:     10,
                            verticalAlign:   'middle',
                        }}
                    >
                        2
                    </span>
                    You receive the pre-diagnosed lead — fault type, urgency, and estimated cost already included.
                </Text>
            </Section>

            {/* Step 3 */}
            <Section
                style={{
                    marginBottom: 24,
                }}
            >
                <Text
                    style={{
                        margin:     0,
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.6,
                    }}
                >
                    <span
                        style={{
                            display:         'inline-block',
                            backgroundColor: '#171717',
                            color:           '#FFFFFF',
                            borderRadius:    '50%',
                            width:           22,
                            height:          22,
                            fontSize:        12,
                            fontWeight:      600,
                            textAlign:       'center',
                            lineHeight:      '22px',
                            marginRight:     10,
                            verticalAlign:   'middle',
                        }}
                    >
                        3
                    </span>
                    You send your quote. No bidding. No commission. Your price is your price.
                </Text>
            </Section>

            {/* Profile tip */}
            <Section
                style={{
                    backgroundColor: '#F5F5F5',
                    border:          '1px solid #E5E5E5',
                    borderRadius:    14,
                    padding:         '14px 18px',
                    marginBottom:    24,
                }}
            >
                <Text
                    style={{
                        margin:     0,
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.6,
                    }}
                >
                    <strong>Profile tip:</strong> Make sure your profile is complete — contractors
                    with photos and a clear description get 40% more enquiries.
                </Text>
            </Section>

            {/* CTA */}
            <Section style={{ margin: '0 0 20px' }}>
                <MendrButton href={profileUrl}>Review your profile</MendrButton>
            </Section>

            {/* Sign-off */}
            <Text
                style={{
                    margin:     0,
                    fontSize:   14,
                    color:      '#737373',
                    lineHeight: 1.6,
                }}
            >
                Need help? Just reply to this email.
            </Text>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function contractorWelcomeText(params: ContractorWelcomeEmailProps): string {
    const { firstName, businessName, profileUrl } = params;
    return [
        `Welcome to Mendr, ${firstName}.`,
        '',
        `Your application has been approved and ${businessName} is now live on the Mendr network.`,
        '',
        "Here's how leads work:",
        '',
        '1. A homeowner uploads a photo of a fault — Mendr diagnoses it.',
        '2. You receive the pre-diagnosed lead — fault type, urgency, and estimated cost already included.',
        '3. You send your quote. No bidding. No commission. Your price is your price.',
        '',
        'Profile tip: Make sure your profile is complete — contractors with photos and a clear description get 40% more enquiries.',
        '',
        'Review your profile:',
        profileUrl,
        '',
        'Need help? Just reply to this email.',
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
    ].join('\n');
}
