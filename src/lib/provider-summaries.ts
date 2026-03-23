/**
 * Server-only: generate provider copy (customer review summary, about business, past work)
 * using Gemini. Used when stored values are missing on the Pro page.
 */
import { getGeminiModel } from '@/lib/ai-client';

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

const SYSTEM = `You are writing short, factual copy for a South African home-services business profile.
Use British English. Be concise. No bullet points or markdown. Output only the requested text.`;

export async function generateProviderSummaries(
    input: ProviderSummariesInput
): Promise<ProviderSummariesResult | null> {
    const { name, primaryTrade, services, address, reviewBodies, rating, reviewCount, websiteText } = input;
    const reviewText = reviewBodies.slice(0, 30).join('\n\n');
    const servicesList = (services && services.length) ? services.join(', ') : primaryTrade || 'general trades';
    const websiteSnippet = websiteText ? websiteText.slice(0, 6000) : '';

    const prompt = `${SYSTEM}

Business: ${name}
Primary trade: ${primaryTrade || 'Not specified'}
Services: ${servicesList}
Address: ${address || 'Not specified'}
Aggregate rating: ${rating ?? 'N/A'} (${reviewCount ?? 0} reviews)

Website content (use this for factual details like how long the business has been operating, what they do, and where they work. Prefer this over reviews for facts. Do NOT invent specific dates or years if they are not clearly stated here):
---
${websiteSnippet || 'No website content available.'}
---

Customer review excerpts (use only to infer sentiment and types of work; do not quote):
---
${reviewText || 'No reviews yet.'}
---

Generate three short texts. Reply with exactly three paragraphs, each starting with the label and a colon on its own line:

CUSTOMER_REVIEW_SUMMARY:
(3–5 sentences: proportional sentiment summary of what customers say — tone, common praise, common complaints. Do not name the business or repeat the rating.)

ABOUT_BUSINESS:
(2–3 sentences: about the business itself — what work they do, who they serve, and any implied history or focus. Base this primarily on the website content when available; use reviews only as a weak secondary signal. Do not repeat review sentiment.)

PAST_WORK:
(2–4 sentences: types of work or projects that appear in reviews and on the website — e.g. plumbing fixes, electrical, renovations, repairs. Focus on concrete examples mentioned. Do not invent projects that are not implied by the inputs.)`;

    try {
        const model = getGeminiModel();
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        const customerMatch = text.match(/CUSTOMER_REVIEW_SUMMARY:\s*([\s\S]*?)(?=ABOUT_BUSINESS:|$)/i);
        const aboutMatch = text.match(/ABOUT_BUSINESS:\s*([\s\S]*?)(?=PAST_WORK:|$)/i);
        const pastMatch = text.match(/PAST_WORK:\s*([\s\S]*?)$/im);

        const customerReviewSummary = customerMatch?.[1]?.trim().replace(/\n+/g, ' ') ?? '';
        const aboutBusiness = aboutMatch?.[1]?.trim().replace(/\n+/g, ' ') ?? '';
        const pastWork = pastMatch?.[1]?.trim().replace(/\n+/g, ' ') ?? '';

        if (!customerReviewSummary && !aboutBusiness && !pastWork) return null;

        return {
            customerReviewSummary: customerReviewSummary || 'No summary available yet.',
            aboutBusiness: aboutBusiness || `${name} offers ${servicesList}. Contact for more information.`,
            pastWork: pastWork || 'No detailed past work information from reviews yet.',
        };
    } catch (e) {
        if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.warn('generateProviderSummaries error:', (e as Error)?.message);
        }
        return null;
    }
}
