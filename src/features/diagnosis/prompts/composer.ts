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
 * Deliberately excludes:
 * - buildValidationPrompt() — Agent 2a has already classified; trade is locked.
 * - IDENTITY_AND_META_PROMPT_BLOCK — identity handling is irrelevant to prose generation.
 * - RESPONSE_BEHAVIOUR_PROMPT_BLOCK / OUTPUT_FORMAT_PROMPT_BLOCK — Agent 2b uses
 *   responseSchema structured output and never writes <thought>/<json> tags.
 *
 * Keeping only the diagnostic rules, provider context, and follow-up handling
 * saves ~400 input tokens per prose call.
 */
export function buildProseBaseInstruction(context: PromptContext): string {
    const sections: string[] = [
        buildBasePrompt(context),
        // Validation and identity intentionally omitted — Agent 2a has already classified.
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
    );

    return sections.filter((s) => s && s.trim()).join('\n\n');
}
