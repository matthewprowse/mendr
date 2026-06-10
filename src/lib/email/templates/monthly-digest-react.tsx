/**
 * Monthly lead digest sent to a Pro summarising the homeowner contacts they
 *
 * DO NOT modify the legacy function — this is a new parallel template.
 * Once this template is fully adopted, the legacy function can be retired.
 *
 * Usage:
 *   import {
 *     MonthlyDigestReactEmail,
 *     monthlyDigestReactText,
 *   } from '@/lib/email/templates/monthly-digest-react';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MonthlyDigestReactEmailProps {
    businessName: string;
    contactCount: number;
    tradeTypes: string[];
    month: string;          // e.g. "May 2026"
    isRegistered: boolean;
    siteUrl: string;
    unsubscribeUrl: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MonthlyDigestReactEmail({
    businessName,
    contactCount,
    tradeTypes,
    month,
    isRegistered,
    siteUrl,
    unsubscribeUrl,
}: MonthlyDigestReactEmailProps) {
    const plural = contactCount === 1 ? '' : 's';
    const previewText = `${contactCount} homeowner contact${plural} on Mendr in ${month}`;

    const ctaHref = isRegistered
        ? `${siteUrl}/pro/account`
        : `${siteUrl}/pro/network`;

    const ctaLabel = isRegistered ? 'View your account' : 'Claim your profile';

    return (
        <MendrEmailLayout
            previewText={previewText}
            footerExtra={
                <Link href={unsubscribeUrl} style={{ color: '#737373' }}>
                    Unsubscribe
                </Link>
            }
        >
            {/* Greeting */}
            <Text
                style={{
                    margin:     '0 0 12px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                Hi {businessName},
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
                Your {month} summary.
            </Text>

            {/* Context line */}
            <Text
                style={{
                    margin:     '0 0 16px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                {isRegistered
                    ? `Here is a summary of your homeowner contacts via Mendr in ${month}.`
                    : `${contactCount} homeowner${plural} tried to reach you — but you're not yet a member. Claim your profile to start receiving leads directly.`}
            </Text>

            {/* Lead count block — terracotta left border, dune background */}
            <Section
                style={{
                    borderLeft:      '4px solid #171717',
                    backgroundColor: '#F5F5F5',
                    borderRadius:    '0 8px 8px 0',
                    padding:         '14px 18px',
                    marginBottom:    20,
                }}
            >
                <Text
                    style={{
                        margin:     '0 0 6px',
                        fontSize:   20,
                        fontWeight: 600,
                        color:      '#0A0A0A',
                        lineHeight: 1.2,
                    }}
                >
                    {contactCount} homeowner contact{plural} in {month}
                </Text>
                {tradeTypes.length > 0 && (
                    <Text
                        style={{
                            margin:     0,
                            fontSize:   13,
                            color:      '#737373',
                            lineHeight: 1.5,
                        }}
                    >
                        Trade{tradeTypes.length === 1 ? '' : 's'}: {tradeTypes.join(', ')}
                    </Text>
                )}
            </Section>

            {/* CTA */}
            <Section style={{ margin: '0 0 16px' }}>
                <MendrButton href={ctaHref}>{ctaLabel}</MendrButton>
            </Section>

            {/* Sign-off */}
            <Text
                style={{
                    margin:     '8px 0 0',
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

export function monthlyDigestReactText(
    params: MonthlyDigestReactEmailProps,
): string {
    const { businessName, contactCount, tradeTypes, month, isRegistered, siteUrl, unsubscribeUrl } =
        params;

    const plural = contactCount === 1 ? '' : 's';
    const ctaHref = isRegistered
        ? `${siteUrl}/pro/account`
        : `${siteUrl}/pro/network`;

    const ctaLabel = isRegistered ? 'View your account' : 'Claim your profile';

    const bodyLine = isRegistered
        ? `Here is a summary of your homeowner contacts via Mendr in ${month}.`
        : `${contactCount} homeowner${plural} tried to reach you — but you're not yet a member. Claim your profile to start receiving leads directly.`;

    const lines = [
        `Hi ${businessName},`,
        '',
        `Your ${month} summary.`,
        '',
        bodyLine,
        '',
        `${contactCount} homeowner contact${plural} in ${month}`,
    ];

    if (tradeTypes.length > 0) {
        lines.push(`Trade${tradeTypes.length === 1 ? '' : 's'}: ${tradeTypes.join(', ')}`);
    }

    lines.push(
        '',
        `${ctaLabel}:`,
        ctaHref,
        '',
        'Kind regards,',
        'The Mendr team',
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `Unsubscribe: ${unsubscribeUrl}`,
    );

    return lines.join('\n');
}
