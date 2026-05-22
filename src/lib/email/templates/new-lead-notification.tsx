/**
 * Real-time notification email sent to a contractor when a homeowner contacts them via Mendr.
 *
 * Usage:
 *   import { NewLeadNotificationEmail, newLeadNotificationText } from '@/lib/email/templates/new-lead-notification';
 */

import React from 'react';
import { Text, Section, Link } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NewLeadNotificationEmailProps {
    contractorFirstName: string;
    homeownerSuburb: string;
    faultTitle: string;
    faultCategory: string;
    urgency: 'low' | 'moderate' | 'high' | 'emergency';
    estimatedCost?: string;
    leadUrl: string;
    unsubscribeUrl: string;
}

// ── Urgency badge helpers ─────────────────────────────────────────────────────

const URGENCY_STYLES: Record<
    NewLeadNotificationEmailProps['urgency'],
    { background: string; color: string; label: string }
> = {
    low:       { background: '#6B8F71', color: '#FFFFFF', label: 'Low urgency' },
    moderate:  { background: '#C8973A', color: '#FFFFFF', label: 'Moderate urgency' },
    high:      { background: '#C45C3A', color: '#FFFFFF', label: 'High urgency' },
    emergency: { background: '#C45C3A', color: '#FFFFFF', label: 'Emergency' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function NewLeadNotificationEmail({
    contractorFirstName,
    homeownerSuburb,
    faultTitle,
    faultCategory,
    urgency,
    estimatedCost,
    leadUrl,
    unsubscribeUrl,
}: NewLeadNotificationEmailProps) {
    const previewText = `New Mendr lead — ${faultCategory} in ${homeownerSuburb}`;
    const urgencyBadge = URGENCY_STYLES[urgency];

    return (
        <MendrEmailLayout
            previewText={previewText}
            footerExtra={
                <>
                    You&apos;re receiving this because you&apos;re an active Mendr contractor.{' '}
                    <Link href={unsubscribeUrl} style={{ color: '#7A7064', textDecoration: 'underline' }}>
                        Unsubscribe
                    </Link>
                </>
            }
        >
            {/* Heading */}
            <Text
                style={{
                    margin:     '0 0 6px',
                    fontSize:   22,
                    fontWeight: 700,
                    color:      '#1C2B3A',
                    lineHeight: 1.25,
                }}
            >
                You have a new lead.
            </Text>

            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   15,
                    color:      '#2F3E4E',
                    lineHeight: 1.6,
                }}
            >
                Hi {contractorFirstName}, a homeowner in {homeownerSuburb} needs your help.
            </Text>

            {/* Lead card */}
            <Section
                style={{
                    backgroundColor: '#F4EFE6',
                    border:          '1px solid #E8E4DD',
                    borderRadius:    12,
                    padding:         '20px',
                    marginBottom:    24,
                }}
            >
                {/* Badge row */}
                <Text
                    style={{
                        margin:     '0 0 10px',
                        fontSize:   13,
                        lineHeight: 1.4,
                    }}
                >
                    <span
                        style={{
                            display:         'inline-block',
                            backgroundColor: '#C45C3A',
                            color:           '#FFFFFF',
                            borderRadius:    4,
                            padding:         '2px 8px',
                            fontSize:        12,
                            fontWeight:      600,
                            marginRight:     8,
                        }}
                    >
                        {faultCategory}
                    </span>
                    <span
                        style={{
                            display:         'inline-block',
                            backgroundColor: urgencyBadge.background,
                            color:           urgencyBadge.color,
                            borderRadius:    4,
                            padding:         '2px 8px',
                            fontSize:        12,
                            fontWeight:      600,
                        }}
                    >
                        {urgencyBadge.label}
                    </span>
                </Text>

                {/* Fault title */}
                <Text
                    style={{
                        margin:     '0 0 12px',
                        fontSize:   16,
                        fontWeight: 600,
                        color:      '#1C2B3A',
                        lineHeight: 1.4,
                    }}
                >
                    {faultTitle}
                </Text>

                {/* Two-column meta row */}
                <Text
                    style={{
                        margin:     '0 0 10px',
                        fontSize:   14,
                        color:      '#2F3E4E',
                        lineHeight: 1.5,
                    }}
                >
                    <strong>Location:</strong> {homeownerSuburb}
                    {'  ·  '}
                    <strong>Est. cost:</strong> {estimatedCost ?? 'See report'}
                </Text>

                {/* Diagnosis note */}
                <Text
                    style={{
                        margin:     0,
                        fontSize:   13,
                        color:      '#7A7064',
                        lineHeight: 1.5,
                    }}
                >
                    This homeowner already has a Mendr diagnosis — you can see the full details
                    before quoting.
                </Text>
            </Section>

            {/* CTA */}
            <Section style={{ margin: '0 0 16px' }}>
                <MendrButton href={leadUrl}>View lead &amp; quote</MendrButton>
            </Section>

            {/* Disclaimer */}
            <Text
                style={{
                    margin:     0,
                    fontSize:   13,
                    color:      '#7A7064',
                    lineHeight: 1.6,
                }}
            >
                This lead has been shared with up to 3 contractors in your trade.
            </Text>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function newLeadNotificationText(params: NewLeadNotificationEmailProps): string {
    const {
        contractorFirstName,
        homeownerSuburb,
        faultTitle,
        faultCategory,
        urgency,
        estimatedCost,
        leadUrl,
        unsubscribeUrl,
    } = params;
    return [
        `Hi ${contractorFirstName}, you have a new Mendr lead.`,
        '',
        `Category: ${faultCategory}`,
        `Urgency: ${urgency}`,
        `Fault: ${faultTitle}`,
        `Location: ${homeownerSuburb}`,
        `Estimated cost: ${estimatedCost ?? 'See report'}`,
        '',
        'This homeowner already has a Mendr diagnosis — you can see the full details before quoting.',
        '',
        'View lead & quote:',
        leadUrl,
        '',
        'This lead has been shared with up to 3 contractors in your trade.',
        '',
        "You're receiving this because you're an active Mendr contractor.",
        `Unsubscribe: ${unsubscribeUrl}`,
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
    ].join('\n');
}
