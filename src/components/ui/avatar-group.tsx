import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * AvatarGroup
 *
 * Custom shadcn-style composition built directly on top of the stock
 * `Avatar` primitive. Renders children with horizontal overlap and a
 * ring matching the page background. Optionally caps the visible count
 * with a "+N" overflow tile.
 */
function AvatarGroup({
    children,
    className,
    max,
    ...props
}: React.ComponentProps<"div"> & { max?: number }) {
    const items = React.Children.toArray(children);
    const visible = typeof max === "number" ? items.slice(0, max) : items;
    const overflow = typeof max === "number" ? items.length - max : 0;

    return (
        <div
            data-slot="avatar-group"
            className={cn(
                "flex -space-x-2 *:ring-2 *:ring-background",
                className
            )}
            {...props}
        >
            {visible}
            {overflow > 0 ? (
                <Avatar>
                    <AvatarFallback className="text-xs">
                        +{overflow}
                    </AvatarFallback>
                </Avatar>
            ) : null}
        </div>
    );
}

export { AvatarGroup };
