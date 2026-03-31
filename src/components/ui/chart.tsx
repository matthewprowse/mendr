'use client';

import * as React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Tooltip as RechartsTooltip, type TooltipProps } from 'recharts';

import { cn } from '@/lib/utils';

export type ChartConfig = {
    [key: string]: {
        label?: string;
        icon?: React.ComponentType<{ className?: string }>;
        color?: string;
    };
};

type ChartContextValue = {
    config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

export function useChart() {
    const ctx = React.useContext(ChartContext);
    if (!ctx) {
        throw new Error('useChart must be used within a ChartContainer');
    }
    return ctx;
}

type ChartContainerProps = {
    config: ChartConfig;
    children: ReactNode;
    className?: string;
};

export function ChartContainer({ config, children, className }: ChartContainerProps) {
    const colorVars: CSSProperties = {};
    let index = 1;

    Object.entries(config).forEach(([key, value]) => {
        const color = value.color || `var(--chart-${index})`;
        (colorVars as any)[`--color-${key}`] = color;
        index += 1;
    });

    return (
        <ChartContext.Provider value={{ config }}>
            <div
                className={cn(
                    'relative flex min-h-[200px] w-full items-center justify-center',
                    className
                )}
                style={colorVars}
            >
                {children}
            </div>
        </ChartContext.Provider>
    );
}

export function ChartTooltip(props: TooltipProps<any, any>) {
    return (
        <RechartsTooltip
            cursor={{ fill: 'transparent' }}
            {...props}
        />
    );
}

export function ChartTooltipContent(props: TooltipProps<any, any>) {
    const { active, label, payload } = props;

    if (!active || !payload || payload.length === 0) {
        return null;
    }

    return (
        <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
            {label && (
                <div className="mb-1 font-medium text-foreground">
                    {label}
                </div>
            )}
            <div className="space-y-1">
                {payload.map((entry) => (
                    <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={entry.dataKey ?? entry.name}
                        className="flex items-center justify-between gap-4"
                    >
                        <span className="flex items-center gap-1 text-muted-foreground">
                            <span
                                className="inline-block size-2 rounded-full"
                                style={{ backgroundColor: entry.color }}
                            />
                            {entry.name ?? entry.dataKey}
                        </span>
                        <span className="font-mono text-foreground">
                            {entry.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

