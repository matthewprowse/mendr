import * as React from 'react';
import { cn } from '@/lib/utils';
import { LoaderCircle } from '@/lib/icons';

const Spinner = React.forwardRef<
    SVGSVGElement,
    React.ComponentPropsWithoutRef<typeof LoaderCircle>
>(({ className, ...props }, ref) => (
    <LoaderCircle ref={ref} className={cn('animate-spin', className)} {...props} />
));
Spinner.displayName = 'Spinner';

export { Spinner };
