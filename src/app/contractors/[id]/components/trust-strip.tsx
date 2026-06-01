'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { INK } from '@/lib/design-tokens';
import { getCertificationBySlug } from '@/lib/certifications/catalog';
import type { MatchProviderCertification } from '@/features/match/contracts';

const SPEC_VISIBLE_LIMIT = 6;

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
    const [specsExpanded, setSpecsExpanded] = useState(false);

    const filteredSpecs = specialisations.filter((s) => typeof s === 'string' && s.trim().length > 0);
    const hasCerts = certifications.length > 0;
    const hasSpecs = filteredSpecs.length > 0;

    if (!hasCerts && !hasSpecs) return null;

    const visibleSpecs = specsExpanded ? filteredSpecs : filteredSpecs.slice(0, SPEC_VISIBLE_LIMIT);
    const hiddenSpecCount = filteredSpecs.length - visibleSpecs.length;

    return (
        <div className="flex flex-col gap-3">
            {hasCerts ? (
                <section
                    className="rounded-3xl border border-black/[0.07] bg-white p-4 sm:p-5"
                    aria-label="Certifications"
                >
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: INK }}>
                        Certifications
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {certifications.map((c) => {
                            const cat = getCertificationBySlug(c.slug);
                            return (
                                <Badge
                                    key={`cert-${c.slug}`}
                                    variant="secondary"
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50"
                                >
                                    <ShieldCheck size={12} fill="currentColor" className="mr-1" aria-hidden />
                                    {cat?.label ?? c.label}
                                </Badge>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            {hasSpecs ? (
                <section
                    className="rounded-3xl border border-black/[0.07] bg-white p-4 sm:p-5"
                    aria-label="Trades and specialities"
                >
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: INK }}>
                        Trades & specialities
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {visibleSpecs.map((s) => (
                            <Badge key={`spec-${s}`} variant="secondary" className="rounded-full font-normal">
                                {toTitleCaseLabel(s)}
                            </Badge>
                        ))}
                        {hiddenSpecCount > 0 ? (
                            <button
                                type="button"
                                onClick={() => setSpecsExpanded(true)}
                                className="rounded-full border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-black/[0.04]"
                            >
                                +{hiddenSpecCount} more
                            </button>
                        ) : null}
                        {specsExpanded && filteredSpecs.length > SPEC_VISIBLE_LIMIT ? (
                            <button
                                type="button"
                                onClick={() => setSpecsExpanded(false)}
                                className="rounded-full border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-black/[0.04]"
                            >
                                Show less
                            </button>
                        ) : null}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
