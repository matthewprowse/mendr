/**
 * Waitlist notification email — sent when a new suburb goes live.
 *
 * Usage:
 *   import { WaitlistNotificationEmail, waitlistNotificationText } from '@/lib/email/templates/waitlist-notification';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WaitlistNotificationEmailProps {
    suburb:         string;
    siteUrl:        string;
    unsubscribeUrl: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WaitlistNotificationEmail({
    suburb,
    siteUrl,
    unsubscribeUrl,
}: WaitlistNotificationEmailProps) {
    const previewText = `Mendr is now live in ${suburb}`;

    const footerExtra = (
        <>
            You&apos;re receiving this because you joined the Mendr waitlist for {suburb}.{' '}
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
                {suburb} is now covered by Mendr.
            </Text>

            {/* Body */}
            <Text
                style={{
                    margin:     '0 0 24px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                We&apos;ve just launched in your area. You can now get a free AI-powered diagnosis of
                any home fault and connect with vetted local contractors.
            </Text>

            {/* Highlights */}
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
                        margin:     '0 0 6px',
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.6,
                    }}
                >
                    <span style={{ color: '#171717', fontWeight: 600, marginRight: 6 }}>✓</span>
                    Free AI-powered home fault diagnosis
                </Text>
                <Text
                    style={{
                        margin:     '0 0 6px',
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.6,
                    }}
                >
                    <span style={{ color: '#171717', fontWeight: 600, marginRight: 6 }}>✓</span>
                    Vetted local contractors in {suburb}
                </Text>
                <Text
                    style={{
                        margin:     0,
                        fontSize:   14,
                        color:      '#404040',
                        lineHeight: 1.6,
                    }}
                >
                    <span style={{ color: '#171717', fontWeight: 600, marginRight: 6 }}>✓</span>
                    No commission, no middleman
                </Text>
            </Section>

            {/* CTA */}
            <Section style={{ margin: '0 0 20px' }}>
                <MendrButton href={`${siteUrl}/start`}>Get your free diagnosis</MendrButton>
            </Section>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function waitlistNotificationText(params: WaitlistNotificationEmailProps): string {
    const { suburb, siteUrl, unsubscribeUrl } = params;

    return [
        `${suburb} is now covered by Mendr.`,
        '',
        "We've just launched in your area. You can now get a free AI-powered diagnosis of",
        'any home fault and connect with vetted local contractors.',
        '',
        '- Free AI-powered home fault diagnosis',
        `- Vetted local contractors in ${suburb}`,
        '- No commission, no middleman',
        '',
        'Get your free diagnosis:',
        `${siteUrl}/start`,
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `You're receiving this because you joined the Mendr waitlist for ${suburb}.`,
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
}
