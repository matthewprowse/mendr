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
        `Analyse ${imageCount > 1 ? `all ${imageCount} images` : 'this image'} and return only a short ` +
        `<thought> block (1–2 sentences). ` +
        `For each image: note specific parts visible, their position, any deformation, and — critically — any component that is MISSING, detached, asymmetric, or absent compared to the other side. ` +
        `Then combine that per-image evidence into one unified likely fault pattern. ` +
        `Do not include JSON or extra sections.`
    );
}

/**
 * Quick thought prompt used in the parallel streaming path (Agent 1 thought
 * stream that fires while Agent 2a classification is running).
 */
export function buildStreamingQuickThoughtPrompt(): string {
    return (
        'Analyse every image provided. For each: name the specific components visible, their position and condition. ' +
        'Critically — compare left vs right, near vs far, upper vs lower. A component present on one side but ABSENT or detached on the other is the PRIMARY fault signal — name it explicitly (e.g. "left torsion spring is missing", "right cable is detached"). Missing components take priority over cosmetic or secondary cues. ' +
        // Single-side fallback (v7.4 — 2026-05-23 gate-spring incident).
        // Users routinely photograph only the broken side, so the symmetry
        // heuristic above can never fire. Anchor the model on negative-space
        // cues instead.
        'Single-side fallback: if no comparison side is in frame, look for negative-space cues — empty fastener points (slots, eyes, hooks, threaded holes with no fastener), paint shadows or wear patterns indicating where a part used to sit, mounting brackets with no part attached, springs/cables/arms with one end dangling free. When such cues are present, name the absent part explicitly (e.g. "lift spring absent from bracket", "cable hook empty"). Symmetry is not required to claim a missing part. ' +
        'Return ONLY a <thought> block (2 sentences): sentence 1 states the specific missing/damaged component and which image(s) show it; sentence 2 gives the likely fault pattern. No JSON.'
    );
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
        `Analyse ${params.imageCount > 1 ? `all ${params.imageCount} images` : 'this image'}.\n\n` +
        (params.imageCount > 1
            ? `For each image: name the specific components visible, their position, and their condition. Then look for asymmetry — compare left vs right, near side vs far side, upper vs lower. A component that is PRESENT on one side but ABSENT or detached on the other is the primary fault signal (e.g. a torsion spring bracket missing on one side, a cable hanging loose, a roller off its track). Missing components outweigh secondary cosmetic cues — name them explicitly.\n\nSingle-side fallback: if no comparison side is in frame, look for negative-space cues — empty fastener points (slots, eyes, hooks, threaded holes with no fastener), paint shadows or wear patterns where a part used to sit, mounting brackets with no part attached, or springs/cables/arms with one end dangling free. When such cues are present, name the absent part explicitly (e.g. "lift spring absent from bracket"). Symmetry is NOT required to claim a missing part.\n\nMerge the per-image evidence into one combined thought.\n\n`
            : '') +
        `Output <thought> FIRST (2–3 short sentences in plain language naming the most likely fault and the specific evidence you saw). Never skip the thought block; the user sees it in real time.`
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
        `PROVIDER HYDRATION PASS: Re-read ${params.imageCount > 1 ? 'these images' : 'this image'} and output a full Mendr response. ` +
        `Follow PROVIDER HYDRATION TURN in your instructions; keep established diagnosis fields stable unless clearly wrong.\n\n` +
        `Output <thought> FIRST (2–3 short sentences), then </thought>, then <json>. Never skip the thought block.`
    );
}
