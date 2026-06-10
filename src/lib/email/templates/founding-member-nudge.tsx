/**
 * Email to contractors who applied but haven't completed their profile.
 *
 * Reminds them of the founding member pricing lock-in: 30% off for life for
 * the first 50 contractors.
 *
 * Usage:
 *   import {
 *     FoundingMemberNudgeEmail,
 *     foundingMemberNudgeText,
 *   } from '@/lib/email/templates/founding-member-nudge';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FoundingMemberNudgeEmailProps {
    firstName: string;
    spotsRemaining: number;
    profileUrl: string;
    unsubscribeUrl: string;
}

// ── Benefits list ─────────────────────────────────────────────────────────────

const BENEFITS = [
    '30% off your monthly subscription — locked in forever',
    'First access to new features',
    'Founding member badge on your profile',
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function FoundingMemberNudgeEmail({
    firstName,
    spotsRemaining,
    profileUrl,
    unsubscribeUrl,
}: FoundingMemberNudgeEmailProps) {
    const previewText = `Only ${spotsRemaining} founding member spots left, ${firstName}`;

    return (
        <MendrEmailLayout
            previewText={previewText}
            footerExtra={
                <Link href={unsubscribeUrl} style={{ color: '#737373' }}>
                    Unsubscribe
                </Link>
            }
        >
            {/* Gold accent banner */}
            <Section
                style={{
                    backgroundColor: '#171717',
                    borderRadius:    8,
                    padding:         '10px 16px',
                    marginBottom:    20,
                    textAlign:       'center' as const,
                }}
            >
                <Text
                    style={{
                        margin:     0,
                        fontSize:   13,
                        fontWeight: 600,
                        color:      '#FFFFFF',
                        lineHeight: 1.4,
                        letterSpacing: '0.5px',
                    }}
                >
                    ★ Founding Member Offer
                </Text>
            </Section>

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
                {spotsRemaining} spots left. Your 30% lifetime discount is still reserved.
            </Text>

            {/* Body */}
            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                When you applied to Mendr, we reserved a founding member price for
                you — 30% off your chosen plan for life. No price increases, ever.
                But we can only hold this for the first 50 contractors, and spots
                are filling.
            </Text>

            {/* Benefits heading */}
            <Text
                style={{
                    margin:     '0 0 8px',
                    fontSize:   13,
                    fontWeight: 600,
                    color:      '#0A0A0A',
                    lineHeight: 1.5,
                }}
            >
                What you&apos;re getting:
            </Text>

            {/* Benefits list with sage checks */}
            {BENEFITS.map((benefit) => (
                <Section
                    key={benefit}
                    style={{
                        marginBottom: 6,
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
                                color:       '#171717',
                                fontWeight:  600,
                                marginRight: 8,
                            }}
                        >
                            ✓
                        </span>
                        {benefit}
                    </Text>
                </Section>
            ))}

            {/* CTA */}
            <Section style={{ margin: '24px 0 16px' }}>
                <MendrButton href={profileUrl}>
                    Activate your founding membership
                </MendrButton>
            </Section>

            {/* Sign-off */}
            <Text
                style={{
                    margin:     '0',
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

export function foundingMemberNudgeText(
    params: FoundingMemberNudgeEmailProps,
): string {
    const { firstName, spotsRemaining, profileUrl, unsubscribeUrl } = params;

    return [
        `Hi ${firstName},`,
        '',
        `★ Founding Member Offer`,
        '',
        `${spotsRemaining} spots left. Your 30% lifetime discount is still reserved.`,
        '',
        `When you applied to Mendr, we reserved a founding member price for you — 30% off your chosen plan for life. No price increases, ever. But we can only hold this for the first 50 contractors, and spots are filling.`,
        '',
        "What you're getting:",
        '',
        '- 30% off your monthly subscription — locked in forever',
        '- First access to new features',
        '- Founding member badge on your profile',
        '',
        'Activate your founding membership:',
        profileUrl,
        '',
        'Kind regards,',
        'The Mendr team',
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
}
