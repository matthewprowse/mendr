/**
 * Transactional email sent to a homeowner when their Mendr diagnosis is ready.
 *
 * Usage:
 *   import { DiagnosisReadyEmail, diagnosisReadyText } from '@/lib/email/templates/diagnosis-ready';
 */

import React from 'react';
import { Text, Section } from '@react-email/components';
import { MendrEmailLayout, MendrButton } from '@/lib/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiagnosisReadyEmailProps {
    reportUrl: string;
    faultTitle: string;
    urgency: 'low' | 'moderate' | 'high' | 'emergency';
    estimatedCost?: string;
    tradeCategory: string;
    suburb?: string;
}

// ── Urgency badge helpers ─────────────────────────────────────────────────────

const URGENCY_STYLES: Record<
    DiagnosisReadyEmailProps['urgency'],
    { background: string; color: string; label: string }
> = {
    low:       { background: '#171717', color: '#FFFFFF', label: 'Low urgency' },
    moderate:  { background: '#171717', color: '#FFFFFF', label: 'Moderate urgency' },
    high:      { background: '#171717', color: '#FFFFFF', label: 'High urgency' },
    emergency: { background: '#171717', color: '#FFFFFF', label: 'Emergency' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function DiagnosisReadyEmail({
    reportUrl,
    faultTitle,
    urgency,
    estimatedCost,
    tradeCategory,
    suburb,
}: DiagnosisReadyEmailProps) {
    const badge = URGENCY_STYLES[urgency];
    const previewText = `Your Mendr diagnosis is ready — ${faultTitle}`;

    return (
        <MendrEmailLayout previewText={previewText}>
            {/* Heading */}
            <Text
                style={{
                    margin:     '0 0 6px',
                    fontSize:   24,
                    fontWeight: 600,
                    color:      '#0A0A0A',
                    lineHeight: 1.25,
                }}
            >
                Your diagnosis is ready.
            </Text>

            <Text
                style={{
                    margin:     '0 0 20px',
                    fontSize:   14,
                    color:      '#404040',
                    lineHeight: 1.6,
                }}
            >
                We&apos;ve analysed your photo and identified the issue.
            </Text>

            {/* Diagnosis summary card */}
            <Section
                style={{
                    backgroundColor: '#F5F5F5',
                    border:          '1px solid #E5E5E5',
                    borderRadius:    14,
                    padding:         '16px 20px',
                    marginBottom:    24,
                }}
            >
                {/* Fault title */}
                <Text
                    style={{
                        margin:     '0 0 10px',
                        fontSize:   16,
                        fontWeight: 600,
                        color:      '#0A0A0A',
                        lineHeight: 1.4,
                    }}
                >
                    {faultTitle}
                </Text>

                {/* Meta row: urgency badge + trade category + suburb */}
                <Text
                    style={{
                        margin:     '0 0 4px',
                        fontSize:   13,
                        color:      '#404040',
                        lineHeight: 1.5,
                    }}
                >
                    <span
                        style={{
                            display:         'inline-block',
                            backgroundColor: badge.background,
                            color:           badge.color,
                            borderRadius:    4,
                            padding:         '2px 8px',
                            fontSize:        12,
                            fontWeight:      600,
                            marginRight:     8,
                        }}
                    >
                        {badge.label}
                    </span>
                    {tradeCategory}
                    {suburb ? ` · ${suburb}` : ''}
                </Text>

                {/* Cost estimate — only shown when provided */}
                {estimatedCost && (
                    <Text
                        style={{
                            margin:     '8px 0 0',
                            fontSize:   13,
                            color:      '#404040',
                            lineHeight: 1.5,
                        }}
                    >
                        Estimated repair cost: <strong>{estimatedCost}</strong>
                    </Text>
                )}
            </Section>

            {/* CTA */}
            <Section style={{ margin: '0 0 16px' }}>
                <MendrButton href={reportUrl}>View your full report</MendrButton>
            </Section>

            {/* Supporting copy */}
            <Text
                style={{
                    margin:     '0',
                    fontSize:   14,
                    color:      '#737373',
                    lineHeight: 1.6,
                }}
            >
                Your report also shows vetted local contractors who can fix this.
            </Text>
        </MendrEmailLayout>
    );
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function diagnosisReadyText(params: DiagnosisReadyEmailProps): string {
    const { reportUrl, faultTitle, urgency, estimatedCost, tradeCategory, suburb } = params;
    const lines: string[] = [
        'Your Mendr diagnosis is ready.',
        '',
        `Fault: ${faultTitle}`,
        `Category: ${tradeCategory}${suburb ? ` · ${suburb}` : ''}`,
        `Urgency: ${urgency}`,
    ];
    if (estimatedCost) {
        lines.push(`Estimated cost: ${estimatedCost}`);
    }
    lines.push(
        '',
        'View your full report:',
        reportUrl,
        '',
        'Your report also shows vetted local contractors who can fix this.',
        '',
        'Mendr · Cape Town, Western Cape, South Africa',
    );
    return lines.join('\n');
}
