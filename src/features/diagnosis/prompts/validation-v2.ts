/**
 * Phase 5 — V2 validation prompt.
 *
 * Replaces V1's `validation.ts` for the V2 path. Differences:
 *   • The supported-trades list and the excluded-services list are NO LONGER
 *     duplicated in prose — they live in `lib/services` and are injected by
 *     the V2 composer via `buildSupportedServicesBlock` /
 *     `buildExcludedServicesBlock` (Bucket B audit rows 11, 21, 22).
 *   • The Bucket A worked examples on trade_detail and clarification are gone
 *     (audit rows 23-26).
 *   • `UNRELATED_IMAGE` and `UNSUPPORTED_HOME_SERVICE` content was previously
 *     pulled in from `special-cases.ts` — V2 keeps the general principles
 *     here (Bucket C) but stops importing the file. `special-cases.ts` is
 *     dead in the V2 path and will be deleted in Phase 12 cleanup.
 *   • The V1 confidence rule ("Use 85%+ confidence and recommend providers
 *     ONLY when ...") is dropped — V2 gates on the COMPLETION CRITERIA in
 *     the rubric block.
 *
 * See: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 5
 * See: docs/prompt-content-audit.md rows 14, 15, 21, 22, 23, 24, 25, 26
 */

export const STRICT_VALIDATION_V2 = `STRICT VALIDATION:
- This app covers home maintenance and repairs. The exhaustive list of SUPPORTED TRADES is injected above; treat it as the only valid set of \`trade\` values besides "N/A".
- The EXPLICITLY UNSERVICED list above enumerates categories Mendr does NOT offer. When the user requests one of these, set \`unserviced: true\`, explain politely in 'message' that Mendr doesn't cover that service, and suggest the closest relevant supported trade if applicable.
- EXPLICIT SERVICE REQUESTS (highest priority): when the user clearly states which supported trade they need, honour it. Set \`rejected: false\`, set diagnosis and trade to match the requested trade exactly as it appears in the SUPPORTED TRADES list, and provide providers. Do NOT reject as "Service Not Currently Supported" when the request matches a supported trade.
- UNRELATED IMAGE: If the image is unrelated to home maintenance (selfies, landscapes, memes, food, pets, documents, vehicles) AND the user has NOT stated a clear home-maintenance need in text, reject it — set \`rejected: true\`, \`diagnosis: "Photo Not Related to Home Maintenance"\`, \`trade: "N/A"\`.
- UNSUPPORTED HOME SERVICE: When the issue is home-related but the requested work does not fall under any SUPPORTED TRADE (and may instead match one of the EXPLICITLY UNSERVICED categories), set \`unserviced: true\`, \`diagnosis: "Service Not Currently Supported"\`, \`trade: "N/A"\`, and write a warm explanation in \`message\` that lists what Mendr does offer.
- TRADE FIELD: copy verbatim from the SUPPORTED TRADES list. Do NOT use free-form names not in that list. When the closest match is unclear or none fits, use "N/A" and set \`requires_clarification: true\`.
- TRADE DETAIL: short free-form specialty within the chosen trade, max 12 words, Headline-Style Title Case. Empty string when the category label alone is enough. Do not repeat only the trade label; do not put the specialty in \`trade\`.
- When the user can clearly identify equipment or has explicitly requested a service, give a full diagnosis/referral with providers — apply the COMPLETION CRITERIA from the rubric block to decide whether clarification is required.`;
