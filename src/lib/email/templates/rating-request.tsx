/**
 * Post-job rating request sent to a homeowner ~48h after they contacted a Pro.
 * Each star links straight to /api/job-outcome?...&rating=N for one-click submit.
 *
 * Usage:
 *   import { RatingRequestEmail, ratingRequestText } from '@/lib/email/templates/rating-request';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout } from '@/lib/email';
import { EMAIL_COLORS, EMAIL_RADIUS, EMAIL_FONT_STACK } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RatingRequestEmailProps {
    providerName: string;
    /** Base URL; the star value N is appended, e.g. `${ratingBaseUrl}${n}`. */
    ratingBaseUrl: string;
    unsubscribeUrl?: string;
}

const STARS = [1, 2, 3, 4, 5] as const;
const STAR_LABELS = ['Poor', 'Below average', 'Okay', 'Good', 'Excellent'] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function RatingRequestEmail({
    providerName,
    ratingBaseUrl,
    unsubscribeUrl,
}: RatingRequestEmailProps) {
    const previewText = `How did ${providerName} do? It takes one tap to rate.`;

    return (
        <MendrEmailLayout
            previewText={previewText}
            footerExtra={
                unsubscribeUrl ? (
                    <Link
                        href={unsubscribeUrl}
                        style={{ color: EMAIL_COLORS.muted, textDecoration: 'underline' }}
                    >
                        Unsubscribe
                    </Link>
                ) : undefined
            }
        >
            <Text
                style={{
                    margin:     '0 0 6px',
                    fontSize:   24,
                    fontWeight: 600,
                    color:      EMAIL_COLORS.foreground,
                    lineHeight: 1.25,
                    fontFamily: EMAIL_FONT_STACK,
                }}
            >
                How did it go?
            </Text>

            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   14,
                    color:      EMAIL_COLORS.body,
                    lineHeight: 1.6,
                    fontFamily: EMAIL_FONT_STACK,
                }}
            >
                You recently contacted <strong>{providerName}</strong> through Mendr. Did they
                help you sort out your home fault? Tap a rating below — it takes one click.
            </Text>

            {/* Star buttons */}
            <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
                {STARS.map((n) => (
                    <Link
                        key={n}
                        href={`${ratingBaseUrl}${n}`}
                        title={STAR_LABELS[n - 1]}
                        style={{
                            display:         'inline-block',
                            margin:          '0 4px',
                            padding:         '10px 14px',
                            backgroundColor: EMAIL_COLORS.subtle,
                            border:          `1px solid ${EMAIL_COLORS.border}`,
                            borderRadius:    EMAIL_RADIUS.button,
                            fontSize:        20,
                            textDecoration:  'none',
                            color:           EMAIL_COLORS.foreground,
                        }}
                    >
                        {'★'.repeat(n)}
                        <span style={{ color: EMAIL_COLORS.border }}>{'☆'.repeat(5 - n)}</span>
                    </Link>
                ))}
            </Section>

            <Text
                style={{
                    margin:     0,
                    fontSize:   13,
                    color:      EMAIL_COLORS.muted,
                    lineHeight: 1.6,
                    fontFamily: EMAIL_FONT_STACK,
                }}
            >
                Your rating helps other homeowners find great Pros on Mendr.
            </Text>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function ratingRequestText(params: RatingRequestEmailProps): string {
    const { providerName, ratingBaseUrl, unsubscribeUrl } = params;
    return [
        'Hi there,',
        '',
        `You recently contacted ${providerName} through Mendr. Did they help you sort out your home fault?`,
        '',
        'Rate your experience:',
        ...STARS.map((n) => `  ${n} star${n > 1 ? 's' : ''} (${STAR_LABELS[n - 1]}): ${ratingBaseUrl}${n}`),
        '',
        'This takes one click and helps other homeowners find great Pros.',
        ...(unsubscribeUrl ? ['', `Unsubscribe: ${unsubscribeUrl}`] : []),
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
    ].join('\n');
}
