"use client";

/**
 * useClarification — clarification Q&A derivation + submit handlers for the
 * /diagnosis client.
 *
 * Extracted verbatim from client.tsx as a pure mechanical refactor. This
 * helper contains NO React hooks — the derivations are plain per-render
 * computations and the handlers are plain functions recreated each render,
 * exactly as they were inline in DiagnosisPageClient — so calling it has no
 * effect on hook order. All state lives in the composition root.
 */

import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { patchConversation } from "@/lib/diagnosis/diagnoses-api";
import type { ClarificationQuestion, DiagnosisData } from "@/features/diagnosis/types";
import type { Provider } from "@/lib/providers/types";
import type { ClarificationAnswerMap } from "./clarification-drawer";
import {
    capitalisedNumberWord,
    providerHydrateSessionKey,
    toSentence,
} from "./diagnosis-helpers";
import type { RunInitialDiagnosis } from "./use-diagnosis-stream";

/** Structural ref type — matches the object returned by `useRef`. */
type MutableRef<T> = { current: T };

type UseClarificationParams = {
    conversationId?: string;
    currentDiagnosis: DiagnosisData | null;
    tradeLabel: string;
    selectedTradeHint: string;
    requiresClarification: boolean;
    isServiceBlocked: boolean;
    isDiagnosing: boolean;
    showSkeleton: boolean;
    clarificationSubmitLoading: boolean;
    clarificationAnswers: ClarificationAnswerMap;
    imageSrc: string | null;
    customerInfoItems: string[];
    uploadedImageSources: string[];
    // Refs (owned by the composition root)
    isMockClarifyRef: MutableRef<boolean>;
    didRunDiagnosisRef: MutableRef<string | null>;
    providersForDiagnoseRef: MutableRef<Provider[]>;
    // State setters (owned by the composition root)
    setShowAnswerQuestionsScreen: Dispatch<SetStateAction<boolean>>;
    setClarificationAnswers: Dispatch<SetStateAction<ClarificationAnswerMap>>;
    setClarificationSubmitLoading: Dispatch<SetStateAction<boolean>>;
    setClarificationCustomText: Dispatch<SetStateAction<string>>;
    setCustomerInfoItems: Dispatch<SetStateAction<string[]>>;
    setInfoText: Dispatch<SetStateAction<string>>;
    setShowAddInfoScreen: Dispatch<SetStateAction<boolean>>;
    setDiagnosisTitle: Dispatch<SetStateAction<string>>;
    setDiagnosisFailureMessage: Dispatch<SetStateAction<string | null>>;
    runInitialDiagnosis: RunInitialDiagnosis;
};

export function useClarification({
    conversationId,
    currentDiagnosis,
    tradeLabel,
    selectedTradeHint,
    requiresClarification,
    isServiceBlocked,
    isDiagnosing,
    showSkeleton,
    clarificationSubmitLoading,
    clarificationAnswers,
    imageSrc,
    customerInfoItems,
    uploadedImageSources,
    isMockClarifyRef,
    didRunDiagnosisRef,
    providersForDiagnoseRef,
    setShowAnswerQuestionsScreen,
    setClarificationAnswers,
    setClarificationSubmitLoading,
    setClarificationCustomText,
    setCustomerInfoItems,
    setInfoText,
    setShowAddInfoScreen,
    setDiagnosisTitle,
    setDiagnosisFailureMessage,
    runInitialDiagnosis,
}: UseClarificationParams) {
    const clarificationQuestions = Array.isArray(currentDiagnosis?.clarification_questions)
        ? currentDiagnosis.clarification_questions
              .map((q) => (typeof q === "string" ? q.trim() : ""))
              .map((q) => toSentence(q))
              .filter((q) => q.length > 0)
        : [];
    const hasClarificationQuestions = clarificationQuestions.length > 0;

    const fallbackClarificationQuestions = [
        "It is not turning on.",
        "It is turning on, but not working correctly.",
        "There is visible damage, leakage, or unusual noise.",
    ];
    const clarificationOptions = (
        hasClarificationQuestions ? clarificationQuestions : fallbackClarificationQuestions
    ).slice(0, 3);
    const tradeForClarificationPrompt = (tradeLabel || selectedTradeHint || "").trim();
    const clarificationTradeIsPlaceholder =
        !tradeForClarificationPrompt || /^n\/a$/i.test(tradeForClarificationPrompt);
    const clarificationPrompt = clarificationTradeIsPlaceholder
        ? "Which option best describes the issue?"
        : `Which option best describes the ${tradeForClarificationPrompt.toLowerCase()} issue?`;

    // Build the question list for the Need More Information overlay. Two
    // sources, preference order:
    //   1) `clarification_question_set` from the diagnosis row (new shape).
    //   2) Legacy `clarification_questions: string[]` — wrap as ONE question
    //      using the derived prompt, so old diagnoses still render.
    const newClarificationSet: ClarificationQuestion[] = Array.isArray(
        currentDiagnosis?.clarification_question_set,
    )
        ? currentDiagnosis!.clarification_question_set!
        : [];
    const clarificationQuestionList: ClarificationQuestion[] =
        newClarificationSet.length > 0
            ? newClarificationSet
            : clarificationOptions.length > 0
              ? [
                    {
                        id: "legacy-single",
                        question: clarificationPrompt,
                        options: clarificationOptions,
                    },
                ]
              : [];
    const clarificationQuestionCount = clarificationQuestionList.length;
    const clarificationAllAnswered =
        clarificationQuestionCount > 0 &&
        clarificationQuestionList.every((_, idx) => {
            const entry = clarificationAnswers[idx];
            if (!entry) return false;
            const chip = entry.pickedChip;
            const extra = (entry.extra ?? "").trim();
            return Boolean(chip) || extra.length > 0;
        });

    const showClarificationFooter =
        requiresClarification &&
        !isServiceBlocked &&
        !(clarificationSubmitLoading && isDiagnosing);

    const answerQuestionsCtaCopy =
        clarificationQuestionCount === 1
            ? "Answer One Question"
            : `Answer ${capitalisedNumberWord(clarificationQuestionCount)} Questions`;

    const handleClarificationChoice = async (choice: string) => {
        const trimmed = choice.trim();
        if (!trimmed || !imageSrc || isDiagnosing || showSkeleton) return;
        setClarificationSubmitLoading(true);
        const nextItems = [...customerInfoItems, trimmed];
        const joinedInfo = nextItems.join("\n\n").trim();
        setCustomerInfoItems(nextItems);
        setInfoText("");
        setShowAddInfoScreen(false);
        didRunDiagnosisRef.current = null;
        setDiagnosisTitle("Diagnosing…");
        if (conversationId) {
            try {
                sessionStorage.removeItem(providerHydrateSessionKey(conversationId));
            } catch {
                /* ignore */
            }
            providersForDiagnoseRef.current = [];
            const noteSave = await patchConversation(conversationId, {
                initial_image_description: joinedInfo || null,
            });
            if (!noteSave.ok) {
                setDiagnosisFailureMessage(
                    noteSave.error || "We could not save your notes. Please try again.",
                );
                return;
            }
        }
        try {
            await runInitialDiagnosis(
                imageSrc,
                joinedInfo,
                selectedTradeHint.trim() || null,
                uploadedImageSources,
            );
        } finally {
            setClarificationSubmitLoading(false);
            setClarificationCustomText("");
        }
    };

    /**
     * Batched clarification submit. Called by the Need More Information
     * overlay when the user has filled every question and tapped Refresh
     * Findings. Reads the per-question answers from `clarificationAnswers`
     * state (lifted above the list component), joins them into a single
     * multi-paragraph Q&A note, and pipes that through the same re-diagnose
     * path the single-choice handler uses.
     */
    const handleClarificationBatchSubmit = async (questions: ClarificationQuestion[]) => {
        // Real diagnoses need a valid source image. Mock mode runs with an
        // empty placeholder src on purpose, so we skip that guard for it.
        if (!isMockClarifyRef.current && !imageSrc) return;
        if (isDiagnosing || showSkeleton) return;
        const pairs = questions
            .map((q, idx) => {
                const entry = clarificationAnswers[idx];
                if (!entry) return null;
                const chip = entry.pickedChip?.trim() ?? "";
                const extra = (entry.extra ?? "").trim();
                // Combine chip + extra into one answer block. If only one of
                // them is present, send just that. If both, list the chip
                // first and the extra as supplemental context — keeps the
                // structured signal intact for the model.
                let answer = "";
                if (chip && extra) answer = `${chip}\n(Additional: ${extra})`;
                else if (chip) answer = chip;
                else if (extra) answer = extra;
                if (!answer) return null;
                return `Q: ${q.question}\nA: ${answer}`;
            })
            .filter((s): s is string => Boolean(s));
        if (pairs.length === 0) return;
        const joinedAnswer = pairs.join("\n\n");
        // Close the overlay and clear answers so a follow-up clarification
        // (the model can ask for clarification again after this round) lands
        // on a fresh slate.
        setShowAnswerQuestionsScreen(false);
        setClarificationAnswers({});
        if (isMockClarifyRef.current) {
            toast.success(`Mock submitted ${pairs.length} answers.`);
            return;
        }
        await handleClarificationChoice(joinedAnswer);
    };

    return {
        clarificationQuestions,
        hasClarificationQuestions,
        clarificationQuestionList,
        clarificationQuestionCount,
        clarificationAllAnswered,
        showClarificationFooter,
        answerQuestionsCtaCopy,
        handleClarificationBatchSubmit,
        handleClarificationChoice,
    };
}
