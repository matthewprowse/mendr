'use client';

import { sanitizeAiContent } from '@/lib/utils';
import { toTitleCase } from '@/lib/services';
import { DiagnosisData } from './types';
import { ServiceTradeLink } from './service-trade-link';

export function DiagnosisReport({ diagnosis }: { diagnosis: DiagnosisData | null }) {
    if (!diagnosis?.diagnosis || diagnosis?.requires_clarification) return null;
    return (
        <div className="space-y-3">
            {diagnosis.trade && diagnosis.trade !== 'N/A' && (
                <ServiceTradeLink trade={diagnosis.trade} />
            )}
            <h2 className="text-2xl font-semibold leading-tight tracking-tight">
                {toTitleCase(diagnosis.diagnosis)}
            </h2>
            {diagnosis.action_required && diagnosis.action_required !== 'N/A' && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {sanitizeAiContent(diagnosis.action_required || '')}
                </p>
            )}
        </div>
    );
}
