/**
 * Feature announcement ("What's new") email.
 *
 * Generic: one template renders every product update. Content comes from a
 * feature_announcements row, so shipping a feature needs no new email code.
 *
 * Usage:
 *   import { FeatureAnnouncementEmail, featureAnnouncementText } from '@/lib/email/templates/feature-announcement';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

export interface FeatureAnnouncementEmailProps {
    title: string;
    summary: string;
    /** Absolute URL to the full announcement at /new/<slug>. */
    url: string;
    unsubscribeUrl: string;
}

export function FeatureAnnouncementEmail({
    title,
    summary,
    url,
    unsubscribeUrl,
}: FeatureAnnouncementEmailProps) {
    const footerExtra = (
        <Link href={unsubscribeUrl} style={{ color: '#737373', textDecoration: 'underline' }}>
            Unsubscribe from product updates
        </Link>
    );

    return (
        <MendrEmailLayout previewText={summary} footerExtra={footerExtra}>
            <Text
                style={{
                    margin: '0 0 8px',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#737373',
                }}
            >
                What&apos;s new
            </Text>

            <Text
                style={{
                    margin: '0 0 16px',
                    fontSize: 24,
                    fontWeight: 600,
                    color: '#0A0A0A',
                    lineHeight: 1.25,
                }}
            >
                {title}
            </Text>

            <Text
                style={{
                    margin: '0 0 24px',
                    fontSize: 14,
                    color: '#404040',
                    lineHeight: 1.6,
                }}
            >
                {summary}
            </Text>

            <Section style={{ margin: '0 0 20px' }}>
                <MendrButton href={url}>See what&apos;s new</MendrButton>
            </Section>
        </MendrEmailLayout>
    );
}

export function featureAnnouncementText(params: FeatureAnnouncementEmailProps): string {
    const { title, summary, url, unsubscribeUrl } = params;
    return [
        "What's new on Mendr",
        '',
        title,
        '',
        summary,
        '',
        'See what’s new:',
        url,
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
        '',
        `Unsubscribe from product updates: ${unsubscribeUrl}`,
    ].join('\n');
}
