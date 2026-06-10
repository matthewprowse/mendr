/**
 * Homeowner re-engagement email — sent to homeowners who haven't returned in 90+ days.
 *
 * Usage:
 *   import { HomeownerReengagementEmail, homeownerReengagementText } from '@/lib/email/templates/homeowner-reengagement';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HomeownerReengagementEmailProps {
    diagnosisCount: number;
    lastFaultTitle: string;
    siteUrl:        string;
    unsubscribeUrl: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HomeownerReengagementEmail({
    diagnosisCount,
    lastFaultTitle,
    siteUrl,
    unsubscribeUrl,
}: HomeownerReengagementEmailProps) {
    const previewText  = "Your home won't fix itself — Mendr is still free";
    const timesLabel   = diagnosisCount === 1 ? 'time' : 'times';

    const footerExtra = (
        <Link href={unsubscribeUrl} style={{ color: '#737373', textDecoration: 'underline' }}>
            Unsubscribe
        </Link>
    );

    return (
        <MendrEmailLayout previewText={previewText} footerExtra={footerExtra}>
            {/* Heading */}
            <Text
                style={{
                    margin:     '0 0 16px',
                    fontSize:   24,
                    fontWeight: 600,
                    color:      '#0A0A0A',
                    lineHeight: 1.25,
                }}
            >
                It&apos;s been a while.
            </Text>

            {/* Usage summary */}
            <Text
                style={{
                    margin:     '0 0 16px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                You&apos;ve already used Mendr {diagnosisCount} {timesLabel}. Your last diagnosis was:{' '}
                <strong>{lastFaultTitle}</strong>.
            </Text>

            {/* Reactivation angle */}
            <Section
                style={{
                    backgroundColor: '#F5F5F5',
                    border:          '1px solid #E5E5E5',
                    borderRadius:    8,
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
                    South African homes need year-round attention — especially in the Western Cape.
                    Whether it&apos;s summer wind damage or winter damp, we&apos;re still here when you need us.
                </Text>
            </Section>

            {/* CTA */}
            <Section style={{ margin: '0 0 20px' }}>
                <MendrButton href={`${siteUrl}/start`}>Get a new free diagnosis</MendrButton>
            </Section>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function homeownerReengagementText(params: HomeownerReengagementEmailProps): string {
    const { diagnosisCount, lastFaultTitle, siteUrl, unsubscribeUrl } = params;
    const timesLabel = diagnosisCount === 1 ? 'time' : 'times';

    return [
        "It's been a while.",
        '',
        `You've already used Mendr ${diagnosisCount} ${timesLabel}. Your last diagnosis was: ${lastFaultTitle}.`,
        '',
        "South African homes need year-round attention — especially in the Western Cape.",
        "Whether it's summer wind damage or winter damp, we're still here when you need us.",
        '',
        'Get a new free diagnosis:',
        `${siteUrl}/start`,
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
}
