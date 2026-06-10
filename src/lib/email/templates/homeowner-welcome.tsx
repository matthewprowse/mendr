/**
 * Homeowner welcome email — sent the first time a homeowner completes a diagnosis.
 *
 * Usage:
 *   import { HomeownerWelcomeEmail, homeownerWelcomeText } from '@/lib/email/templates/homeowner-welcome';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HomeownerWelcomeEmailProps {
    reportUrl:      string;
    faultTitle:     string;
    suburb?:        string;
    unsubscribeUrl: string;
}

// ── Benefit chip data ─────────────────────────────────────────────────────────

const BENEFITS = [
    'Free diagnosis, always',
    'Vetted contractors only',
    'Zero commission',
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function HomeownerWelcomeEmail({
    reportUrl,
    faultTitle,
    suburb,
    unsubscribeUrl,
}: HomeownerWelcomeEmailProps) {
    const previewText = 'Welcome to Mendr — your diagnosis is ready';

    const footerExtra = (
        <>
            {suburb ? `Diagnosis for: ${suburb}. ` : ''}
            <Link href={unsubscribeUrl} style={{ color: '#737373', textDecoration: 'underline' }}>
                Unsubscribe
            </Link>
        </>
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
                Welcome to Mendr.
            </Text>

            {/* Opening */}
            <Text
                style={{
                    margin:     '0 0 24px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                You&apos;ve just done something most homeowners never do — you know exactly what&apos;s
                wrong with your home before calling a contractor.
            </Text>

            {/* Diagnosis label */}
            <Text
                style={{
                    margin:     '0 0 8px',
                    fontSize:   13,
                    fontWeight: 600,
                    color:      '#737373',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                }}
            >
                Your diagnosis
            </Text>
            <Text
                style={{
                    margin:     '0 0 24px',
                    fontSize:   16,
                    fontWeight: 600,
                    color:      '#0A0A0A',
                    lineHeight: 1.4,
                }}
            >
                {faultTitle}
            </Text>

            {/* Benefit chips */}
            <Section style={{ marginBottom: 24 }}>
                {/*
                  * Email clients vary widely in table support.
                  * We render chips as a series of inline-block spans wrapped in a Text.
                  * On mobile they reflow naturally; on desktop they sit side-by-side.
                  */}
                <Text style={{ margin: 0, fontSize: 0, lineHeight: 0 }}>
                    {BENEFITS.map((label) => (
                        <span
                            key={label}
                            style={{
                                display:         'inline-block',
                                backgroundColor: '#F5F5F5',
                                border:          '1px solid #E5E5E5',
                                borderRadius:    20,
                                padding:         '6px 14px',
                                fontSize:        13,
                                fontWeight:      600,
                                color:           '#0A0A0A',
                                marginRight:     8,
                                marginBottom:    8,
                                lineHeight:      1.4,
                            }}
                        >
                            {label}
                        </span>
                    ))}
                </Text>
            </Section>

            {/* CTA */}
            <Section style={{ margin: '0 0 20px' }}>
                <MendrButton href={reportUrl}>View your diagnosis</MendrButton>
            </Section>

            {/* Closing */}
            <Text
                style={{
                    margin:     0,
                    fontSize:   14,
                    color:      '#737373',
                    lineHeight: 1.6,
                }}
            >
                Any questions? Just reply to this email — it goes straight to our team.
            </Text>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function homeownerWelcomeText(params: HomeownerWelcomeEmailProps): string {
    const { reportUrl, faultTitle, suburb, unsubscribeUrl } = params;
    return [
        'Welcome to Mendr.',
        '',
        "You've just done something most homeowners never do — you know exactly what's",
        'wrong with your home before calling a contractor.',
        '',
        `Your diagnosis: ${faultTitle}${suburb ? ` (${suburb})` : ''}`,
        '',
        'What Mendr offers:',
        '- Free diagnosis, always',
        '- Vetted contractors only',
        '- Zero commission',
        '',
        'View your diagnosis:',
        reportUrl,
        '',
        'Any questions? Just reply to this email — it goes straight to our team.',
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
}
