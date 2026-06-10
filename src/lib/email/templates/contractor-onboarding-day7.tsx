/**
 * Lifecycle email sent 7 days after contractor approval — motivational check-in.
 *
 * Usage:
 *   import { ContractorOnboardingDay7Email, contractorOnboardingDay7Text } from '@/lib/email/templates/contractor-onboarding-day7';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContractorOnboardingDay7EmailProps {
    firstName: string;
    leadsUrl: string;
    siteUrl: string;
    unsubscribeUrl: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContractorOnboardingDay7Email({
    firstName,
    leadsUrl,
    unsubscribeUrl,
}: ContractorOnboardingDay7EmailProps) {
    const previewText = `${firstName}, your first Mendr lead could be this week`;

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
                One week in.
            </Text>

            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                It&apos;s been a week. Homeowners in the Western Cape are uploading faults every
                day — damp patches, electrical faults, plumbing leaks, cracked plaster. When one
                matches your trade and coverage area, you&apos;ll get a notification.
            </Text>

            {/* Bullets */}
            <Text
                style={{
                    margin:     '0 0 12px',
                    fontSize:   14,
                    fontWeight: 600,
                    color:      '#0A0A0A',
                    lineHeight: 1.4,
                }}
            >
                A few things worth knowing:
            </Text>

            <Section style={{ marginBottom: 24 }}>
                {/* Bullet 1 */}
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
                    Leads come by email — make sure your inbox is monitored
                </Text>

                {/* Bullet 2 */}
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
                    The homeowner already has a diagnosis, so your quote should address the
                    specific issue identified
                </Text>

                {/* Bullet 3 */}
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
                    Speed matters — contractors who respond within 24 hours win more work
                </Text>
            </Section>

            {/* CTA */}
            <Section style={{ margin: '0 0 20px' }}>
                <MendrButton href={leadsUrl}>Check your lead dashboard</MendrButton>
            </Section>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function contractorOnboardingDay7Text(
    params: ContractorOnboardingDay7EmailProps,
): string {
    const { firstName, leadsUrl, unsubscribeUrl } = params;
    return [
        `Hi ${firstName},`,
        '',
        "It's been a week. Homeowners in the Western Cape are uploading faults every day — damp patches, electrical faults, plumbing leaks, cracked plaster. When one matches your trade and coverage area, you'll get a notification.",
        '',
        'A few things worth knowing:',
        '',
        '- Leads come by email — make sure your inbox is monitored',
        '- The homeowner already has a diagnosis, so your quote should address the specific issue identified',
        '- Speed matters — contractors who respond within 24 hours win more work',
        '',
        'Check your lead dashboard:',
        leadsUrl,
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
}
