'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';

const FAQS = [
    {
        q: 'What does "pre-diagnosed" actually mean?',
        a: "Before a homeowner contacts any contractor through Mendr, they've already uploaded photos and received a written diagnosis from our AI. That means when a lead reaches you, it includes the fault type, likely cause, and a severity rating — so you can quote more accurately and show up better prepared. No more wasted site visits for jobs that aren't a match.",
    },
    {
        q: 'How much does Mendr take per job?',
        a: "Nothing. Zero. You pay a flat monthly subscription — that's it. Mendr does not take a percentage of any job, ever. Your quote is your revenue.",
    },
    {
        q: 'How many leads should I expect per month?',
        a: "Lead volume depends on your trade, your coverage area, and your plan tier. The platform is in early growth — founding contractors who join now will benefit from lower competition. We'd rather set realistic expectations than oversell: early members typically see 3–8 qualified leads per month, growing as the homeowner base builds.",
    },
    {
        q: 'What happens if a lead is a poor match for my trade?',
        a: "You can dismiss any lead without penalty. We only count leads you actively engage with toward your monthly limit. We also use trade-matching to filter leads — an electrical fault won't be sent to a plumber.",
    },
    {
        q: 'Is there a contract or lock-in period?',
        a: "No. All plans are month-to-month. Cancel before your next billing date and you won't be charged again. There is no annual contract or minimum term.",
    },
    {
        q: "What's the approval process?",
        a: "We manually review every application. We check trade licensing, insurance documentation, and contact references where possible. This takes 2–5 business days. We do this because our homeowner promise depends on every contractor on the platform being legitimate — it protects your reputation as much as theirs.",
    },
    {
        q: 'Can I cover multiple suburbs or areas?',
        a: "Yes. Pro and Premium plan holders can select multiple coverage zones across the Western Cape. Starter plan covers one primary area. You can adjust your coverage zones at any time from your contractor dashboard.",
    },
];

function FaqItem({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="border-b border-[#E8E4DD] last:border-0">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-start justify-between gap-4 py-5 text-left"
            >
                <span className="text-sm font-semibold text-[#1C2B3A] sm:text-base">{q}</span>
                <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#E8E4DD] transition-transform duration-200 ${
                        open ? 'rotate-45 border-[#C45C3A] bg-[#C45C3A]/10' : ''
                    }`}
                >
                    <Plus className={`h-3 w-3 transition-colors ${open ? 'text-[#C45C3A]' : 'text-[#2F3E4E]/40'}`} />
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
                        <p className="pb-5 pr-9 text-sm leading-relaxed text-[#2F3E4E]/70">{a}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function Land2Faq() {
    return (
        <section id="faq" className="bg-[#F4EFE6] py-16 sm:py-24">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                <div className="mb-10 text-center">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#C45C3A]">FAQ</p>
                    <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Questions contractors ask
                    </h2>
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
