'use client';

/**
 * ClarificationDrawer — bottom Sheet on mobile, centered Dialog on desktop.
 *
 * One question at a time. The user reads the discriminating question, picks
 * one of 3-4 sentence-shaped chips (Card size="sm" rows with bg-secondary
 * filled when picked), optionally adds extra context in a "Something Else?"
 * Textarea, and hits Continue to advance. Continue copy flips to "Refresh
 * Findings" on the final question.
 *
 * Why this shell instead of the full-screen overlay we had before:
 *   - Drawer/modal resizes to content. Variable question heights (3 vs 4 chips,
 *     short vs long sentences) don't leave dead space.
 *   - Drawer is its own surface, not nested in a sticky page footer. No
 *     competing scroll behaviours.
 *   - Bottom drawer on mobile, centered modal on desktop — both are platform-
 *     native patterns. Same content, two shells.
 *
 * Why one question per page:
 *   - The chip text is sentence-shaped (4-12 words). Sentences are heavy to
 *     parse. Forcing the user to read 3+ sentence-questions × 3-4 sentence-
 *     options at once is cognitive overload. One question = one decision.
 *   - Production data is mostly a single question anyway (legacy
 *     `clarification_questions: string[]` is one prompt + N chips). The
 *     pagination only kicks in for the v7.4 structured shape with multiple
 *     hypotheses.
 *
 * Picked-state visual: `bg-secondary` fill, `border-transparent` to prevent
 * the 1px shift that would otherwise happen toggling between the outline
 * Card and the borderless secondary fill.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { ClarificationQuestion } from '@/features/diagnosis/types';

export type ClarificationAnswerEntry = {
    /** The chip text the user tapped, or undefined if none picked. */
    pickedChip?: string;
    /** Free text from the "Something Else?" Textarea. Always preserved
     *  across navigation so the user doesn't lose what they typed. */
    extra?: string;
};

export type ClarificationAnswerMap = Record<number, ClarificationAnswerEntry>;

export function ClarificationDrawer({
    open,
    onOpenChange,
    questions,
    answers,
    onAnswersChange,
    onSubmit,
    isSubmitting = false,
}: {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    questions: ClarificationQuestion[];
    answers: ClarificationAnswerMap;
    onAnswersChange: (next: ClarificationAnswerMap) => void;
    /** Called when the user taps the terminal CTA on the last question. */
    onSubmit: () => void;
    /** Drives the CTA label without disabling the whole UI. */
    isSubmitting?: boolean;
}) {
    const isMobile = useIsMobile();
    const [currentIdx, setCurrentIdx] = useState(0);

    // Reset to the first question whenever the drawer opens.
    useEffect(() => {
        if (open) setCurrentIdx(0);
    }, [open]);

    const total = questions.length;
    const showPagination = total > 1;
    const isLastQuestion = currentIdx === total - 1;
    const currentQuestion = questions[currentIdx];
    const currentAnswer = answers[currentIdx] ?? {};
    const pickedChip = currentAnswer.pickedChip;
    const extraText = currentAnswer.extra ?? '';

    // The user has "answered" the current question when they've either picked
    // a chip OR typed something in the Something Else? Textarea.
    const currentAnswered =
        Boolean(pickedChip) || extraText.trim().length > 0;

    const setEntry = useCallback(
        (idx: number, patch: Partial<ClarificationAnswerEntry>) => {
            const prev = answers[idx] ?? {};
            const next = { ...prev, ...patch };
            // Clean up empty fields so the entry doesn't keep keys around with
            // empty strings — makes downstream checks (`Boolean(pickedChip)`)
            // simple and reliable.
            if (!next.pickedChip) delete next.pickedChip;
            if (!next.extra || next.extra.trim().length === 0) delete next.extra;
            const nextMap = { ...answers, [idx]: next };
            // If the entry ended up fully empty, drop the index from the map.
            if (Object.keys(next).length === 0) delete nextMap[idx];
            onAnswersChange(nextMap);
        },
        [answers, onAnswersChange]
    );

    const handlePickChip = useCallback(
        (idx: number, chip: string) => {
            setEntry(idx, { pickedChip: chip });
        },
        [setEntry]
    );

    const handleExtraChange = useCallback(
        (idx: number, value: string) => {
            setEntry(idx, { extra: value });
        },
        [setEntry]
    );

    const handleContinue = useCallback(() => {
        if (!currentAnswered || isSubmitting) return;
        if (isLastQuestion) {
            onSubmit();
            return;
        }
        setCurrentIdx((i) => Math.min(total - 1, i + 1));
    }, [currentAnswered, isLastQuestion, isSubmitting, onSubmit, total]);

    const continueCopy = useMemo(() => {
        if (isSubmitting) return 'Processing…';
        if (isLastQuestion) return 'Refresh Findings';
        return 'Continue';
    }, [isLastQuestion, isSubmitting]);

    if (questions.length === 0) return null;
    if (!currentQuestion) return null;

    const titleText = 'Need More Information';
    const descriptionText =
        'Pick the option that best matches what you are seeing, and add any extra detail at the bottom.';

    // The same body markup renders inside either the Sheet (mobile) or the
    // Dialog (desktop) so we only design the layout once.
    const body = (
        <div className="flex w-full flex-col gap-8 px-4 pt-8 pb-4">
            {/* Question header — caption + question text, both centered.
                Caption shown only when there's more than one question. */}
            <div className="flex w-full flex-col items-center gap-4">
                {showPagination ? (
                    <p className="text-xs font-medium text-muted-foreground tabular-nums">
                        Question {currentIdx + 1} / {total}
                    </p>
                ) : null}
                <p className="text-center text-sm font-medium text-foreground">
                    {currentQuestion.question}
                </p>
            </div>

            {/* Chip stack. Each chip is a Card size="sm" tappable row. Card
                content uses left-aligned text-sm so long sentences read
                naturally without re-finding the next line. */}
            <div className="flex w-full flex-col gap-4">
                {currentQuestion.options.map((opt) => {
                    const isPicked = pickedChip === opt;
                    return (
                        <Card
                            key={opt}
                            size="sm"
                            role="button"
                            tabIndex={isSubmitting ? -1 : 0}
                            aria-pressed={isPicked}
                            onClick={() => {
                                if (isSubmitting) return;
                                handlePickChip(currentIdx, opt);
                            }}
                            onKeyDown={(e) => {
                                if (isSubmitting) return;
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handlePickChip(currentIdx, opt);
                                }
                            }}
                            className={cn(
                                'cursor-pointer transition-colors',
                                isSubmitting &&
                                    'pointer-events-none opacity-50',
                                // Picked: filled with secondary, no border (and
                                // we add `border border-transparent` to avoid
                                // a 1px size shift relative to the outline state).
                                isPicked
                                    ? 'border border-transparent bg-secondary'
                                    : 'hover:bg-accent'
                            )}
                        >
                            <CardContent className="text-sm font-normal text-foreground">
                                {opt}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* "Something Else?" block — always visible. Mirrors the /start
                Problem Description pattern (Label + Textarea + helper). The
                Textarea uses min-h-[72px] to match the Figma resting size and
                grows naturally on type via the shadcn `field-sizing: content`
                rule. */}
            <div className="flex w-full flex-col gap-3">
                <Label htmlFor="clarification-extra">Something Else?</Label>
                <Textarea
                    id="clarification-extra"
                    value={extraText}
                    disabled={isSubmitting}
                    onChange={(e) =>
                        handleExtraChange(currentIdx, e.target.value)
                    }
                    className="min-h-[72px] max-h-40 resize-none"
                />
                <p className="text-xs text-muted-foreground">
                    Add any extra context that doesn&apos;t match one of the
                    options above.
                </p>
            </div>

            <Button
                type="button"
                className="w-full"
                disabled={!currentAnswered || isSubmitting}
                onClick={handleContinue}
            >
                {continueCopy}
            </Button>
        </div>
    );

    if (isMobile) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="max-h-[90vh] overflow-y-auto rounded-t-xl p-0"
                >
                    {/* Sheet primitive requires a title + description for a11y;
                        we hide them visually since the body has its own
                        centered heading. */}
                    <SheetTitle className="sr-only">{titleText}</SheetTitle>
                    <SheetDescription className="sr-only">
                        {descriptionText}
                    </SheetDescription>
                    <div className="mx-auto w-full max-w-xl">{body}</div>
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="max-w-md gap-0 overflow-y-auto p-0"
            >
                <DialogTitle className="sr-only">{titleText}</DialogTitle>
                <DialogDescription className="sr-only">
                    {descriptionText}
                </DialogDescription>
                {body}
            </DialogContent>
        </Dialog>
    );
}
