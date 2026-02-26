'use client';

import { useEffect, useState } from 'react';
import { sanitizeAiContent } from '@/lib/utils';
import { toTitleCase } from '@/lib/services';
import { DiagnosisData } from './types';
import { ServiceTradeLink } from './service-trade-link';

const WORD_DELAY_MS = 40;

function RevealText({ text }: { text: string }) {
    const words = text.trim() ? text.trim().split(/\s+/) : [];
    const [visibleCount, setVisibleCount] = useState(0);

    useEffect(() => {
        setVisibleCount(0);
    }, [text]);

    useEffect(() => {
        if (visibleCount >= words.length) return;
        const t = setTimeout(() => setVisibleCount((c) => c + 1), WORD_DELAY_MS);
        return () => clearTimeout(t);
    }, [visibleCount, words.length]);

    const visible = words.slice(0, visibleCount).join(' ');
    const trailingSpace = visibleCount > 0 && visibleCount < words.length ? ' ' : '';
    return (
        <>
            {visible}
            {trailingSpace}
        </>
    );
}

export function DiagnosisReport({ diagnosis }: { diagnosis: DiagnosisData | null }) {
    if (!diagnosis?.diagnosis || diagnosis?.requires_clarification) return null;
    const isUnrelated = diagnosis?.rejected || diagnosis?.requires_clarification;
    return (
        <div className="space-y-3">
            {diagnosis.trade && diagnosis.trade !== 'N/A' && (
                <ServiceTradeLink trade={diagnosis.trade} />
            )}
            <h2 className="text-2xl font-semibold leading-tight tracking-tight">
                {toTitleCase(diagnosis.diagnosis)}
            </h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                <RevealText text={sanitizeAiContent(diagnosis.action_required || '')} />
            </p>
        </div>
    );
}
