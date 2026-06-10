/**
 * Cold outreach email sent to contractors who are NOT yet on the Mendr platform.
 *
 * These are businesses found in the local contractor directory (Google Places
 * enrichment) who have been contacted by homeowners but haven't signed up.
 *
 * Usage:
 *   import {
 *     ContractorOutreachEmail,
 *     contractorOutreachText,
 *   } from '@/lib/email/templates/contractor-outreach';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContractorOutreachEmailProps {
    businessName: string;
    contactCount: number;
    tradeType: string;      // e.g. "Waterproofing"
    month: string;          // e.g. "May 2026"
    applyUrl: string;       // e.g. https://mendr.co.za/pro/network
    unsubscribeUrl: string;
}

// ── Value proposition chips ───────────────────────────────────────────────────

const VALUE_PROPS = [
    'Pre-diagnosed leads — homeowners already know the fault',
    'Zero commission, ever',
    'Flat subscription from R249/month',
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function ContractorOutreachEmail({
    businessName,
    contactCount,
    tradeType,
    month,
    applyUrl,
    unsubscribeUrl,
}: ContractorOutreachEmailProps) {
    const plural = contactCount === 1 ? '' : 's';
    const previewText = `${contactCount} homeowner${plural} tried to reach you last month — here's why`;

    return (
        <MendrEmailLayout
            previewText={previewText}
            footerExtra={
                <>
                    You&apos;re receiving this because {businessName} was found by Mendr homeowners
                    searching for {tradeType} in the Western Cape.{' '}
                    <Link href={unsubscribeUrl} style={{ color: '#737373' }}>
                        Unsubscribe
                    </Link>
                </>
            }
        >
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
                {contactCount} homeowner{plural} tried to contact you in {month}.
            </Text>

            {/* Hook */}
            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                They found <strong>{businessName}</strong> while searching for{' '}
                <strong>{tradeType}</strong> help in the Western Cape. Mendr showed them
                your business — but you&apos;re not yet a verified member, so they
                couldn&apos;t reach you directly.
            </Text>

            {/* Value proposition chips */}
            <Text
                style={{
                    margin:     '0 0 8px',
                    fontSize:   13,
                    fontWeight: 600,
                    color:      '#0A0A0A',
                    lineHeight: 1.5,
                }}
            >
                What you get as a Mendr member:
            </Text>

            {VALUE_PROPS.map((prop) => (
                <Section
                    key={prop}
                    style={{
                        marginBottom: 6,
                    }}
                >
                    <Text
                        style={{
                            margin:          0,
                            padding:         '8px 14px',
                            backgroundColor: '#F5F5F5',
                            border:          '1px solid #E5E5E5',
                            borderRadius:    6,
                            fontSize:        14,
                            color:           '#404040',
                            lineHeight:      1.5,
                        }}
                    >
                        ✓ {prop}
                    </Text>
                </Section>
            ))}

            {/* CTA */}
            <Section style={{ margin: '24px 0 20px' }}>
                <MendrButton href={applyUrl}>
                    Claim your profile — it&apos;s free to apply
                </MendrButton>
            </Section>

            {/* Respectful close */}
            <Text
                style={{
                    margin:     '0',
                    fontSize:   13,
                    color:      '#737373',
                    lineHeight: 1.6,
                }}
            >
                This is the only time we&apos;ll send you this email if you don&apos;t
                respond. No follow-ups, no pressure.
            </Text>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function contractorOutreachText(
    params: ContractorOutreachEmailProps,
): string {
    const { businessName, contactCount, tradeType, month, applyUrl, unsubscribeUrl } = params;
    const plural = contactCount === 1 ? '' : 's';

    return [
        `${contactCount} homeowner${plural} tried to contact you in ${month}.`,
        '',
        `They found ${businessName} while searching for ${tradeType} help in the Western Cape.`,
        `Mendr showed them your business — but you're not yet a verified member, so they couldn't reach you directly.`,
        '',
        'What you get as a Mendr member:',
        '',
        '- Pre-diagnosed leads — homeowners already know the fault',
        '- Zero commission, ever',
        '- Flat subscription from R249/month',
        '',
        `Claim your profile — it's free to apply:`,
        applyUrl,
        '',
        `This is the only time we'll send you this email if you don't respond. No follow-ups, no pressure.`,
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `You're receiving this because ${businessName} was found by Mendr homeowners searching for ${tradeType} in the Western Cape.`,
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
}
