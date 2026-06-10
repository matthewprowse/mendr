'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useWizard } from './wizard-context';
import { StepHeader } from './shared-ui';
import type { ContractorType } from './types';

const SUB = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
const OPTIONS: { v: ContractorType; label: string; sub: string }[] = [
    { v: 'individual', label: 'Individual', sub: SUB },
    { v: 'team', label: 'Team', sub: SUB },
    { v: 'enterprise', label: 'Enterprise', sub: SUB },
];

export function StepContractorType() {
    const { data, patch } = useWizard();

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="How Do You Work?"
                description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore."
            />
            <RadioGroup
                aria-label="How you work"
                value={data.contractorType}
                onValueChange={(v) => patch({ contractorType: v as ContractorType })}
                className="flex flex-col gap-0"
            >
                {OPTIONS.map((opt, index) => (
                    <div key={opt.v}>
                        {index > 0 ? <Separator /> : null}
                        <label
                            htmlFor={`contractor-type-${opt.v}`}
                            className="flex w-full cursor-pointer items-center gap-3 py-3"
                        >
                            <span className="size-12 shrink-0 rounded-md bg-secondary" aria-hidden="true" />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-sm font-medium text-foreground">{opt.label}</span>
                                <span className="text-xs text-muted-foreground">{opt.sub}</span>
                            </span>
                            <RadioGroupItem id={`contractor-type-${opt.v}`} value={opt.v} />
                        </label>
                    </div>
                ))}
            </RadioGroup>
        </div>
    );
}
