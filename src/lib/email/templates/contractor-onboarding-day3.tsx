/**
 * Lifecycle email sent 3 days after contractor approval if their profile is incomplete.
 *
 * Usage:
 *   import { ContractorOnboardingDay3Email, contractorOnboardingDay3Text } from '@/lib/email/templates/contractor-onboarding-day3';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContractorOnboardingDay3EmailProps {
    firstName: string;
    profileUrl: string;
    unsubscribeUrl: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContractorOnboardingDay3Email({
    firstName,
    profileUrl,
    unsubscribeUrl,
}: ContractorOnboardingDay3EmailProps) {
    const previewText = `${firstName}, your profile still needs a few finishing touches`;

    return (
        <MendrEmailLayout
            previewText={previewText}
            footerExtra={
                <Link href={unsubscribeUrl} style={{ color: '#737373', textDecoration: 'underline' }}>
                    Unsubscribe
                </Link>
            }
        >
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
                A quick check-in.
            </Text>

            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                It&apos;s been three days since you joined Mendr. Contractors with complete
                profiles — including a profile photo and a clear description of their trade —
                appear higher in homeowner results.
            </Text>

            {/* Checklist */}
            <Section style={{ marginBottom: 24 }}>
                {/* Item 1 */}
                <Text
                    style={{
                        margin:     '0 0 10px',
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.5,
                    }}
                >
                    <span
                        style={{
                            display:         'inline-block',
                            backgroundColor: '#171717',
                            borderRadius:    '50%',
                            width:           8,
                            height:          8,
                            marginRight:     10,
                            verticalAlign:   'middle',
                        }}
                    >
                        &nbsp;
                    </span>
                    Add a profile photo
                </Text>

                {/* Item 2 */}
                <Text
                    style={{
                        margin:     '0 0 10px',
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.5,
                    }}
                >
                    <span
                        style={{
                            display:         'inline-block',
                            backgroundColor: '#171717',
                            borderRadius:    '50%',
                            width:           8,
                            height:          8,
                            marginRight:     10,
                            verticalAlign:   'middle',
                        }}
                    >
                        &nbsp;
                    </span>
                    Write a short description of your trade and service area
                </Text>

                {/* Item 3 */}
                <Text
                    style={{
                        margin:     0,
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.5,
                    }}
                >
                    <span
                        style={{
                            display:         'inline-block',
                            backgroundColor: '#171717',
                            borderRadius:    '50%',
                            width:           8,
                            height:          8,
                            marginRight:     10,
                            verticalAlign:   'middle',
                        }}
                    >
                        &nbsp;
                    </span>
                    Confirm your coverage areas are correct
                </Text>
            </Section>

            {/* CTA */}
            <Section style={{ margin: '0 0 20px' }}>
                <MendrButton href={profileUrl}>Complete your profile</MendrButton>
            </Section>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function contractorOnboardingDay3Text(
    params: ContractorOnboardingDay3EmailProps,
): string {
    const { firstName, profileUrl, unsubscribeUrl } = params;
    return [
        `Hi ${firstName},`,
        '',
        "It's been three days since you joined Mendr. Contractors with complete profiles — including a profile photo and a clear description of their trade — appear higher in homeowner results.",
        '',
        'A few things to finish up:',
        '',
        '- Add a profile photo',
        '- Write a short description of your trade and service area',
        '- Confirm your coverage areas are correct',
        '',
        'Complete your profile:',
        profileUrl,
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
}
