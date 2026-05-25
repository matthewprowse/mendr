'use client';

import { useWizard } from './wizard-context';
import { StepHeader } from './shared-ui';
import type { ContractorType } from './types';

export function StepContractorType() {
    const { data, patch } = useWizard();
    const setType = (t: ContractorType) => patch({ contractorType: t });

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="How do you work?"
                description="We use this to set how many service areas you can add and to understand our network."
            />
            <div className="flex flex-col gap-3">
                {(
                    [
                        { v: 'individual' as const, label: 'Individual', sub: 'Solo operator — one primary service radius.' },
                        { v: 'team' as const, label: 'Team', sub: 'Small crew — up to three coverage zones.' },
                        { v: 'enterprise' as const, label: 'Enterprise', sub: 'Larger business — up to six coverage zones.' },
                    ] as const
                ).map((opt) => (
                    <button
                        key={opt.v}
                        type="button"
                        onClick={() => setType(opt.v)}
                        className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ${
                            data.contractorType === opt.v
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted/40'
                        }`}
                    >
                        <span className="font-medium text-foreground">{opt.label}</span>
                        <span className="text-sm text-muted-foreground">{opt.sub}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
