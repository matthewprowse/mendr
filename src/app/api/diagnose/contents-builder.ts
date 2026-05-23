/**
 * Builds the `Content[]` array passed to Gemini for the /api/diagnose route.
 *
 * Extracted in Phase 2 from `route.ts`. Handles four call shapes:
 *   - Text-only first message
 *   - Text-only follow-up (with optional new images)
 *   - Image first message
 *   - Image follow-up
 *
 * Plus the optional `initial_image_description` prefix and the multi-turn
 * history flattening for the image-branch path.
 *
 * Behaviour is preserved verbatim from the original inline implementation.
 */

import {
    buildImageFirstMessagePrompt,
    buildImageFollowUpPrompt,
    buildProviderHydrationImagePrompt,
    buildTextOnlyFirstMessagePrompt,
} from '@/features/diagnosis/prompts/user-turn';
import { imageStringToInlineData } from './image-loader';

export interface ContentPart {
    text?: string;
    inlineData?: { data: string; mimeType: string };
}
export interface ContentMessage {
    role: 'user' | 'model';
    parts: ContentPart[];
}
export interface HistoryMessage {
    role: 'user' | 'assistant';
    content?: string;
    attachment_descriptions?: string[];
    attachments?: unknown[];
}

export interface BuildContentsParams {
    image: string | null;
    attachmentImages: string[];
    textQuery: unknown;
    history: unknown;
    initialImageDescription: unknown;
    instructionPrefix: string;
    isTextOnly: boolean;
    isProviderHydration: boolean;
    hasUserContext: boolean;
    userSelectedTrade: unknown;
}

export interface BuildContentsResult {
    contents: ContentMessage[];
    imagesInRequest: number;
    imagesAfterTier: number;
}

function buildTextForMessage(msg: HistoryMessage): string {
    let content = msg.content || '';
    const descs = msg.attachment_descriptions as string[] | undefined;
    if (descs && Array.isArray(descs) && descs.length > 0) {
        content += (content ? '\n\n' : '') + '[Images: ' + descs.join('; ') + ']';
    } else if (
        msg.attachments &&
        Array.isArray(msg.attachments) &&
        msg.attachments.length > 0
    ) {
        content += (content ? '\n\n' : '') + '[User uploaded an image here]';
    }
    return content;
}

export async function buildDiagnoseContents(
    params: BuildContentsParams,
): Promise<BuildContentsResult> {
    const {
        image,
        attachmentImages,
        textQuery,
        history,
        initialImageDescription,
        instructionPrefix,
        isTextOnly,
        isProviderHydration,
        hasUserContext,
        userSelectedTrade,
    } = params;

    const contents: ContentMessage[] = [];
    let imagesInRequest = 0;
    let imagesAfterTier = 0;

    if (
        initialImageDescription &&
        typeof initialImageDescription === 'string' &&
        initialImageDescription.trim()
    ) {
        contents.push({
            role: 'user',
            parts: [
                { text: '[Initial image: ' + initialImageDescription.trim() + ']' },
            ],
        });
    }

    if (isTextOnly) {
        const historyArr = Array.isArray(history) ? (history as HistoryMessage[]) : null;
        if (historyArr && historyArr.length > 0) {
            const followInlineGathered: ContentPart[] = [];
            for (const att of attachmentImages) {
                const inline = await imageStringToInlineData(att);
                if (inline) followInlineGathered.push(inline);
            }
            imagesInRequest = followInlineGathered.length;
            imagesAfterTier = followInlineGathered.length;

            for (const msg of historyArr) {
                const parts: ContentPart[] = [];
                const content = buildTextForMessage(msg);
                if (content) parts.push({ text: content });
                if (parts.length > 0) {
                    contents.push({
                        role: msg.role === 'assistant' ? 'model' : 'user',
                        parts,
                    });
                }
            }
            const finalParts: ContentPart[] = [...followInlineGathered];
            const textPart = ((textQuery as string) || '').trim();
            if (textPart) {
                finalParts.push({ text: instructionPrefix + textPart });
            } else if (finalParts.length > 0) {
                finalParts.push({
                    text:
                        instructionPrefix +
                        'The user uploaded new images for you to analyse. Output <thought> FIRST (2–3 short sentences), then </thought>, then <json>.',
                });
            }
            if (finalParts.length > 0) {
                contents.push({ role: 'user', parts: finalParts });
            }
        } else {
            const textPrompt = buildTextOnlyFirstMessagePrompt({
                instructionPrefix,
                textQuery: (textQuery as string).trim(),
                hasUserContext,
                userSelectedTrade: hasUserContext ? userSelectedTrade : null,
            });
            contents.push({ role: 'user', parts: [{ text: textPrompt }] });
        }
        return { contents, imagesInRequest, imagesAfterTier };
    }

    // Image branch.
    const imageParts: ContentPart[] = [];
    if (image) {
        const inline = await imageStringToInlineData(image);
        if (inline) imageParts.push(inline);
    }
    for (const att of attachmentImages) {
        const inline = await imageStringToInlineData(att);
        if (inline) imageParts.push(inline);
    }

    imagesInRequest = imageParts.length;
    imagesAfterTier = imageParts.length;

    const hasImagesToAnalyse = imageParts.length > 0;
    const userTextQuery = (textQuery as string | undefined)?.trim() || '';
    const userWordsPriority =
        userTextQuery.length > 0
            ? `USER'S OWN WORDS ABOUT THE ISSUE (read first; if these disagree with a visual guess, trust the user on equipment type and job context):\n${JSON.stringify(userTextQuery)}\n\n`
            : '';
    const hasHistory = Array.isArray(history) && (history as unknown[]).length > 0;
    const imagePrompt =
        isProviderHydration && !hasHistory
            ? buildProviderHydrationImagePrompt({
                  instructionPrefix,
                  userWordsPriority,
                  imageCount: imageParts.length,
              })
            : !hasHistory
              ? buildImageFirstMessagePrompt({
                    instructionPrefix,
                    userWordsPriority,
                    imageCount: imageParts.length,
                    hasUserContext,
                    userSelectedTrade: hasUserContext ? userSelectedTrade : null,
                })
              : hasImagesToAnalyse
                ? buildImageFollowUpPrompt({
                      instructionPrefix,
                      userTextQuery,
                  })
                : null;

    contents.push({
        role: 'user',
        parts: [...imageParts, ...(imagePrompt ? [{ text: imagePrompt }] : [])],
    });

    if (Array.isArray(history) && (history as HistoryMessage[]).length > 0) {
        for (const msg of history as HistoryMessage[]) {
            const parts: ContentPart[] = [];
            const content = buildTextForMessage(msg);
            if (content) parts.push({ text: content });
            if (parts.length > 0) {
                contents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts,
                });
            }
        }
    }

    return { contents, imagesInRequest, imagesAfterTier };
}
