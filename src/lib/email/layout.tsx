/**
 * Shared React Email layout component for all Mendr transactional and marketing emails.
 * Brand colours, typography, and structure are defined here — templates import this.
 *
 * Usage:
 *   import { MendrEmailLayout, MendrButton } from '@/lib/email';
 */

import React from 'react';
import {
    Html,
    Head,
    Body,
    Container,
    Section,
    Text,
    Preview,
    Link,
} from '@react-email/components';

// ── Brand tokens ──────────────────────────────────────────────────────────────
const COLORS = {
    dune:       '#F4EFE6',
    slate:      '#1C2B3A',
    terracotta: '#C45C3A',
    ink:        '#2F3E4E',
    fog:        '#E8E4DD',
    sage:       '#6B8F71',
    gold:       '#C8973A',
    white:      '#FFFFFF',
} as const;

// ── MendrEmailLayout ──────────────────────────────────────────────────────────

export interface MendrEmailLayoutProps {
    children: React.ReactNode;
    /** Short preview / pre-header text shown in the inbox before the email is opened. */
    previewText?: string;
    /**
     * Extra content rendered inside the footer — intended for per-email unsubscribe links.
     * POPIA-required for marketing / lifecycle emails.
     */
    footerExtra?: React.ReactNode;
}

export function MendrEmailLayout({
    children,
    previewText,
    footerExtra,
}: MendrEmailLayoutProps) {
    return (
        <Html lang="en">
            <Head />
            {previewText && <Preview>{previewText}</Preview>}
            <Body
                style={{
                    margin:          0,
                    padding:         0,
                    backgroundColor: COLORS.dune,
                    fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
            >
                {/* Outer wrapper — centres the card on wide viewports */}
                <Container
                    style={{
                        maxWidth:        560,
                        width:           '100%',
                        margin:          '0 auto',
                        padding:         '40px 16px',
                        backgroundColor: COLORS.dune,
                    }}
                >
                    {/* Card */}
                    <Section
                        style={{
                            backgroundColor: COLORS.white,
                            borderRadius:    12,
                            border:          `1px solid ${COLORS.fog}`,
                            overflow:        'hidden',
                        }}
                    >
                        {/* Header — Mendr wordmark */}
                        <Section
                            style={{
                                padding:      '24px 32px',
                                borderBottom: `1px solid ${COLORS.fog}`,
                            }}
                        >
                            <Text
                                style={{
                                    margin:        0,
                                    fontSize:      20,
                                    fontWeight:    700,
                                    letterSpacing: '-0.3px',
                                    color:         COLORS.slate,
                                    lineHeight:    1,
                                }}
                            >
                                {/* "Mend" in slate, "r" in terracotta — mirrors the visual logo */}
                                {'Mend'}
                                <span style={{ color: COLORS.terracotta }}>r</span>
                            </Text>
                        </Section>

                        {/* Body slot */}
                        <Section
                            style={{
                                padding:    '28px 32px',
                                fontSize:   15,
                                color:      COLORS.ink,
                                lineHeight: 1.6,
                            }}
                        >
                            {children}
                        </Section>

                        {/* Footer */}
                        <Section
                            style={{
                                backgroundColor: COLORS.dune,
                                borderTop:       `1px solid ${COLORS.fog}`,
                                padding:         '20px 32px',
                            }}
                        >
                            <Text
                                style={{
                                    margin:     0,
                                    fontSize:   12,
                                    color:      '#7A7064',
                                    lineHeight: 1.5,
                                }}
                            >
                                Mendr · Cape Town, Western Cape, South Africa
                            </Text>
                            {footerExtra && (
                                <Text
                                    style={{
                                        margin:     '6px 0 0',
                                        fontSize:   12,
                                        color:      '#7A7064',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {footerExtra}
                                </Text>
                            )}
                        </Section>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

// ── MendrButton ───────────────────────────────────────────────────────────────

export interface MendrButtonProps {
    href: string;
    children: React.ReactNode;
}

/**
 * Terracotta CTA button — use inside `MendrEmailLayout` body content.
 *
 * @example
 *   <MendrButton href="https://mendr.co.za/start">Get started</MendrButton>
 */
export function MendrButton({ href, children }: MendrButtonProps) {
    return (
        <Link
            href={href}
            style={{
                display:         'inline-block',
                backgroundColor: COLORS.terracotta,
                color:           COLORS.white,
                textDecoration:  'none',
                padding:         '12px 24px',
                borderRadius:    8,
                fontSize:        15,
                fontWeight:      600,
                lineHeight:      1,
            }}
        >
            {children}
        </Link>
    );
}
