'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWizard } from './wizard-context';
import { RequiredLabel, StepHeader } from './shared-ui';
import { WILLINGNESS_OPTIONS } from './types';

export function StepWillingnessToPay() {
    const { data, patch } = useWizard();
    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="What would you pay per month?"
                description="Roughly what is fair for platform access and informed leads in your area? This helps us prioritise value — it is not a bill or contract."
            />
            <div className="flex flex-col gap-4">
                <RequiredLabel htmlFor="wtp">Comfortable monthly range</RequiredLabel>
                <Select value={data.willingnessToPayBand} onValueChange={(v) => patch({ willingnessToPayBand: v })}>
                    <SelectTrigger id="wtp" className="h-10 min-h-10 w-full data-[size=default]:h-10">
                        <SelectValue placeholder="Choose a range" />
                    </SelectTrigger>
                    <SelectContent>
                        {WILLINGNESS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    Founding providers often lock in better rates before standard pricing applies.
                </p>
            </div>
        </div>
    );
}
