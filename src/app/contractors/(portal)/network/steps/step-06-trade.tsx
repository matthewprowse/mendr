'use client';

import { useMemo } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWizard } from './wizard-context';
import { RequiredLabel, StepHeader } from './shared-ui';
import { tokenizeCsv } from './utils';

export function StepTrade() {
    const { data, patch, services, servicesLoading } = useWizard();
    const specialisationChips = useMemo(() => tokenizeCsv(data.specialisations), [data.specialisations]);
    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Trade & Specialisations"
                description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <RequiredLabel htmlFor="trade">Primary Trade</RequiredLabel>
                    {servicesLoading ? (
                        <div className="h-10 w-full animate-pulse rounded-md border border-border/50 bg-muted/40" />
                    ) : (
                        <Select
                            value={data.trade}
                            onValueChange={(v) => patch({ trade: v })}
                            disabled={services.length === 0}
                        >
                            <SelectTrigger id="trade" className="h-10 min-h-10 w-full data-[size=default]:h-10">
                                <SelectValue placeholder="Select service" />
                            </SelectTrigger>
                            <SelectContent>
                                {services.map((service) => (
                                    <SelectItem key={service.id} value={service.label}>
                                        {service.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
                <div className="flex flex-col gap-3">
                    <RequiredLabel htmlFor="specialisations">Specialisations</RequiredLabel>
                    <Textarea
                        id="specialisations"
                        className="h-24 text-sm"
                        value={data.specialisations}
                        onChange={(e) => patch({ specialisations: e.target.value })}
                        placeholder="Comma-separated, e.g. interior walls, roof coating, waterproofing"
                    />
                    <p className="text-xs text-muted-foreground">
                        Separate with commas — we turn them into tags on your profile.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {specialisationChips.map((chip, index) => (
                            <Badge key={`${chip}-${index}`} variant="secondary">
                                {chip}
                            </Badge>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
