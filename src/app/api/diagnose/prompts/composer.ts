import { buildBasePrompt, IDENTITY_AND_META_PROMPT_BLOCK } from './base';
import { buildDiagnosisRejectedPrompt, buildFollowUpPrompt } from './followup';
import { OUTPUT_FORMAT_PROMPT_BLOCK, RESPONSE_BEHAVIOUR_PROMPT_BLOCK } from './output-format';
import { buildProvidersPrompt } from './providers';
import type { PromptContext } from './types';
import { buildValidationPrompt } from './validation';

/**
 * Full system instruction for the chat/single-agent path and as a base for
 * Agent 2b (prose). Includes the tagged output format rules.
 */
export function buildSystemInstruction(context: PromptContext): string {
    const sections: string[] = [
        buildBasePrompt(context),
        buildValidationPrompt(context.serviceListText),
        IDENTITY_AND_META_PROMPT_BLOCK,
    ];

    if (context.feedback === 'down') {
        sections.push(
            'IMPORTANT: The user has indicated that the previous diagnosis was INCORRECT. Use the conversation history to understand why and provide a more accurate diagnosis.'
        );
    }

    sections.push(
        buildProvidersPrompt(context.providers),
        buildFollowUpPrompt(context.previousDiagnosis),
        buildDiagnosisRejectedPrompt(Boolean(context.diagnosisRejected)),
        RESPONSE_BEHAVIOUR_PROMPT_BLOCK,
        OUTPUT_FORMAT_PROMPT_BLOCK
    );

    return sections.filter((s) => s && s.trim()).join('\n\n');
}

/**
 * Stripped system instruction for Agent 2b (prose generation).
 *
 * Agent 2b uses Gemini structured JSON output (responseSchema) so it never
 * outputs <thought>/<json> tags. Sending OUTPUT_FORMAT_PROMPT_BLOCK — which
 * instructs the model to open with <thought> and close with <json> — directly
 * contradicts the structured-output constraint and wastes ~600 tokens per call.
 *
 * This variant keeps the diagnostic rules, validation, identity, follow-up, and
 * provider context, but strips the tagged-output format instructions.
 */
export function buildProseBaseInstruction(context: PromptContext): string {
    const sections: string[] = [
        buildBasePrompt(context),
        buildValidationPrompt(context.serviceListText),
        IDENTITY_AND_META_PROMPT_BLOCK,
    ];

    if (context.feedback === 'down') {
        sections.push(
            'IMPORTANT: The user has indicated that the previous diagnosis was INCORRECT. Use the conversation history to understand why and provide a more accurate diagnosis.'
        );
    }

    sections.push(
        buildProvidersPrompt(context.providers),
        buildFollowUpPrompt(context.previousDiagnosis),
        buildDiagnosisRejectedPrompt(Boolean(context.diagnosisRejected)),
        // RESPONSE_BEHAVIOUR_PROMPT_BLOCK and OUTPUT_FORMAT_PROMPT_BLOCK intentionally
        // omitted — Agent 2b uses responseSchema structured output and never writes tags.
    );

    return sections.filter((s) => s && s.trim()).join('\n\n');
}
