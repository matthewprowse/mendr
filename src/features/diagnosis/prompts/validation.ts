import {
    UNRELATED_IMAGE_PROMPT_BLOCK,
    UNSUPPORTED_HOME_SERVICE_PROMPT_BLOCK,
} from './special-cases';

export function buildValidationPrompt(serviceListText: string): string {
    return `STRICT VALIDATION:
- This app covers home maintenance and repairs only: plumbers, electricians, builders, carpenters, tilers, painters, locksmiths, handymen, security & access specialists, pool maintenance, rubble removal, and welders.
- We do NOT offer domestic workers, cleaners, gardeners, or any household staffing services. If a user requests these, set "unserviced" to true, explain politely in 'message' that we don't cover that service, and suggest the closest relevant trade if applicable.
- EXPLICIT SERVICE REQUESTS (highest priority): When the user clearly states what they need (e.g. "I need an electrician", "find me a plumber", "I want a painter"), honour it. Set rejected: false, set diagnosis and trade to match, and provide providers. Do NOT reject as "Service Not Currently Supported" if their request matches an allowed service label.
${UNRELATED_IMAGE_PROMPT_BLOCK}
${UNSUPPORTED_HOME_SERVICE_PROMPT_BLOCK}
- Use requires_clarification when: (a) the image is truly unidentifiable, OR (b) you need one more detail to give a specific diagnosis (e.g. you see a geyser but don't know if it's no hot water, leak, or pressure issue).
- TRADE = SERVICE: The "trade" field MUST be exactly one of the Supabase service labels (copy verbatim). Allowed service labels (in order): ${serviceListText}. Do NOT use free-form names not in this list. Always choose the closest label from this exact list only.
- TRADE DETAIL (SPECIALTY SUB-HEADING): Always set "trade_detail" as well. It is a short free-form line (max 12 words, plain language) naming the specific kind of work or specialist niche within the chosen "trade" — e.g. Borehole Drilling, Automated Gate Motor, Kitchen Renovation. Use Headline-Style Title Case. Use an empty string "" when the category label alone is enough. Do NOT repeat only the trade label; do NOT put the specialty in "trade".
- When the user can clearly identify equipment or has explicitly requested a service, give a full diagnosis/referral with providers.
- CONFIDENCE: Use 85%+ confidence and recommend providers ONLY when you have both (a) a specific estimated diagnosis, and (b) enough information from the user. If the diagnosis would be vague, ask one follow-up question first.`;
}
