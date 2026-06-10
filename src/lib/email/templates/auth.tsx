/**
 * Authentication / account-security email (signup, magic link, password reset,
 * OTP, security notifications). Rendered for the Supabase "Send Email" auth hook
 * by `@/lib/auth-email-dispatch`.
 *
 * Built on the shared MendrEmailLayout so auth mail matches every other email:
 * neutral shadcn surface, Anthropic Sans Text.
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';
import { EMAIL_COLORS, EMAIL_RADIUS, EMAIL_FONT_STACK } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MendrAuthEmailProps {
    preview: string;
    heading: string;
    body: string;
    ctaUrl?: string;
    ctaLabel?: string;
    /** 6-digit OTP when present. */
    otp?: string;
    /** Footer note. Defaults to the standard "ignore if you didn't request" line. */
    footer?: string;
}

const DEFAULT_FOOTER = 'If you did not request this email, you can safely ignore it.';

// ── Component ─────────────────────────────────────────────────────────────────

export function MendrAuthEmail({
    preview,
    heading,
    body,
    ctaUrl,
    ctaLabel,
    otp,
    footer = DEFAULT_FOOTER,
}: MendrAuthEmailProps) {
    return (
        <MendrEmailLayout
            previewText={preview}
            footerExtra={footer ? footer : undefined}
        >
            <Text
                style={{
                    margin:     '0 0 16px',
                    fontSize:   24,
                    fontWeight: 600,
                    color:      EMAIL_COLORS.foreground,
                    lineHeight: 1.25,
                    fontFamily: EMAIL_FONT_STACK,
                }}
            >
                {heading}
            </Text>

            <Text
                style={{
                    margin:      '0 0 20px',
                    fontSize:    14,
                    color:       EMAIL_COLORS.body,
                    lineHeight:  1.55,
                    whiteSpace:  'pre-line',
                    fontFamily:  EMAIL_FONT_STACK,
                }}
            >
                {body}
            </Text>

            {ctaUrl && ctaLabel ? (
                <Section style={{ margin: '0 0 8px' }}>
                    <MendrButton href={ctaUrl}>{ctaLabel}</MendrButton>
                </Section>
            ) : null}

            {otp ? (
                <Section
                    style={{
                        marginTop:       20,
                        padding:         16,
                        backgroundColor: EMAIL_COLORS.subtle,
                        borderRadius:    EMAIL_RADIUS.button,
                        border:          `1px solid ${EMAIL_COLORS.border}`,
                        textAlign:       'center',
                    }}
                >
                    <Text
                        style={{
                            margin:     '0 0 8px',
                            fontSize:   12,
                            color:      EMAIL_COLORS.muted,
                            fontFamily: EMAIL_FONT_STACK,
                        }}
                    >
                        Or enter this code:
                    </Text>
                    <Text
                        style={{
                            margin:        0,
                            fontSize:      24,
                            fontWeight:    600,
                            letterSpacing: '0.2em',
                            color:         EMAIL_COLORS.foreground,
                            fontFamily:    EMAIL_FONT_STACK,
                        }}
                    >
                        {otp}
                    </Text>
                </Section>
            ) : null}

            {ctaUrl ? (
                <Text
                    style={{
                        marginTop:  24,
                        fontSize:   12,
                        color:      EMAIL_COLORS.muted,
                        lineHeight: 1.5,
                        wordBreak:  'break-all',
                        fontFamily: EMAIL_FONT_STACK,
                    }}
                >
                    If the button does not work, copy this link:
                    <br />
                    <Link href={ctaUrl} style={{ color: EMAIL_COLORS.foreground }}>
                        {ctaUrl}
                    </Link>
                </Text>
            ) : null}
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function authEmailText(props: MendrAuthEmailProps): string {
    const { heading, body, ctaUrl, ctaLabel, otp, footer = DEFAULT_FOOTER } = props;
    const lines: string[] = [heading, '', body];
    if (ctaUrl && ctaLabel) {
        lines.push('', `${ctaLabel}: ${ctaUrl}`);
    }
    if (otp) {
        lines.push('', `Or enter this code: ${otp}`);
    }
    if (footer) {
        lines.push('', footer);
    }
    lines.push('', 'Mendr · Cape Town, Western Cape, South Africa');
    return lines.join('\n');
}
