export const HOW_IT_WORKS = [
    {
        title: 'Capture the issue',
        body: 'Take a photo of the issue. Add a short description in plain language - no technical knowledge needed.',
        label: 'Homeowner uploading fault image',
    },
    {
        title: 'Receive a written diagnosis',
        body: 'Scandio analyses your photo and description, then generates a written report: what the issue likely is, how serious it may be, and what typically needs to happen next. It does not replace an on-site inspection — it gives you a clear starting point before one happens.',
        label: 'Diagnosis report screen',
    },
    {
        title: 'Share and decide',
        body: 'Share your report with one provider or several. Conversations start from the same context — easier to compare, easier to decide. You control who sees it.',
        label: 'Provider list with share action',
    },
] as const;

export const BENTO_POINTS = [
    { title: "Know What's Wrong Before You Call", body: 'Get useful context before making calls so you are not starting from zero.', span: 'lg:col-span-2' },
    { title: 'Replace Uncertainty With A Written Report', body: 'Move from uncertainty to a clearer picture of what may be wrong.', span: 'lg:col-span-2' },
    { title: 'Give Every Provider The Same Brief', body: 'Share one report instead of explaining the issue repeatedly.', span: 'lg:col-span-1' },
    { title: 'Compare Quotes More Fairly', body: 'When providers work from the same context, comparisons become cleaner.', span: 'lg:col-span-1' },
    { title: 'Save Time On Back-And-Forth', body: 'Spend less time clarifying details and more time deciding what to do next.', span: 'lg:col-span-1' },
    { title: 'Keep Control Of Your Data', body: 'Your report remains private by default and sharing is always your choice.', span: 'lg:col-span-1' },
    { title: 'Start Repairs With Better Information', body: 'A better understanding up front usually leads to better decisions later.', span: 'lg:col-span-2' },
    { title: 'Built Around How Homeowners Actually Get Help', body: 'No jargon, no technical setup. Upload a photo, describe what you see, and get a useful answer — the way the process should work.', span: 'lg:col-span-2' },
] as const;

export const FAQS = [
    {
        q: 'Is the Scandio report really free?',
        a: 'Yes. Scandio report generation is currently free for homeowners. You only pay a provider if you decide to proceed with work.',
    },
    {
        q: 'How accurate is the diagnosis?',
        a: 'Scandio provides a strong starting point from your photo and context. It does not replace an on-site inspection, but it improves pre-visit clarity.',
    },
    {
        q: 'Can I share the report with multiple providers?',
        a: 'Yes. Sharing with multiple providers is encouraged because it helps you compare responses and quote scope on a common understanding.',
    },
    {
        q: 'How are providers recommended?',
        a: 'Providers are matched on three factors: relevance to your specific fault type, proximity to your address, and the completeness of their Scandio profile. You see nearby providers who work in your category first.',
    },
    {
        q: 'Do you guarantee provider work quality?',
        a: 'No. Scandio is a decision-support platform and does not guarantee third-party workmanship.',
    },
    {
        q: 'What services does Scandio support?',
        a: 'Scandio currently supports plumbing, electrical, damp and waterproofing, roofing, structural, and general home maintenance faults. The service list expands as coverage grows across the Western Cape.',
    },
    {
        q: 'Is my report private?',
        a: 'Yes. Reports are private by default and are only shared when you explicitly choose to share them.',
    },
    {
        q: 'Can I contact Scandio directly?',
        a: 'Yes. You can message us from the contact form for homeowner, provider, or partnership questions.',
    },
] as const;
