import { buildBasePrompt, IDENTITY_AND_META_PROMPT_BLOCK } from './base';
import { buildDiagnosisRejectedPrompt, buildFollowUpPrompt } from './followup';
import { OUTPUT_FORMAT_PROMPT_BLOCK, RESPONSE_BEHAVIOUR_PROMPT_BLOCK } from './output-format';
import { buildProvidersPrompt } from './providers';
import type { PromptContext } from './types';
import { buildValidationPrompt } from './validation';

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
