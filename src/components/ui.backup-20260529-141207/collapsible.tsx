'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

type CollapsibleContextValue = {
    open: boolean;
    setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

function useCollapsibleContext() {
    const ctx = React.useContext(CollapsibleContext);
    if (!ctx) {
        throw new Error('Collapsible components must be used within <Collapsible>.');
    }
    return ctx;
}

type CollapsibleProps = React.ComponentProps<'div'> & {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    asChild?: boolean;
};

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
    (
        { open: openProp, defaultOpen, onOpenChange, asChild = false, className, children, ...props },
        ref
    ) => {
        const [uncontrolledOpen, setUncontrolledOpen] = React.useState(!!defaultOpen);
        const open = openProp ?? uncontrolledOpen;

        const setOpen = React.useCallback(
            (value: boolean | ((prev: boolean) => boolean)) => {
                const next = typeof value === 'function' ? (value as (prev: boolean) => boolean)(open) : value;
                if (openProp === undefined) {
                    setUncontrolledOpen(next);
                }
                onOpenChange?.(next);
            },
            [open, openProp, onOpenChange]
        );

        const Comp = asChild ? Slot : 'div';

        return (
            <CollapsibleContext.Provider value={{ open, setOpen }}>
                <Comp
                    ref={ref}
                    data-state={open ? 'open' : 'closed'}
                    className={cn(className)}
                    {...props}
                >
                    {children}
                </Comp>
            </CollapsibleContext.Provider>
        );
    }
);
Collapsible.displayName = 'Collapsible';

type CollapsibleTriggerProps = React.ComponentProps<'button'> & {
    asChild?: boolean;
};

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
    ({ asChild = false, className, onClick, ...props }, ref) => {
        const { open, setOpen } = useCollapsibleContext();
        const Comp = asChild ? Slot : 'button';

        return (
            <Comp
                ref={ref}
                type={Comp === 'button' ? 'button' : undefined}
                aria-expanded={open}
                data-state={open ? 'open' : 'closed'}
                className={cn(className)}
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                    onClick?.(event);
                    setOpen((prev) => !prev);
                }}
                {...props}
            />
        );
    }
);
CollapsibleTrigger.displayName = 'CollapsibleTrigger';

type CollapsibleContentProps = React.ComponentProps<'div'>;

const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
    ({ className, children, ...props }, ref) => {
        const { open } = useCollapsibleContext();

        return (
            <div
                ref={ref}
                hidden={!open}
                data-state={open ? 'open' : 'closed'}
                className={cn(className)}
                {...props}
            >
                {children}
            </div>
        );
    }
);
CollapsibleContent.displayName = 'CollapsibleContent';

export { Collapsible, CollapsibleContent, CollapsibleTrigger };

