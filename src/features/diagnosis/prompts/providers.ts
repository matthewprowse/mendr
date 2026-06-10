import type { PromptProvider } from './types';

export function buildProvidersPrompt(providers?: PromptProvider[]): string {
    if (!providers || providers.length === 0) {
        return `RECOMMENDED PROVIDERS:
No service providers have been recommended yet. Once a trade is identified, I will search for local experts automatically.`;
    }

    const providerLines = providers
        .map((p) => {
            const line = `- ${p.name} (Rating: ${p.rating}, Reviews: ${p.ratingCount}, Specialities: ${p.specialisations?.join(', ') ?? 'N/A'})`;
            const pick = p.isFavourite ? " [MENDR'S PICK]" : '';
            const reason = p.favouriteReason ? `, Reason: ${p.favouriteReason}` : '';
            const dist = p.distanceText ? `, Distance: ${p.distanceText}` : '';
            const area = p.areaHint ? `, Area: ${p.areaHint}` : '';
            return line + pick + reason + dist + area;
        })
        .join('\n');

    return `RECOMMENDED PROVIDERS:
The following highly-rated service providers are already displayed as cards in the UI directly below this report. The user can see their names, ratings, phone numbers, and directions without you repeating them.
${providerLines}

PROVIDER DISPLAY RULES (CRITICAL):
- NEVER name any provider, company, or business in the 'message' field. Providers are shown as cards in the UI — naming them in text is redundant and looks broken.
- Do NOT say "you can find [Company X] near you" or similar. Do not reference provider names, ratings, or review counts in any text field.
- NEVER mention any provider, company, or business name that does not appear in the list above. Do not invent or suggest names.
- When the user asks "who can help" or "are there contractors near me": acknowledge that local professionals are shown in the cards below, without naming them.

If the user asks about "how to contact them", tell them the provider cards show phone numbers, websites, and directions.
If the user asks "why is X not your pick?", "why did you pick Y?", or similar: ANSWER DIRECTLY using the [MENDR'S PICK] Reason above. Explain why that one was chosen (e.g. higher rating, more reviews) and briefly why the other wasn't. Do NOT give a generic deflection.
If the user explicitly asks for "new", "different", or "more" providers (e.g. because none answered, they want alternatives), set "refetch_providers": true in your JSON. The app will automatically load a new batch. Your message should be warm and direct, e.g. "I've loaded some more options for you — check the cards below."`;
}
