'use client';

import { useState } from 'react';
import { ShieldCheck } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { INK } from '@/lib/design-tokens';
import { getCertificationBySlug } from '@/lib/certifications/catalog';
import type { MatchProviderCertification } from '@/features/match/contracts';

const VISIBLE_LIMIT = 6;

function toTitleCaseLabel(text: string): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    const upperTokens = new Set(['ac', 'cctv', 'tv', 'hvac', 'gps', 'wifi', 'dc', 'db']);
    return trimmed
        .split(' ')
        .map((word) => {
            const clean = word.toLowerCase();
            if (upperTokens.has(clean)) return clean.toUpperCase();
            return clean.charAt(0).toUpperCase() + clean.slice(1);
        })
        .join(' ');
}

export type TrustStripProps = {
    certifications: MatchProviderCertification[];
    specialisations: string[];
};

export function TrustStrip({ certifications, specialisations }: TrustStripProps) {
    const [expanded, setExpanded] = useState(false);
    const totalChips = certifications.length + specialisations.length;
    if (totalChips === 0) return null;

    const certEls = certifications.map((c) => {
        const cat = getCertificationBySlug(c.slug);
        return (
            <Badge
                key={`cert-${c.slug}`}
                variant="secondary"
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50"
            >
                <ShieldCheck size={12} weight="fill" className="mr-1" aria-hidden />
                {cat?.label ?? c.label}
            </Badge>
        );
    });

    const specEls = specialisations
        .filter((s) => typeof s === 'string' && s.trim().length > 0)
        .map((s) => (
            <Badge key={`spec-${s}`} variant="secondary" className="rounded-full font-normal">
                {toTitleCaseLabel(s)}
            </Badge>
        ));

    const allEls = [...certEls, ...specEls];
    const visible = expanded ? allEls : allEls.slice(0, VISIBLE_LIMIT);
    const hiddenCount = allEls.length - visible.length;

    return (
        <section
            className="rounded-3xl border border-black/[0.07] bg-white p-4 sm:p-5"
            aria-label="Certifications and specialisations"
        >
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: INK }}>
                Trust & specialities
            </h2>
            <div className="flex flex-wrap gap-2">
                {visible}
                {hiddenCount > 0 ? (
                    <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        className="rounded-full border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-black/[0.04]"
                    >
                        +{hiddenCount} more
                    </button>
                ) : null}
                {expanded && allEls.length > VISIBLE_LIMIT ? (
                    <button
                        type="button"
                        onClick={() => setExpanded(false)}
                        className="rounded-full border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-black/[0.04]"
                    >
                        Show less
                    </button>
                ) : null}
            </div>
        </section>
    );
}
