import * as React from 'react';
import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from '@react-email/components';
import { BRAND_NAME } from '@/lib/brand-system';

const palette = {
    pageBg: '#fafafa',
    cardBg: '#ffffff',
    text: '#171717',
    muted: '#737373',
    border: '#e5e5e5',
    buttonBg: '#171717',
    buttonText: '#fafafa',
};

/** @deprecated Renamed to MendrAuthEmailProps */
export interface ScandioAuthEmailProps {
    /** Public site origin for self-hosted `/fonts/Soehne*.otf` (+ Signifier if added to emails later), e.g. https://example.com */
    assetOrigin: string;
    preview: string;
    heading: string;
    body: string;
    ctaUrl?: string;
    ctaLabel?: string;
    /** 6-digit OTP when present */
    otp?: string;
    footer?: string;
}

function sohneFontFaceCss(origin: string): string {
    const base = origin.replace(/\/+$/, '');
    return `
@font-face {
  font-family: 'Sohne';
  src: url('${base}/fonts/Soehne%20Leicht.otf') format('opentype');
  font-weight: 300;
  font-style: normal;
}
@font-face {
  font-family: 'Sohne';
  src: url('${base}/fonts/Soehne.otf') format('opentype');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'Sohne';
  src: url('${base}/fonts/Soehne%20Kraftig.otf') format('opentype');
  font-weight: 500;
  font-style: normal;
}
@font-face {
  font-family: 'Sohne';
  src: url('${base}/fonts/Soehne%20Halbfett.otf') format('opentype');
  font-weight: 600;
  font-style: normal;
}
@font-face {
  font-family: 'Sohne';
  src: url('${base}/fonts/Soehne%20Dreiviertelfett.otf') format('opentype');
  font-weight: 700;
  font-style: normal;
}
@font-face {
  font-family: 'Sohne';
  src: url('${base}/fonts/Soehne%20Extrafett.otf') format('opentype');
  font-weight: 900;
  font-style: normal;
}
`.trim();
}

const fontStack = "'Sohne', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function ScandioAuthEmail({
    assetOrigin,
    preview,
    heading,
    body,
    ctaUrl,
    ctaLabel,
    otp,
    footer = 'If you did not request this email, you can safely ignore it.',
}: ScandioAuthEmailProps) {
    return (
        <Html>
            <Head>
                {assetOrigin ? (
                    <style
                        dangerouslySetInnerHTML={{
                            __html: sohneFontFaceCss(assetOrigin),
                        }}
                    />
                ) : null}
            </Head>
            {preview ? <Preview>{preview}</Preview> : null}
            <Body style={{ ...styles.body, fontFamily: fontStack }}>
                <Container style={styles.container}>
                    <Section style={styles.card}>
                        <Text style={styles.brand}>{BRAND_NAME}</Text>
                        <Heading style={{ ...styles.h1, fontFamily: fontStack }}>{heading}</Heading>
                        <Text style={{ ...styles.paragraph, fontFamily: fontStack }}>{body}</Text>
                        {ctaUrl && ctaLabel ? (
                            <Section style={styles.ctaWrap}>
                                <Button href={ctaUrl} style={{ ...styles.button, fontFamily: fontStack }}>
                                    {ctaLabel}
                                </Button>
                            </Section>
                        ) : null}
                        {otp ? (
                            <Section style={styles.otpBox}>
                                <Text
                                    style={{
                                        ...styles.otpLabel,
                                        fontFamily: fontStack,
                                    }}
                                >
                                    Or enter this code:
                                </Text>
                                <Text style={{ ...styles.otp, fontFamily: fontStack }}>{otp}</Text>
                            </Section>
                        ) : null}
                        {ctaUrl ? (
                            <Text style={{ ...styles.linkFallback, fontFamily: fontStack }}>
                                If the button does not work, copy this link:
                                <br />
                                <Link href={ctaUrl} style={styles.anchor}>
                                    {ctaUrl}
                                </Link>
                            </Text>
                        ) : null}
                        <Text style={{ ...styles.footer, fontFamily: fontStack }}>{footer}</Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

const styles = {
    body: {
        backgroundColor: palette.pageBg,
        margin: 0,
        padding: '32px 16px',
    },
    container: {
        maxWidth: '480px',
        margin: '0 auto',
    },
    card: {
        backgroundColor: palette.cardBg,
        borderRadius: '10px',
        border: `1px solid ${palette.border}`,
        padding: '32px 28px',
    },
    brand: {
        fontSize: '13px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        color: palette.muted,
        margin: '0 0 20px',
    },
    h1: {
        color: palette.text,
        fontSize: '22px',
        fontWeight: 700,
        lineHeight: 1.25,
        margin: '0 0 16px',
    },
    paragraph: {
        color: palette.text,
        fontSize: '15px',
        lineHeight: 1.55,
        margin: '0 0 20px',
        whiteSpace: 'pre-line' as const,
    },
    ctaWrap: {
        margin: '28px 0 8px',
        textAlign: 'center' as const,
    },
    button: {
        backgroundColor: palette.buttonBg,
        color: palette.buttonText,
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        textDecoration: 'none',
        textAlign: 'center' as const,
        display: 'inline-block',
        padding: '12px 28px',
    },
    otpBox: {
        marginTop: '20px',
        padding: '16px',
        backgroundColor: palette.pageBg,
        borderRadius: '8px',
        border: `1px solid ${palette.border}`,
        textAlign: 'center' as const,
    },
    otpLabel: {
        fontSize: '12px',
        color: palette.muted,
        margin: '0 0 8px',
    },
    otp: {
        fontSize: '24px',
        fontWeight: 700,
        letterSpacing: '0.2em',
        color: palette.text,
        margin: 0,
    },
    linkFallback: {
        fontSize: '12px',
        color: palette.muted,
        lineHeight: 1.5,
        marginTop: '24px',
        wordBreak: 'break-all' as const,
    },
    anchor: {
        color: palette.text,
    },
    footer: {
        fontSize: '12px',
        color: palette.muted,
        lineHeight: 1.5,
        marginTop: '28px',
        marginBottom: 0,
    },
};

// ── Brand-renamed aliases — import these in new code ──────────────────────────
export type MendrAuthEmailProps = ScandioAuthEmailProps;
export const MendrAuthEmail = ScandioAuthEmail;

