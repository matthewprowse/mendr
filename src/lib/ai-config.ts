export const aiConfig = {
    // Opt-in: only enable provider enrichment when explicitly set to "true" or "1"
    enableProviderEnrichment:
        process.env.AI_ENABLE_PROVIDER_ENRICHMENT === 'true' ||
        process.env.AI_ENABLE_PROVIDER_ENRICHMENT === '1',
    enableWhatsappAiMessage:
        process.env.AI_ENABLE_WHATSAPP_AI_MESSAGE !== 'false' &&
        process.env.AI_ENABLE_WHATSAPP_AI_MESSAGE !== '0',
};

