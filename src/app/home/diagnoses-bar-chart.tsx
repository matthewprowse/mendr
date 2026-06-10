'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DiagnosesSeries } from '@/features/home/stats';

const config = {
    count: { label: 'Diagnoses', color: 'var(--primary)' },
} satisfies ChartConfig;

type RangeKey = keyof DiagnosesSeries;

const RANGES: { key: RangeKey; label: string }[] = [
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'sixMonths', label: '6 Months' },
];

export function DiagnosesBarChart({ series }: { series: DiagnosesSeries }) {
    const [range, setRange] = useState<RangeKey>('week');
    const data = series[range];
    // Thin x-axis labels when there are many bars (e.g. the 30-day view).
    const interval = data.length > 14 ? Math.floor(data.length / 6) : 0;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-base font-medium text-foreground">Diagnoses</p>
                <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                    <TabsList className="h-8 w-fit gap-0.5 rounded-md p-0.5 group-data-[orientation=horizontal]/tabs:h-8">
                        {RANGES.map((r) => (
                            <TabsTrigger key={r.key} value={r.key} className="rounded-sm px-2 text-xs">
                                {r.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>
            <ChartContainer config={config} className="aspect-auto h-[196px] w-full">
                <BarChart accessibilityLayer data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        interval={interval}
                    />
                    <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
            </ChartContainer>
        </div>
    );
}
