/**
 * v2.5 prompt-builder re-exports.
 *
 * The 2.5-tuned production prompts live in the agent files
 * (`agent-classify.ts`, `agent-prose.ts`, `agent-reasoning.ts`) and in
 * `prompts/critique-system.ts`. This file simply re-exports them with a
 * `_v25` suffix so the prompt-variant resolver can pull them through a
 * single import.
 *
 * Do NOT inline prompt content here. Keep this file purely a re-export
 * surface — that way changes to the v2.5 prompts continue to live in the
 * existing agent files where they've always been edited.
 *
 * The matching `v3_5-builders.ts` arrives in Session 2 and exports the
 * sibling functions. Until then the resolver delegates v3.5 → v2.5.
 */

export { buildClassificationSystemPrompt as buildClassificationSystemPrompt_v25 } from '@/features/diagnosis/agent-classify';
export { buildProseSystemPrompt as buildProseSystemPrompt_v25 } from '@/features/diagnosis/agent-prose';
export { buildReasoningSystemPrompt as buildReasoningSystemPrompt_v25 } from '@/features/diagnosis/agent-reasoning';
export { buildCritiqueSystemPrompt as buildCritiqueSystemPrompt_v25 } from '@/features/diagnosis/prompts/critique-system';
