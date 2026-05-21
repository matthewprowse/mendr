/**
 * User-turn prompt builders.
 *
 * These produce the text that forms the final user message(s) in the
 * conversation sent to the model. Extracted here so they are versioned
 * alongside the rest of the prompt system and easy to find/update.
 */

/** Quick <thought>-only prompt used for the image_thought_only analysis phase. */
export function buildQuickThoughtPrompt(imageCount: number): string {
    return (
        `Analyse ${imageCount > 1 ? 'these images' : 'this image'} and return only a short ` +
        `<thought> block (1–2 sentences). First extract the unique visible detail from each image, then combine those details into one unified likely issue pattern. ` +
        `Do not include JSON or extra sections.`
    );
}

/**
 * Quick thought prompt used in the parallel streaming path (Agent 1 thought
 * stream that fires while Agent 2a classification is running).
 */
export function buildStreamingQuickThoughtPrompt(): string {
    return 'Analyse all provided images. Return ONLY a short <thought> block (2 sentences): sentence 1 should combine unique visible clues across images, sentence 2 should state the likely fault pattern from that combined evidence. No JSON.';
}

/** First-message prompt for text-only submissions (no image attached). */
export function buildTextOnlyFirstMessagePrompt(params: {
    instructionPrefix: string;
    textQuery: string;
    hasUserContext: boolean;
    userSelectedTrade?: { diagnosis: string; trade: string } | null;
}): string {
    if (params.hasUserContext && params.userSelectedTrade) {
        return (
            params.instructionPrefix +
            `The user selected "${params.userSelectedTrade.diagnosis}" (${params.userSelectedTrade.trade}) as their preferred service, but this is only a hint. If their description clearly indicates a different trade, set diagnosis, trade, and trade_detail to the more accurate trade.\n\n` +
            `The user described their issue:\n\n"${params.textQuery.trim()}"\n\n` +
            `Analyse this description considering their stated interest. Output <thought> (2–3 short sentences) then <json>.`
        );
    }
    return (
        params.instructionPrefix +
        `The user has described their home maintenance issue:\n\n"${params.textQuery.trim()}"\n\n` +
        `Analyse this description and provide a diagnosis. Output <thought> (2–3 short sentences) then <json>.`
    );
}

/** First-message prompt for image submissions. */
export function buildImageFirstMessagePrompt(params: {
    instructionPrefix: string;
    userWordsPriority: string;
    imageCount: number;
    hasUserContext: boolean;
    userSelectedTrade?: { diagnosis: string; trade: string } | null;
}): string {
    if (params.hasUserContext && params.userSelectedTrade) {
        return (
            params.instructionPrefix +
            params.userWordsPriority +
            `The user selected "${params.userSelectedTrade.diagnosis}" (${params.userSelectedTrade.trade}) as a preferred service, but it is not authoritative. ` +
            `If their words or the image clearly indicate a different trade, set diagnosis, trade, trade_detail, and action_required to the more accurate trade. Analyse quickly.\n\n` +
            `Output <thought> FIRST (2–3 short sentences), then </thought>, then <json>. Never skip the thought block.`
        );
    }
    return (
        params.instructionPrefix +
        params.userWordsPriority +
        `Analyse ${params.imageCount > 1 ? 'these images' : 'this image'}.\n\n` +
        `For multi-image input, first use each image to capture unique evidence, then merge it into one combined diagnosis thought.\n\n` +
        `Output <thought> FIRST (2–3 short sentences about the likely problem only in plain language). Never skip the thought block; the user sees it in real time.`
    );
}

/** Follow-up prompt when the user uploads new images in an ongoing conversation. */
export function buildImageFollowUpPrompt(params: {
    instructionPrefix: string;
    userTextQuery: string;
}): string {
    return (
        params.instructionPrefix +
        `The user has uploaded new images for you to analyse.` +
        (params.userTextQuery ? ` Their message: "${params.userTextQuery}"` : '') +
        ` Provide a FULL diagnosis: identify the equipment/issue, set diagnosis, action_required, and trade. ` +
        `Do NOT ask for clarification when the equipment is recognisable (e.g. gate motor, geyser, DB board) — diagnose it and recommend providers. ` +
        `Output <thought> FIRST (2–3 sentences), then </thought>, then <json>.`
    );
}

/** Provider hydration pass — re-reads image to weave provider names into the message. */
export function buildProviderHydrationImagePrompt(params: {
    instructionPrefix: string;
    userWordsPriority: string;
    imageCount: number;
}): string {
    return (
        params.instructionPrefix +
        params.userWordsPriority +
        `PROVIDER HYDRATION PASS: Re-read ${params.imageCount > 1 ? 'these images' : 'this image'} and output a full Menda response. ` +
        `Follow PROVIDER HYDRATION TURN in your instructions; keep established diagnosis fields stable unless clearly wrong.\n\n` +
        `Output <thought> FIRST (2–3 short sentences), then </thought>, then <json>. Never skip the thought block.`
    );
}
