import type { PromptProvider } from './types';

export function buildProvidersPrompt(providers?: PromptProvider[]): string {
    if (!providers || providers.length === 0) {
        return `RECOMMENDED PROVIDERS:
No service providers have been recommended yet. Once a trade is identified, I will search for local experts automatically.`;
    }

    const providerLines = providers
        .map((p) => {
            const line = `- ${p.name} (Rating: ${p.rating}, Reviews: ${p.ratingCount}, Specialities: ${p.specialisations?.join(', ') ?? 'N/A'})`;
            const pick = p.isFavourite ? " [SCANDIO'S PICK]" : '';
            const reason = p.favouriteReason ? `, Reason: ${p.favouriteReason}` : '';
            const dist = p.distanceText ? `, Distance: ${p.distanceText}` : '';
            const area = p.areaHint ? `, Area: ${p.areaHint}` : '';
            return line + pick + reason + dist + area;
        })
        .join('\n');

    return `RECOMMENDED PROVIDERS:
I have already found and displayed the following highly-rated service providers in the UI for the user:
${providerLines}

WHEN THE USER ASKS FOR COMPANIES, CONTRACTORS, BUSINESSES NEAR THEM, OR "WHO CAN HELP" (CRITICAL):
- Answer in the 'message' field: name at least one and ideally two providers EXACTLY as listed above (including [SCANDIO'S PICK] when relevant). Include Distance or Area text when provided above. Do NOT tell them only to tap a button or "find contractors" without naming real businesses from this list.
- Keep provider names spelled exactly as above.
- NEVER mention any provider, company, or business name that does not appear in the list above. Do not invent, recall, or suggest any name not explicitly listed here.

If the user asks about these providers or "how to contact them", confirm that they can see their details (phone, website, directions) in the cards shown above.
If the user asks "why is X not your pick?", "why did you pick Y?", "why isn't [Provider] your pick?", or similar: ANSWER DIRECTLY using the [SCANDIO'S PICK] provider's Reason above. Explain why that one was chosen (e.g. higher rating, currently open, more reviews) and briefly why the other wasn't. Do NOT give a generic deflection — the user deserves a real answer.
If the user explicitly asks for "new", "different", or "more" providers (e.g. because none answered, they want alternatives), set "refetch_providers": true in your JSON. The app will automatically load a new batch of alternatives. Your message should be warm and direct, e.g. "Here are some more plumbers to try." or "I've found additional options for you."`;
}
