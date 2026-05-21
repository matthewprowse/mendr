export type MarketingFaqItem = { q: string; a: string };

/** Homeowner marketing FAQ — keep in sync with FAQPage JSON-LD on the home page. */
export const HOME_MARKETING_FAQS: MarketingFaqItem[] = [
    {
        q: "Is the Menda report really free?",
        a: "Yes. Menda report generation is currently free for homeowners. You only pay a provider if you decide to proceed with work.",
    },
    {
        q: "How accurate is the diagnosis?",
        a: "Menda provides a strong starting point from your photo and context. It does not replace an on-site inspection, but it improves pre-visit clarity.",
    },
    {
        q: "Can I share the report with multiple providers?",
        a: "Yes. Sharing with multiple providers is encouraged because it helps you compare responses and quote scope on a common understanding.",
    },
    {
        q: "How are providers recommended?",
        a: "Recommendations are based on diagnosis-to-service relevance, location fit, and provider profile quality signals.",
    },
    {
        q: "Do you guarantee provider work quality?",
        a: "No. Menda is a decision-support platform and does not guarantee third-party workmanship.",
    },
    {
        q: "What services does Menda support?",
        a: "Menda supports multiple home maintenance categories. The active services list updates as backend coverage changes.",
    },
    {
        q: "Is my report private?",
        a: "Yes. Reports are private by default and are only shared when you explicitly choose to share them.",
    },
    {
        q: "Can I contact Menda directly?",
        a: "Yes. You can message us from the contact form for homeowner, provider, or partnership questions.",
    },
];
