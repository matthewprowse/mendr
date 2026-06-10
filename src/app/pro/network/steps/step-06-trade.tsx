'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useWizard } from './wizard-context';
import { RequiredLabel, StepHeader } from './shared-ui';
import { tokenizeCsv } from './utils';

export function StepTrade() {
    const { data, patch, services, servicesLoading } = useWizard();
    const [listOpen, setListOpen] = useState(false);
    const specialisationChips = useMemo(() => tokenizeCsv(data.specialisations), [data.specialisations]);

    const selectTrade = (label: string) => {
        patch({ trade: label });
        setListOpen(false);
    };

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
                        <>
                            <Button
                                id="trade"
                                type="button"
                                variant="secondary"
                                className="h-10 w-full"
                                disabled={services.length === 0}
                                onClick={() => setListOpen((open) => !open)}
                            >
                                {data.trade || 'Select Trade'}
                            </Button>
                            {listOpen ? (
                                <RadioGroup
                                    aria-label="Primary trade"
                                    value={data.trade}
                                    onValueChange={(v) => selectTrade(v)}
                                    className="flex flex-col gap-0"
                                >
                                    {services.map((service, i) => (
                                        <div key={service.id}>
                                            {i > 0 ? <Separator /> : null}
                                            <label
                                                htmlFor={`trade-${service.id}`}
                                                className="flex w-full cursor-pointer items-center gap-3 py-3"
                                            >
                                                <span
                                                    className="size-12 shrink-0 rounded-md bg-secondary"
                                                    aria-hidden="true"
                                                />
                                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                    <span className="text-sm font-medium text-foreground">
                                                        {service.label}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                                    </span>
                                                </span>
                                                <RadioGroupItem id={`trade-${service.id}`} value={service.label} />
                                            </label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            ) : null}
                        </>
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
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
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
