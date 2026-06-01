/**
 * Structured multi-question clarification footer.
 *
 * Renders one card per hypothesis with its discriminating question and
 * answer chips. Chips are toggleable multi-select (one chip per hypothesis,
 * across N hypotheses), plus an optional free-text note. The user then
 * submits all selections + free-text together as a single refine call.
 *
 * This is the multi-hypothesis flow: previously each chip click fired a
 * separate refine, which meant the user could only answer ONE hypothesis
 * at a time — even when the diagnosis presented two (e.g. h1: "spring
 * snapped" vs h2: "hinge bent"). Batching lets the user say "yes spring
 * snapped AND hinges look intact" in one round.
 *
 * Used by `src/app/diagnosis/client.tsx` when the diagnosis includes
 * a `structured_clarification` payload from Agent 2b.
 */

'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DiagnosisData } from '@/features/diagnosis/types';

type StructuredClarificationData = NonNullable<DiagnosisData['structured_clarification']>;
export type Hypothesis = StructuredClarificationData['hypotheses'][number];
export type AnswerChip = Hypothesis['answer_chips'][number];

interface StructuredClarificationProps {
    data: StructuredClarificationData;
    /** Map of hypothesisId → selected chipId (one per hypothesis at most). */
    selectedChipIds: Record<string, string>;
    /** Called when the user taps a chip — toggles selection for that hypothesis. */
    onChipToggle: (hypothesis: Hypothesis, chip: AnswerChip) => void;
    /** Called on the bottom "Submit Answers" button. Fires once with all selections + free-text. */
    onSubmit: () => void;
    onPhotoUpload: (file: File) => void;
    disabled: boolean;
    photoUploading: boolean;
    customText: string;
    onCustomTextChange: (text: string) => void;
}

function rankTag(index: number, total: number): string {
    if (index === 0) return 'Most likely';
    if (index === total - 1 && total > 2) return 'Less likely';
    return 'Possible';
}

export function StructuredClarification({
    data,
    selectedChipIds,
    onChipToggle,
    onSubmit,
    onPhotoUpload,
    disabled,
    photoUploading,
    customText,
    onCustomTextChange,
}: StructuredClarificationProps) {
    const photoInputRef = useRef<HTMLInputElement | null>(null);
    const hypotheses = Array.isArray(data.hypotheses) ? data.hypotheses : [];
    const total = hypotheses.length;

    const selectedCount = Object.values(selectedChipIds).filter(Boolean).length;
    const hasFreeText = customText.trim().length > 0;
    const canSubmit = !disabled && (selectedCount > 0 || hasFreeText);

    return (
        <div className="flex flex-col gap-3">
            {/*
             * Scrollable content area. With 2-3 hypothesis cards + the escape
             * card the StructuredClarification can be 600-700px tall, which
             * overflows the bottom-sheet on most viewports — and the parent
             * uses `sticky bottom-0` rather than a fixed-height + scroll
             * container. We cap this content at 60dvh + overflow-y-auto so
             * the user can scroll through the questions, while keeping the
             * Submit Answers button OUTSIDE this wrapper (rendered below)
             * so it's always reachable at the bottom of the sheet.
             *
             * pr-1 leaves a sliver of room so the scrollbar (when shown)
             * doesn't overlap the cards.
             */}
            <div className="flex flex-col gap-3 max-h-[60dvh] overflow-y-auto pr-1 -mr-1">
            {data.intro ? (
                <p className="text-sm font-medium text-foreground">{data.intro}</p>
            ) : null}

            {total > 1 ? (
                <p className="text-xs text-muted-foreground">
                    Tap one option per question — you can answer them all, then tap Submit.
                </p>
            ) : null}

            {hypotheses.map((hypothesis, idx) => {
                const confidencePct = Math.max(
                    0,
                    Math.min(100, Math.round(Number(hypothesis.confidence) || 0)),
                );
                const tag = rankTag(idx, total);
                const selectedChipForHypothesis = selectedChipIds[hypothesis.id];
                return (
                    <div
                        key={hypothesis.id || `hypothesis-${idx}`}
                        className="flex flex-col gap-3 rounded-xl border border-black/[0.10] bg-white p-4"
                    >
                        <div className="flex flex-row items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <p className="truncate text-sm font-semibold text-foreground">
                                    {hypothesis.label}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {confidencePct}% confidence
                                </p>
                            </div>
                            <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                                {tag}
                            </Badge>
                        </div>

                        {hypothesis.why ? (
                            <p className="text-xs text-muted-foreground">{hypothesis.why}</p>
                        ) : null}

                        {hypothesis.discriminating_question ? (
                            <p className="text-sm font-medium text-foreground">
                                {hypothesis.discriminating_question}
                            </p>
                        ) : null}

                        <div className="flex flex-col gap-2">
                            {(hypothesis.answer_chips || []).map((chip, chipIdx) => {
                                const isSelected = selectedChipForHypothesis === chip.id;
                                return (
                                    <Button
                                        key={chip.id || `chip-${chipIdx}`}
                                        type="button"
                                        variant="outline"
                                        aria-pressed={isSelected}
                                        className={cn(
                                            'flex h-auto min-h-11 w-full justify-start whitespace-normal rounded-xl border-black/[0.10] px-3 py-2 text-left',
                                            isSelected
                                                ? 'bg-primary/10 border-primary/40 hover:bg-primary/15'
                                                : 'bg-white hover:bg-black/[0.03]',
                                        )}
                                        disabled={disabled}
                                        onClick={() => onChipToggle(hypothesis, chip)}
                                    >
                                        <span
                                            className={cn(
                                                'text-sm font-normal',
                                                isSelected
                                                    ? 'text-foreground font-medium'
                                                    : 'text-foreground',
                                            )}
                                        >
                                            {chip.text}
                                        </span>
                                    </Button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            <div className="flex flex-col gap-2 rounded-xl border border-black/[0.10] bg-white p-4">
                <p className="text-sm font-medium text-foreground">
                    {data.escape?.prompt || 'Add a note (optional):'}
                </p>
                <Textarea
                    value={customText}
                    onChange={(e) => onCustomTextChange(e.target.value)}
                    placeholder="Type any extra detail here…"
                    className="min-h-[80px] w-full rounded-xl border border-black/[0.10] bg-white"
                    disabled={disabled}
                />

                <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onPhotoUpload(file);
                        e.target.value = '';
                    }}
                />
                <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full rounded-xl border-black/[0.10] bg-white hover:bg-black/[0.03]"
                    disabled={disabled || photoUploading}
                    onClick={() => photoInputRef.current?.click()}
                >
                    <span className="text-sm font-normal text-foreground">
                        {photoUploading ? 'Uploading photo…' : 'Or add another photo'}
                    </span>
                </Button>
            </div>
            </div>{/* /scrollable content */}

            {/*
             * Submit button is OUTSIDE the scrollable wrapper — always
             * reachable at the bottom of the bottom-sheet regardless of how
             * many hypothesis cards the model produced. `shrink-0` keeps it
             * at full height even when the sheet is tight on space.
             */}
            <Button
                type="button"
                className="h-11 w-full rounded-xl shrink-0"
                disabled={!canSubmit}
                onClick={onSubmit}
            >
                {selectedCount > 0 || hasFreeText
                    ? `Submit ${selectedCount > 0 ? `${selectedCount} answer${selectedCount === 1 ? '' : 's'}` : 'note'}`
                    : 'Submit Answers'}
            </Button>
        </div>
    );
}
