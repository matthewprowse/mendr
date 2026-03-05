'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight scroll area component.
 * If you later add `@radix-ui/react-scroll-area`, you can swap this out.
 */
const ScrollArea = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    ({ className, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn('relative h-full w-full overflow-y-auto', className)}
                {...props}
            >
                {children}
            </div>
        );
    }
);

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };

