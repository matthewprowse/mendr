"use client";

/**
 * DiagnosisResultView — the scrollable body of /diagnosis: headline + trade
 * badge (with sticky-header scroll anchors), photo grid, streamed thought
 * text, diagnosis detail / hazard copy, trade-suggestion chips, and the
 * cost-estimate section.
 *
 * Extracted verbatim from client.tsx. Purely presentational: all state and
 * derived values are injected from the composition root, including the refs
 * the parent's sticky-header scroll effect reads, so behavior is unchanged.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CostEstimateSection } from "./cost-estimate-section";
import { DiagnosisPhotoTile } from "./photo-tiles";

/** Structural ref type — matches the object returned by `useRef`. */
type MutableRef<T> = { current: T };

export function DiagnosisResultView({
    conversationId,
    scrollContainerRef,
    headerTitleAnchorRef,
    headerBadgeAnchorRef,
    showSkeleton,
    showThoughtSkeleton,
    isDetailStageReady,
    isDiagnosing,
    isDiagnosingRetrying,
    diagnosisHeadline,
    hasBadge,
    badgeContent,
    uploadedImageSources,
    onOpenImage,
    onAddDetails,
    displayThoughtText,
    hasDiagnosisFailure,
    diagnosisFailureMessage,
    resolvedDetailText,
    hazardText,
    isServiceBlocked,
    shouldShowClarification,
    hasTradeSuggestions,
    tradeSuggestions,
    onTradeCandidatePick,
    serviceCatalog,
}: {
    conversationId?: string;
    scrollContainerRef: MutableRef<HTMLDivElement | null>;
    headerTitleAnchorRef: MutableRef<HTMLHeadingElement | null>;
    headerBadgeAnchorRef: MutableRef<HTMLDivElement | null>;
    showSkeleton: boolean;
    showThoughtSkeleton: boolean;
    isDetailStageReady: boolean;
    isDiagnosing: boolean;
    isDiagnosingRetrying: boolean;
    diagnosisHeadline: string;
    hasBadge: boolean;
    badgeContent: string;
    uploadedImageSources: string[];
    onOpenImage: (index: number) => void;
    onAddDetails: () => void;
    displayThoughtText: string;
    hasDiagnosisFailure: boolean;
    diagnosisFailureMessage: string | null;
    resolvedDetailText: string;
    hazardText: string;
    isServiceBlocked: boolean;
    shouldShowClarification: boolean;
    hasTradeSuggestions: boolean;
    tradeSuggestions: { trade: string; score: number }[];
    onTradeCandidatePick: (candidateTrade: string) => Promise<void>;
    serviceCatalog: string[];
}) {
    return (
        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col w-full max-w-xl mx-auto gap-8 p-4">
                {/* Diagnosis title + badge */}
                <div className="flex w-full flex-col gap-3">
                    {showSkeleton || !isDetailStageReady ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <Skeleton className="h-8 w-[88%] max-w-md" />
                            <Skeleton className="h-6 w-[62%] max-w-sm md:hidden" />
                        </div>
                    ) : (
                        <h2
                            ref={headerTitleAnchorRef}
                            className="w-full min-w-0 text-2xl font-semibold break-words"
                        >
                            {diagnosisHeadline}
                        </h2>
                    )}
                    {showSkeleton || !isDetailStageReady ? (
                        <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
                    ) : hasBadge ? (
                        // Wrapper div carries the scroll anchor so the badge
                        // can fade out of the body and into the header
                        // rightSlot without us needing to query the badge
                        // node itself (which would re-render on every render).
                        <div ref={headerBadgeAnchorRef} className="w-fit">
                            <Badge variant="secondary" className="w-fit">
                                {badgeContent}
                            </Badge>
                        </div>
                    ) : null}
                    {/* Sub-description, mirrors /start: text-sm muted, sits
                        beneath the headline group. Hidden during skeleton so
                        we don't reserve dead space while content streams in. */}
                    {!showSkeleton && isDetailStageReady ? (
                        <p className="text-sm text-muted-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed
                            do eiusmod tempor incididunt ut labore et dolore magna
                            aliqua.
                        </p>
                    ) : null}
                </div>

                <div className="flex flex-col gap-3">
                    {uploadedImageSources.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                            {uploadedImageSources.map((src, idx) => (
                                <DiagnosisPhotoTile
                                    key={`${src}-${idx}`}
                                    src={src}
                                    index={idx}
                                    showNumber={uploadedImageSources.length > 1}
                                    onOpen={() => onOpenImage(idx)}
                                />
                            ))}
                            {/*
                              Odd-count slot. /start fills this with an "Add
                              Photos" trigger; here we route to the refine
                              overlay (where users CAN attach extra photos)
                              so the affordance is honest. Only shown for 1 or
                              3 — 2 and 4 fill the grid cleanly. Hidden when
                              the diagnosis is in a transient/loading state.
                            */}
                            {(uploadedImageSources.length === 1 ||
                                uploadedImageSources.length === 3) &&
                            !showSkeleton ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={onAddDetails}
                                    className="aspect-square h-auto w-full"
                                >
                                    Add Photos
                                </Button>
                            ) : null}
                        </div>
                    ) : showSkeleton ? (
                        <div className="grid grid-cols-2 gap-2">
                            <Skeleton className="aspect-square w-full rounded-lg" />
                            <Skeleton className="aspect-square w-full rounded-lg" />
                            <Skeleton className="aspect-square w-full rounded-lg" />
                            <Skeleton className="aspect-square w-full rounded-lg" />
                        </div>
                    ) : null}

                    {/* Thought text */}
                    {showThoughtSkeleton ? (
                        <div
                            className="flex flex-col gap-3"
                            aria-busy="true"
                            aria-label="Loading analysis"
                        >
                            <Skeleton className="h-3.5 w-full" />
                            <Skeleton className="h-3.5 w-[94%]" />
                            <Skeleton className="h-3.5 w-[88%]" />
                            <Skeleton className="h-3.5 w-[72%]" />
                            {isDiagnosingRetrying ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    We&apos;re Retrying Automatically
                                </p>
                            ) : null}
                        </div>
                    ) : displayThoughtText ? (
                        // Thought block is now a single synthesised summary
                        // across all images. Per-image detail is reachable by
                        // tapping a photo — the fullscreen viewer surfaces the
                        // breakdown for the specific image opened.
                        <p className="text-xs text-muted-foreground">
                            {displayThoughtText}
                        </p>
                    ) : null}
                </div>

                {/* Detail */}
                <>
                    {showSkeleton || !isDetailStageReady ? (
                        <div
                            className="flex flex-col gap-4"
                            aria-busy="true"
                            aria-label="Loading diagnosis details"
                        >
                            <div className="flex flex-col gap-2.5">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-[96%]" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-[80%]" />
                            </div>
                            <div className="flex flex-col gap-2.5">
                                <Skeleton className="h-3 w-32" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-[90%]" />
                                <Skeleton className="h-9 w-full rounded-xl" />
                            </div>
                        </div>
                    ) : hasDiagnosisFailure ? (
                        <p className="text-sm text-foreground">{diagnosisFailureMessage}</p>
                    ) : (
                        <>
                            <div className="flex flex-col gap-3">
                                {(resolvedDetailText || "")
                                    .split(/\n{2,}/)
                                    .map((para) => para.trim())
                                    .filter((para) => para.length > 0)
                                    .map((para, i) => (
                                        <p
                                            key={i}
                                            className="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
                                        >
                                            {para}
                                        </p>
                                    ))}
                            </div>
                            {hazardText && !isServiceBlocked ? (
                                <p className="text-sm text-foreground leading-relaxed border-l-2 border-destructive/50 pl-3">
                                    {hazardText}
                                </p>
                            ) : null}
                        </>
                    )}
                    {/* E2 — soft trade-suggestion chips. When the classifier
                        emitted candidate trades that match our catalogue,
                        show them as tappable chips so the user can pick
                        "did you mean X?" instead of seeing a dead-end. Only
                        renders on rejection (isServiceBlocked) and never
                        when we're already showing clarification questions. */}
                    {isServiceBlocked && !shouldShowClarification && hasTradeSuggestions ? (
                        <div className="flex flex-col gap-2" data-testid="trade-suggestions">
                            <p className="text-sm font-medium text-foreground">
                                Did you mean one of these instead?
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {tradeSuggestions.map((s) => (
                                    <Button
                                        key={s.trade}
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        disabled={isDiagnosing || showSkeleton}
                                        onClick={() => onTradeCandidatePick(s.trade)}
                                    >
                                        {s.trade}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Tap a trade to re-diagnose with that hint.
                            </p>
                        </div>
                    ) : null}
                    {isServiceBlocked && serviceCatalog.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Trades Mendr can match today: {serviceCatalog.join(", ")}.
                        </p>
                    ) : null}

                    {/* Estimated cost — only for a real, serviceable diagnosis.
                        Lazily fetched/generated and shown at the bottom of the
                        diagnosis body. Hides itself when no estimate applies. */}
                    {!showSkeleton &&
                    !hasDiagnosisFailure &&
                    !isServiceBlocked &&
                    !shouldShowClarification &&
                    conversationId ? (
                        <CostEstimateSection conversationId={conversationId} />
                    ) : null}
                </>

                {/*
                  Inline "Refine Diagnosis" intentionally removed — the action
                  now lives in the sticky footer as a ghost "Add Details"
                  button, paired with the primary "Find Contractors" CTA.
                */}
            </div>
            {/* /max-w-xl */}
        </div>
    );
}
