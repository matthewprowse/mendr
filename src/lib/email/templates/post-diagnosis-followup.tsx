/**
 * Post-diagnosis follow-up email — sent 72 hours after a diagnosis if the homeowner
 * hasn't clicked through to contact a contractor.
 *
 * Usage:
 *   import { PostDiagnosisFollowupEmail, postDiagnosisFollowupText } from '@/lib/email/templates/post-diagnosis-followup';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostDiagnosisFollowupEmailProps {
    reportUrl:      string;
    faultTitle:     string;
    urgency:        'low' | 'moderate' | 'high' | 'emergency';
    contractorsUrl: string;
    unsubscribeUrl: string;
}

// ── Tips data ─────────────────────────────────────────────────────────────────

const TIPS: string[] = [
    'Always ask for a written quote before any work starts.',
    'Check that they\'re insured — ask for proof.',
    'Mendr contractors are vetted. That means checked registration, valid insurance, and real references.',
];

// ── Component ─────────────────────────────────────────────────────────────────

export function PostDiagnosisFollowupEmail({
    reportUrl,
    faultTitle,
    urgency,
    contractorsUrl,
    unsubscribeUrl,
}: PostDiagnosisFollowupEmailProps) {
    const previewText  = `Did you find a contractor for your ${faultTitle}?`;
    const showUrgency  = urgency === 'high' || urgency === 'emergency';
    const urgencyLabel = urgency.charAt(0).toUpperCase() + urgency.slice(1);

    const footerExtra = (
        <Link href={unsubscribeUrl} style={{ color: '#737373', textDecoration: 'underline' }}>
            Unsubscribe
        </Link>
    );

    return (
        <MendrEmailLayout previewText={previewText} footerExtra={footerExtra}>
            {/* Urgency notice — only for high / emergency */}
            {showUrgency && (
                <Section
                    style={{
                        backgroundColor: '#F5F5F5',
                        border:          '1px solid #171717',
                        borderRadius:    8,
                        padding:         '12px 16px',
                        marginBottom:    20,
                    }}
                >
                    <Text
                        style={{
                            margin:     0,
                            fontSize:   14,
                            fontWeight: 600,
                            color:      '#171717',
                            lineHeight: 1.5,
                        }}
                    >
                        {'⚠'} Your fault was rated {urgencyLabel} — addressing this soon reduces the risk of further damage.
                    </Text>
                </Section>
            )}

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
                Still looking for a contractor?
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
                It&apos;s been a few days since your Mendr diagnosis. If you haven&apos;t found a
                contractor yet, here are three things to know before you hire:
            </Text>

            {/* Tips with sage bullet dots */}
            <Section style={{ marginBottom: 24 }}>
                {TIPS.map((tip, i) => (
                    <Text
                        key={i}
                        style={{
                            margin:     '0 0 10px',
                            fontSize:   14,
                            color:      '#404040',
                            lineHeight: 1.6,
                            paddingLeft: 20,
                            position:   'relative',
                        }}
                    >
                        <span
                            style={{
                                display:         'inline-block',
                                width:           8,
                                height:          8,
                                borderRadius:    '50%',
                                backgroundColor: '#171717',
                                marginRight:     10,
                                verticalAlign:   'middle',
                                flexShrink:      0,
                            }}
                        />
                        {tip}
                    </Text>
                ))}
            </Section>

            {/* Primary CTA */}
            <Section style={{ margin: '0 0 14px' }}>
                <MendrButton href={contractorsUrl}>Find a contractor on Mendr</MendrButton>
            </Section>

            {/* Secondary link */}
            <Text
                style={{
                    margin:     0,
                    fontSize:   14,
                    color:      '#737373',
                    lineHeight: 1.6,
                }}
            >
                Or{' '}
                <Link href={reportUrl} style={{ color: '#171717', textDecoration: 'underline' }}>
                    review your diagnosis
                </Link>{' '}
                again.
            </Text>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function postDiagnosisFollowupText(params: PostDiagnosisFollowupEmailProps): string {
    const { reportUrl, faultTitle, urgency, contractorsUrl, unsubscribeUrl } = params;
    const showUrgency  = urgency === 'high' || urgency === 'emergency';
    const urgencyLabel = urgency.charAt(0).toUpperCase() + urgency.slice(1);

    const lines: string[] = [];

    if (showUrgency) {
        lines.push(
            `⚠ Your fault was rated ${urgencyLabel} — addressing this soon reduces the risk of further damage.`,
            '',
        );
    }

    lines.push(
        'Still looking for a contractor?',
        '',
        `It's been a few days since your Mendr diagnosis for: ${faultTitle}.`,
        "If you haven't found a contractor yet, here are three things to know before you hire:",
        '',
        '1. Always ask for a written quote before any work starts.',
        "2. Check that they're insured — ask for proof.",
        '3. Mendr contractors are vetted. That means checked registration, valid insurance, and real references.',
        '',
        'Find a contractor on Mendr:',
        contractorsUrl,
        '',
        'Review your diagnosis:',
        reportUrl,
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `Unsubscribe: ${unsubscribeUrl}`,
    );

    return lines.join('\n');
}
