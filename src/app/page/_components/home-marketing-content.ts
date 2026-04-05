export const HOW_IT_WORKS = [
    {
        title: 'Capture the issue',
        body: 'Take a clear photo and add short context in plain language so the model can interpret what is happening with stronger confidence. You do not need technical wording to get started, and you can describe the issue naturally the way you would explain it to another person at home.',
        label: 'Homeowner uploading fault image',
    },
    {
        title: 'Receive a structured diagnosis',
        body: 'Scandio generates a clear starting-point report with likely issue context, scope cues, and practical next steps that are easier to act on. This gives you a stronger baseline understanding before you call providers, so conversations start with more precision and less confusion.',
        label: 'Diagnosis report screen',
    },
    {
        title: 'Share and choose with confidence',
        body: 'Share the same report context with providers so conversations are clearer and easier to compare. You stay in control of who can access your report.',
        label: 'Provider list with share action',
    },
] as const;

export const BENTO_POINTS = [
    { title: 'Understand The Issue Earlier', body: 'Get useful context before making calls so you are not starting from zero.', span: 'lg:col-span-2' },
    { title: 'Reduce Guesswork', body: 'Move from uncertainty to a clearer picture of what may be wrong.', span: 'lg:col-span-2' },
    { title: 'Speak To Providers Better', body: 'Share one report instead of explaining the issue repeatedly.', span: 'lg:col-span-1' },
    { title: 'Compare Quotes More Fairly', body: 'When providers work from the same context, comparisons become cleaner.', span: 'lg:col-span-1' },
    { title: 'Save Time On Back-And-Forth', body: 'Spend less time clarifying details and more time deciding what to do next.', span: 'lg:col-span-1' },
    { title: 'Keep Control Of Your Data', body: 'Your report remains private by default and sharing is always your choice.', span: 'lg:col-span-1' },
    { title: 'Make Better Decisions', body: 'A better understanding up front usually leads to better decisions later.', span: 'lg:col-span-2' },
    { title: 'Designed For Real Homeowner Workflows', body: 'Built around how homeowners actually find help in the real world.', span: 'lg:col-span-2' },
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
        a: 'Recommendations are based on diagnosis-to-service relevance, location fit, and provider profile quality signals.',
    },
    {
        q: 'Do you guarantee provider work quality?',
        a: 'No. Scandio is a decision-support platform and does not guarantee third-party workmanship.',
    },
    {
        q: 'What services does Scandio support?',
        a: 'Scandio supports multiple home maintenance categories. The active services list updates as backend coverage changes.',
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
