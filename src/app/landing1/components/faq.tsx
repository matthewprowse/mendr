'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';

/* Per brief Section 1.8 — 12 questions, exact copy from brief, accordion. */

const FAQS = [
    {
        q: 'Is Mendr really free?',
        a: 'Yes — getting a Mendr report is free for Western Cape homeowners. There’s no account to set up and no payment details to enter. You only pay a tradesperson if you decide to hire one. Mendr doesn’t charge a cut of the work either.',
    },
    {
        q: 'How accurate is the diagnosis?',
        a: 'Mendr gives you a strong starting point based on your photo and description, with a confidence score on every report. It’s not a replacement for someone coming to look — and we’d never claim otherwise. In practice, it makes the first conversation with a tradesperson much better, even if their on-site verdict ends up slightly different.',
    },
    {
        q: 'What kind of photo works best?',
        a: 'Clear, well-lit photos taken close enough to actually see the problem. Two or three angles is better than one. Photos in bad light still work, but the confidence score will reflect it. Mendr handles HEIC and standard photo formats from any modern phone — no need to convert anything first.',
    },
    {
        q: 'Can Mendr diagnose damp problems?',
        a: 'Yes — damp is one of the most common things Mendr handles, especially in coastal Cape Town homes. The report will tell you whether it’s likely rising damp, penetrating damp, condensation, or something plumbing-related. That distinction matters because each one needs a different kind of specialist. A site inspection is still recommended before any work starts.',
    },
    {
        q: 'Does it work for geyser and load-shedding-related problems?',
        a: 'Yes. Geyser issues (leaks, thermostats, elements) and post-load-shedding electrical faults (tripping DB boards, burnt circuits, surge damage) are some of the most common things people use Mendr for. The report will tell you if it’s plumbing, electrical, or both.',
    },
    {
        q: 'Will the tradesperson still need to come to my house?',
        a: 'Yes. Mendr’s job is to make the first call and the first site visit better — not to replace either. The tradesperson still needs to check the problem, confirm what’s going on, and quote the work. The difference is that they arrive with real context instead of starting from zero.',
    },
    {
        q: 'Can I share the report with more than one provider?',
        a: 'Yes — we actually recommend it. Sending the same report to three providers means you get three genuinely comparable quotes, instead of three different interpretations of your story. You control who sees the report at every step.',
    },
    {
        q: 'How do you pick which providers to show me?',
        a: 'Four signals: how well the provider’s trade matches your specific problem, how close they are to you, their rating (with maths that stops a few five-star reviews from making a sparse profile look amazing), and how recently they’ve been active on the platform. Profile completeness adds a small boost. No single signal dominates — a top-rated provider 12km away can still rank above a closer one with fewer reviews.',
    },
    {
        q: 'Do you guarantee the work the tradesperson does?',
        a: 'No — we’re upfront about that. Mendr is a tool for diagnosis and matching, not a guarantor of someone else’s workmanship. We do require providers to maintain their profile and meet the area and trade categories they signed up under, and we surface reviews from outside Mendr (like Google) so you can see a fuller picture.',
    },
    {
        q: 'Is my report private?',
        a: 'Yes. Reports are private by default. They only get shared when you choose to share them with a specific provider. We don’t sell or resell your contact details to anyone. Our revenue comes from provider subscriptions, not from selling your information.',
    },
    {
        q: 'What if I’m not in the Western Cape?',
        a: 'Mendr’s diagnosis tool will still work for you, but provider matching won’t — we’re building the network province by province. If you’d like to be told when we cover your area, drop us a line on the contact page.',
    },
    {
        q: 'Who built Mendr?',
        a: 'A small team based in Cape Town. We built it because we kept getting overcharged for things we didn’t understand, and we figured we weren’t the only ones. There’s more on the About page.',
    },
];

function FaqItem({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="border-b border-[#E8E4DD] last:border-0">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-start justify-between gap-4 py-5 text-left"
                aria-expanded={open}
            >
                <span className="text-sm font-semibold text-[#1C2B3A] sm:text-base">{q}</span>
                <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#E8E4DD] transition-transform duration-200 ${
                        open ? 'rotate-45 border-[#C45C3A] bg-[#C45C3A]/10' : ''
                    }`}
                >
                    <Plus
                        className={`h-3 w-3 transition-colors ${
                            open ? 'text-[#C45C3A]' : 'text-[#2F3E4E]/40'
                        }`}
                    />
                </span>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <p className="pb-5 pr-9 text-sm leading-relaxed text-[#2F3E4E]/75">{a}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function Land1Faq() {
    return (
        <section id="faq" className="scroll-mt-20 bg-[#F4EFE6] py-16 sm:py-24">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                <div className="mb-10 text-center">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#C45C3A]">
                        FAQ
                    </p>
                    <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Common Questions
                    </h2>
                    <p className="mt-3 text-sm text-[#2F3E4E]/60">
                        If yours isn&rsquo;t here, message us — we&rsquo;ll add it.
                    </p>
                </div>

                <div className="rounded-2xl border border-[#E8E4DD] bg-white px-6 py-2 shadow-sm sm:px-8">
                    {FAQS.map(({ q, a }) => (
                        <FaqItem key={q} q={q} a={a} />
                    ))}
                </div>
            </div>
        </section>
    );
}
