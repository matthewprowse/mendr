'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from '@/lib/icons';

const Breadcrumb = React.forwardRef<HTMLElement, React.ComponentProps<'nav'>>(
    ({ className, ...props }, ref) => (
        <nav
            ref={ref}
            aria-label="Breadcrumb"
            className={cn('flex w-full items-center text-sm', className)}
            {...props}
        />
    )
);
Breadcrumb.displayName = 'Breadcrumb';

const BreadcrumbList = React.forwardRef<HTMLOListElement, React.ComponentProps<'ol'>>(
    ({ className, ...props }, ref) => (
        <ol
            ref={ref}
            className={cn('flex flex-wrap items-center gap-1.5 text-muted-foreground', className)}
            {...props}
        />
    )
);
BreadcrumbList.displayName = 'BreadcrumbList';

const BreadcrumbItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
    ({ className, ...props }, ref) => (
        <li
            ref={ref}
            className={cn('inline-flex items-center gap-1', className)}
            {...props}
        />
    )
);
BreadcrumbItem.displayName = 'BreadcrumbItem';

const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<'a'>>(
    ({ className, ...props }, ref) => (
        <a
            ref={ref}
            className={cn(
                'text-foreground/80 hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline',
                className
            )}
            {...props}
        />
    )
);
BreadcrumbLink.displayName = 'BreadcrumbLink';

const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.ComponentProps<'span'>>(
    ({ className, ...props }, ref) => (
        <span
            ref={ref}
            aria-current="page"
            className={cn('text-foreground inline-flex items-center font-medium', className)}
            {...props}
        />
    )
);
BreadcrumbPage.displayName = 'BreadcrumbPage';

const BreadcrumbSeparator = React.forwardRef<HTMLSpanElement, React.ComponentProps<'span'>>(
    ({ className, ...props }, ref) => (
        <span
            ref={ref}
            role="presentation"
            className={cn('text-muted-foreground/60 inline-flex items-center', className)}
            {...props}
        >
            <ChevronRight className="size-3.5" aria-hidden />
        </span>
    )
);
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';

export { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator };

