import type { PromptProvider } from './types';

export function buildProvidersPrompt(providers?: PromptProvider[]): string {
    if (!providers || providers.length === 0) {
        return `RECOMMENDED PROVIDERS:
No service providers have been recommended yet. Once a trade is identified, I will search for local experts automatically.`;
    }

    const providerLines = providers
        .map((p) => {
            const line = `- ${p.name} (Rating: ${p.rating}, Reviews: ${p.ratingCount}, Specialities: ${p.services?.map((s) => s.full).join(', ')})`;
            const pick = p.isFavourite ? " [SCANDIO'S PICK]" : '';
            const reason = p.favouriteReason ? `, Reason: ${p.favouriteReason}` : '';
            return line + pick + reason;
        })
        .join('\n');

    return `RECOMMENDED PROVIDERS:
I have already found and displayed the following highly-rated service providers in the UI for the user:
${providerLines}

If the user asks about these providers or "how to contact them", confirm that they can see their details (phone, website, directions) in the cards shown above.
If the user asks "why is X not your pick?", "why did you pick Y?", "why isn't [Provider] your pick?", or similar: ANSWER DIRECTLY using the [SCANDIO'S PICK] provider's Reason above. Explain why that one was chosen (e.g. higher rating, currently open, more reviews) and briefly why the other wasn't. Do NOT give a generic deflection — the user deserves a real answer.
If the user explicitly asks for "new", "different", or "more" providers (e.g. "none of them picked up", "give me different ones", "I need new options"), set "refetch_providers": true in your JSON. The app will automatically load a new batch of alternatives. Your message should be warm and direct, e.g. "Here are some more plumbers to try." or "I've found additional options for you."`;
}
