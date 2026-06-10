/**
 * Shared React Email layout for every Mendr email — transactional, auth, and
 * lifecycle. Brand colours, typography, and structure live here; templates
 * import this rather than restyling.
 *
 * Mirrors the live product (see /start, /diagnosis, /match): a clean white
 * page, a centred max-w-xl (576px) column, NO wrapping card or grey canvas.
 * Headings are text-2xl / font-semibold (24px / 600), body is text-sm (14px),
 * secondary copy is muted. Typeface is Anthropic Sans Text. Tokens come from
 * `./tokens` (kept in sync with `src/app/globals.css`).
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
import {
    EMAIL_COLORS,
    EMAIL_RADIUS,
    EMAIL_FONT_STACK,
    anthropicSansFontFaceCss,
    getEmailAssetOrigin,
} from './tokens';

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
    /**
     * Override for the origin that serves `/fonts/*.otf`. Defaults to
     * `getEmailAssetOrigin()` — only pass this in tests or previews.
     */
    assetOrigin?: string;
}

export function MendrEmailLayout({
    children,
    previewText,
    footerExtra,
    assetOrigin,
}: MendrEmailLayoutProps) {
    const origin = assetOrigin ?? getEmailAssetOrigin();

    return (
        <Html lang="en">
            <Head>
                <style
                    dangerouslySetInnerHTML={{
                        __html: anthropicSansFontFaceCss(origin),
                    }}
                />
            </Head>
            {previewText && <Preview>{previewText}</Preview>}
            <Body
                style={{
                    margin:          0,
                    padding:         0,
                    backgroundColor: EMAIL_COLORS.canvas,
                    color:           EMAIL_COLORS.foreground,
                    fontFamily:      EMAIL_FONT_STACK,
                    fontSize:        14,
                    lineHeight:      1.6,
                }}
            >
                {/* Centred content column — matches the app's max-w-xl, no card */}
                <Container
                    style={{
                        maxWidth: 576,
                        width:    '100%',
                        margin:   '0 auto',
                        padding:  '32px 20px',
                    }}
                >
                    {/* Wordmark — understated, like the app chrome */}
                    <Text
                        style={{
                            margin:        '0 0 28px',
                            fontSize:      16,
                            fontWeight:    600,
                            letterSpacing: '-0.01em',
                            color:         EMAIL_COLORS.foreground,
                            lineHeight:    1,
                            fontFamily:    EMAIL_FONT_STACK,
                        }}
                    >
                        Mendr
                    </Text>

                    {/* Content */}
                    {children}

                    {/* Footer — hairline rule, muted text. No grey box. */}
                    <Section
                        style={{
                            marginTop:  32,
                            paddingTop: 20,
                            borderTop:  `1px solid ${EMAIL_COLORS.border}`,
                        }}
                    >
                        <Text
                            style={{
                                margin:     0,
                                fontSize:   12,
                                color:      EMAIL_COLORS.muted,
                                lineHeight: 1.5,
                                fontFamily: EMAIL_FONT_STACK,
                            }}
                        >
                            Mendr · Cape Town, Western Cape, South Africa
                        </Text>
                        {footerExtra && (
                            <Text
                                style={{
                                    margin:     '6px 0 0',
                                    fontSize:   12,
                                    color:      EMAIL_COLORS.muted,
                                    lineHeight: 1.5,
                                    fontFamily: EMAIL_FONT_STACK,
                                }}
                            >
                                {footerExtra}
                            </Text>
                        )}
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
 * Primary CTA button — mirrors the shadcn `<Button>` default: `bg-primary`,
 * `text-sm` (14px), `font-medium` (500), `rounded-md`, ~h-10. Use inside
 * `MendrEmailLayout` body content.
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
                backgroundColor: EMAIL_COLORS.primary,
                color:           EMAIL_COLORS.primaryForeground,
                textDecoration:  'none',
                padding:         '12px 18px',
                borderRadius:    EMAIL_RADIUS.button,
                fontSize:        14,
                fontWeight:      500,
                lineHeight:      1,
                fontFamily:      EMAIL_FONT_STACK,
            }}
        >
            {children}
        </Link>
    );
}
