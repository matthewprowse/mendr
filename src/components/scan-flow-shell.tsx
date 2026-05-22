"use client";

import type { RefObject } from "react";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ScanFlowShellProps = {
    children: React.ReactNode;
    /** Fixed bottom bar (e.g. primary actions). */
    footer?: React.ReactNode;
    /** Close / back — opens leave flow or navigates back. */
    onClose?: () => void;
    logoSrc?: string;
    logoAlt?: string;
    logoClassName?: string;
    /**
     * Bottom padding (px) for the scrollable area so content clears the fixed footer.
     * Defaults to ~7rem when there is a footer, else a smaller inset.
     */
    contentBottomPadding?: number;
    footerRef?: RefObject<HTMLDivElement | null>;
    /** When true, main column is capped at max-w-3xl (e.g. diagnosis). */
    constrainContentWidth?: boolean;
    contentClassName?: string;
    chromeZIndex?: string;
    headerRight?: React.ReactNode;
    headerClassName?: string;
    contentWrapperClassName?: string;
    hideBrand?: boolean;
    brandText?: string;
    headerLeft?: React.ReactNode;
    headerCenter?: React.ReactNode;
    /** Merged onto the header row inner container (default max-w-3xl). */
    headerInnerClassName?: string;
};

const DEFAULT_FOOTER_RESERVE = 112;

export function ScanFlowShell({
    children,
    footer,
    onClose,
    logoSrc = "/image.png",
    logoAlt = "Mendr logo",
    logoClassName = "h-10 w-10 scale-200 object-cover",
    contentBottomPadding,
    footerRef,
    constrainContentWidth = false,
    contentClassName,
    chromeZIndex = "z-40",
    headerRight,
    headerClassName,
    contentWrapperClassName,
    hideBrand = false,
    brandText = "Mendr",
    headerLeft,
    headerCenter,
    headerInnerClassName,
}: ScanFlowShellProps) {
    const bottomPad =
        contentBottomPadding ?? (footer ? DEFAULT_FOOTER_RESERVE : 24);

    const inner = constrainContentWidth ? (
        <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-6", contentClassName)}>
            {children}
        </div>
    ) : (
        <div className={cn("flex flex-col gap-4", contentClassName)}>{children}</div>
    );

    return (
        <main className="min-h-screen bg-secondary">
            <div
                className={cn(
                    "fixed inset-x-0 top-0 bg-secondary p-4",
                    chromeZIndex,
                    headerClassName
                )}
            >
                <div
                    className={cn(
                        "relative mx-auto flex w-full max-w-3xl items-center gap-2",
                        headerInnerClassName
                    )}
                >
                    <div className="flex shrink-0 items-center">
                        {headerLeft ? (
                            headerLeft
                        ) : hideBrand ? (
                            <div className="h-10 w-10" aria-hidden />
                        ) : (
                            <h3 className="text-xl text-foreground font-semibold tracking-tight">
                                {brandText}
                            </h3>
                        )}
                    </div>
                    {headerCenter ? (
                        <>
                            <div className="flex min-h-10 min-w-0 flex-1 items-center justify-center overflow-hidden px-1">
                                {headerCenter}
                            </div>
                            <div className="flex shrink-0 items-center justify-end">
                                {headerRight ? (
                                    headerRight
                                ) : onClose ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="size-10"
                                        onClick={onClose}
                                    >
                                        <X size={20} weight="bold" className="text-foreground" />
                                    </Button>
                                ) : (
                                    <div className="h-10 w-10" aria-hidden />
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex min-h-10 min-w-0 flex-1 items-center justify-end gap-2">
                            {headerRight ? (
                                headerRight
                            ) : onClose ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="size-10"
                                    onClick={onClose}
                                >
                                    <X size={20} weight="bold" className="text-foreground" />
                                </Button>
                            ) : (
                                <div className="h-10 w-10" aria-hidden />
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div
                className={cn("flex min-h-screen flex-col gap-4 p-4 pt-20", contentWrapperClassName)}
                style={{ paddingBottom: `${bottomPad}px` }}
            >
                {inner}
            </div>

            {footer ? (
                <div
                    ref={footerRef}
                    className={cn(
                        "fixed inset-x-0 bottom-0 bg-secondary p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
                        chromeZIndex
                    )}
                >
                    <div className="mx-auto w-full max-w-3xl">{footer}</div>
                </div>
            ) : null}
        </main>
    );
}
