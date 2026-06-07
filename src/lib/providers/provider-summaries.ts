/* eslint-disable no-console */
/**
 * Server-only: generate provider copy (customer review summary, about business, past work)
 * using Gemini. Used when stored values are missing on the Pro page.
 */
import { Type } from '@google/genai';
import { getGenAiClient, GEMINI_MODEL_NAME } from '@/lib/ai/ai-client';

export type ProviderSummariesInput = {
    name: string;
    primaryTrade?: string | null;
    services?: string[];
    address?: string | null;
    reviewBodies: string[];
    rating?: number | null;
    reviewCount?: number;
    websiteText?: string;
};

export type ProviderSummariesResult = {
    customerReviewSummary: string;
    aboutBusiness: string;
    pastWork: string;
};

const PROVIDER_SUMMARIES_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        customerReviewSummary: {
            type: Type.STRING,
            description: '3–5 sentences: proportional sentiment summary — tone, common praise, common complaints. Do not name the business or repeat the rating.',
        },
        aboutBusiness: {
            type: Type.STRING,
            description: '2–3 sentences: what work they do, who they serve, implied history or focus. Base on website content primarily; reviews as weak secondary signal. Never mention the business name — use "The team", "They", or "The business" instead.',
        },
        pastWork: {
            type: Type.STRING,
            description: '2–4 sentences: types of work or projects from reviews and website — concrete examples only. Do not invent.',
        },
    },
    required: ['customerReviewSummary', 'aboutBusiness', 'pastWork'],
};

export async function generateProviderSummaries(
    input: ProviderSummariesInput
): Promise<ProviderSummariesResult | null> {
    const { name, primaryTrade, services, address, reviewBodies, rating, reviewCount, websiteText } = input;
    const reviewText = reviewBodies.slice(0, 30).join('\n\n');
    const servicesList = (services && services.length) ? services.join(', ') : primaryTrade || 'general trades';
    const websiteSnippet = websiteText ? websiteText.slice(0, 6000) : '';

    const prompt = `You are writing short, factual copy for a South African home-services business profile. British English. Be concise. No bullet points or markdown.

Business: ${name}
Primary trade: ${primaryTrade || 'Not specified'}
Services: ${servicesList}
Address: ${address || 'Not specified'}
Aggregate rating: ${rating ?? 'N/A'} (${reviewCount ?? 0} reviews)

Website content (prefer for facts — do NOT invent dates or years not clearly stated):
---
${websiteSnippet || 'No website content available.'}
---

Customer review excerpts (use only to infer sentiment and types of work; do not quote):
---
${reviewText || 'No reviews yet.'}
---

Return a JSON object with fields: customerReviewSummary, aboutBusiness, pastWork.`;

    try {
        const ai = getGenAiClient();
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL_NAME,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.3,
                topK: 20,
                topP: 0.75,
                maxOutputTokens: 800,
                responseMimeType: 'application/json',
                responseSchema: PROVIDER_SUMMARIES_SCHEMA,
            },
        });
        const raw = (result.text ?? '').trim();
        const parsed = JSON.parse(raw) as ProviderSummariesResult;
        const customerReviewSummary = parsed.customerReviewSummary?.trim() ?? '';
        const aboutBusiness         = parsed.aboutBusiness?.trim() ?? '';
        const pastWork               = parsed.pastWork?.trim() ?? '';

        if (!customerReviewSummary && !aboutBusiness && !pastWork) return null;

        return {
            customerReviewSummary: customerReviewSummary || 'No summary available yet.',
            aboutBusiness: aboutBusiness || `${name} offers ${servicesList}. Contact for more information.`,
            pastWork: pastWork || 'No detailed past work information from reviews yet.',
        };
    } catch (e) {
        if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.warn('generateProviderSummaries error:', e instanceof Error ? e.message : String(e));
        }
        return null;
    }
}
