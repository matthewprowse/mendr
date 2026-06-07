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

import {
    Zap,
    Droplets,
    ShieldCheck,
    Wind,
    Home,
    Wrench,
} from 'lucide-react';

/**
 * Six featured trade categories shown on the homepage "What we cover" section.
 * Deliberately a curated subset of SERVICE_LABELS — pick the six most common
 * homeowner fault types for maximum landing-page relevance.
 */
export const TRADES = [
    {
        slug: 'electrical',
        name: 'Electrical',
        descriptor: 'Trips, outages, wiring faults, and load-shedding damage.',
        icon: Zap,
        examples: ['Tripping breakers', 'Dead plugs or lights', 'Geyser element failure'],
    },
    {
        slug: 'plumbing',
        name: 'Plumbing',
        descriptor: 'Leaks, burst pipes, blocked drains, and geyser issues.',
        icon: Droplets,
        examples: ['Leaking tap or pipe', 'Blocked drain', 'No hot water'],
    },
    {
        slug: 'security',
        name: 'Security',
        descriptor: 'Alarm systems, electric fences, CCTV, and access control.',
        icon: ShieldCheck,
        examples: ['Alarm triggering falsely', 'Gate not opening', 'Camera offline'],
    },
    {
        slug: 'air-conditioning',
        name: 'Air Conditioning',
        descriptor: 'Cooling, heating, and ventilation faults for all unit types.',
        icon: Wind,
        examples: ['Unit not cooling', 'Water dripping inside', 'Strange noise from unit'],
    },
    {
        slug: 'roofing',
        name: 'Roofing',
        descriptor: 'Leaks, damaged tiles, gutters, and waterproofing failures.',
        icon: Home,
        examples: ['Roof leaking after rain', 'Damaged or missing tiles', 'Blocked gutters'],
    },
    {
        slug: 'building',
        name: 'Building & Construction',
        descriptor: 'Structural cracks, damp, rising water, and brick / plaster damage.',
        icon: Wrench,
        examples: ['Cracks in walls', 'Rising damp', 'Ceiling collapse risk'],
    },
] as const;
