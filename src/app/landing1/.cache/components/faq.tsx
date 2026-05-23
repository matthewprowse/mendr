'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';

const FAQS = [
    {
        q: 'Is the diagnosis really free?',
        a: 'Yes — completely free for homeowners, with no hidden costs. Mendr is funded by contractor subscriptions, not by charging you. You never pay a commission or referral fee.',
    },
    {
        q: 'Do I need to create an account?',
        a: 'No account required to get a diagnosis. Upload your photo, describe the problem, and you get a written report. If you want to save reports or track repairs over time, you can optionally sign in.',
    },
    {
        q: 'How accurate is the AI diagnosis?',
        a: 'Mendr is built specifically for South African homes — particularly the Western Cape — using fault data, building types, and climate patterns common here. For the most common residential faults (damp, cracking, plumbing, electrical), accuracy is high. For complex structural or specialist issues, the diagnosis flags that you should get an in-person inspection.',
    },
    {
        q: 'Will a contractor chase me if I upload a photo?',
        a: "No. Getting a diagnosis doesn't commit you to anything. Contractors only see your job if you actively choose to share it. You're in control at every step.",
    },
    {
        q: 'Which areas do you cover?',
        a: 'We currently cover the Cape Town Metro and surrounding Winelands, Helderberg, and Overberg areas. We\'re expanding — if you\'re outside our current zones, you can join the waitlist and we\'ll notify you when we launch in your area.',
    },
    {
        q: 'How is Mendr different from getting a quote on Kandua or Bark?',
        a: "On those platforms you describe a problem and wait for contractors to respond with quotes. With Mendr you first get a clear, written diagnosis of what's actually wrong — so you understand the problem before you ever speak to a contractor. That makes it much harder to be overcharged or misled.",
    },
    {
        q: 'Can I use Mendr for urgent or emergency faults?',
        a: "Yes. The diagnosis will flag urgency clearly — if something needs same-day attention it will say so. For genuine emergencies (gas leaks, major water damage, electrical hazards), always call emergency services first.",
    },
    {
        q: 'Are the contractors vetted?',
        a: 'Yes. Every contractor on Mendr goes through a manual application review. We check licensing, insurance, and trade credentials before approving anyone. Contractors also pay a flat subscription — there are no commissions or pay-to-rank games that distort who you see.',
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

export function Land1Faq() {
    return (
        <section id="faq" className="bg-[#F4EFE6] py-16 sm:py-24">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                <div className="mb-10 text-center">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#C45C3A]">FAQ</p>
                    <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Questions homeowners ask us
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
