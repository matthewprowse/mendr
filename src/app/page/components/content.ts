export const HOW_IT_WORKS = [
    {
        title: 'Capture the issue',
        body: 'Take a photo of the issue. Add a short description in plain language - no technical knowledge needed.',
        label: 'Homeowner uploading fault image',
    },
    {
        title: 'Receive a written diagnosis',
        body: 'Mendr analyses your photo and description, then generates a written report: what the issue likely is, how serious it may be, and what typically needs to happen next. It does not replace an on-site inspection — it gives you a clear starting point before one happens.',
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
        q: 'Is the Mendr report really free?',
        a: 'Yes. Mendr report generation is currently free for homeowners. You only pay a provider if you decide to proceed with work.',
    },
    {
        q: 'How accurate is the diagnosis?',
        a: 'Mendr provides a strong starting point from your photo and context. It does not replace an on-site inspection, but it improves pre-visit clarity.',
    },
    {
        q: 'Can I share the report with multiple providers?',
        a: 'Yes. Sharing with multiple providers is encouraged because it helps you compare responses and quote scope on a common understanding.',
    },
    {
        q: 'How are providers recommended?',
        a: 'Providers are matched on three factors: relevance to your specific fault type, proximity to your address, and the completeness of their Mendr profile. You see nearby providers who work in your category first.',
    },
    {
        q: 'Do you guarantee provider work quality?',
        a: 'No. Mendr is a decision-support platform and does not guarantee third-party workmanship.',
    },
    {
        q: 'What services does Mendr support?',
        a: 'Mendr currently supports plumbing, electrical, damp and waterproofing, roofing, structural, and general home maintenance faults. The service list expands as coverage grows across the Western Cape.',
    },
    {
        q: 'Is my report private?',
        a: 'Yes. Reports are private by default and are only shared when you explicitly choose to share them.',
    },
    {
        q: 'Can I contact Mendr directly?',
        a: 'Yes. You can message us from the contact form for homeowner, provider, or partnership questions.',
    },
] as const;

// Six service categories Mendr currently diagnoses. Kept in sync with the
// per-trade Service schema on the homepage and the FAQ "What services" answer.
export const TRADES = [
    {
        name: 'Plumbing',
        descriptor: 'Leaks, burst pipes, low pressure, blocked drains, and geyser issues.',
        examples: ['Leaking or burst pipes', 'Low water pressure', 'Geyser and drainage faults'],
    },
    {
        name: 'Electrical',
        descriptor: 'Tripping circuits, faulty plugs, DB board concerns, and lighting faults.',
        examples: ['Tripping DB board', 'Dead plugs or lights', 'Exposed or damaged wiring'],
    },
    {
        name: 'Damp & Waterproofing',
        descriptor: 'Rising damp, penetrating damp, mould, and failed waterproofing.',
        examples: ['Rising or penetrating damp', 'Mould and staining', 'Failed waterproofing'],
    },
    {
        name: 'Roofing',
        descriptor: 'Leaks, slipped tiles, ceiling stains, and gutter problems.',
        examples: ['Roof leaks and ceiling stains', 'Slipped or broken tiles', 'Blocked or damaged gutters'],
    },
    {
        name: 'Structural',
        descriptor: 'Cracks, movement, and signs that need a closer professional look.',
        examples: ['Wall and foundation cracks', 'Sagging or movement', 'Subsidence concerns'],
    },
    {
        name: 'General Home Maintenance',
        descriptor: 'Everyday repairs that do not fit neatly into a single trade.',
        examples: ['Doors, windows, and locks', 'Tiling and surfaces', 'Wear and general repairs'],
    },
] as const;

// TODO(testimonials): PLACEHOLDER content — replace with real, attributable
// homeowner reviews (ideally Supabase-backed) before launch. Do not present
// these as genuine reviews while they remain placeholders.
export const TESTIMONIALS = [
    {
        quote: 'Placeholder testimonial — replace with a real homeowner review before launch.',
        name: 'Homeowner, Cape Town',
        context: 'Plumbing diagnosis',
    },
    {
        quote: 'Placeholder testimonial — replace with a real homeowner review before launch.',
        name: 'Homeowner, Southern Suburbs',
        context: 'Damp diagnosis',
    },
    {
        quote: 'Placeholder testimonial — replace with a real homeowner review before launch.',
        name: 'Homeowner, Northern Suburbs',
        context: 'Electrical diagnosis',
    },
] as const;
