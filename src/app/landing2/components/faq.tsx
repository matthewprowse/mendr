'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';

/* Per brief Section 2.10 — 11 questions, exact copy. */

const FAQS = [
    {
        q: 'Is it really free to join right now?',
        a: 'Yes. During the founding phase there’s no application fee, no monthly subscription, and Mendr doesn’t take commission on any work you do through the platform. This founding period exists so we can build a strong network before paid plans roll out. Founding providers lock in favourable terms and get notice before any billing begins.',
    },
    {
        q: 'How is Mendr different from Snupit or Kandua?',
        a: 'Two main ways. First, we don’t sell your lead to multiple providers — one enquiry goes to one provider. Second, every enquiry comes with a structured diagnosis report attached, so you know what the homeowner thinks is wrong before you respond. We also don’t take a cut of the job. We make money from provider subscriptions, not from your invoices or from reselling leads.',
    },
    {
        q: 'What kind of enquiries will I actually receive?',
        a: 'Enquiries from homeowners who’ve already been through Mendr’s AI diagnosis. So when they contact you, they can usually tell you what they think the problem is, roughly how urgent it is, and what they’ve already noticed — instead of just "something is broken." That cuts down the usual back-and-forth before a site visit a lot.',
    },
    {
        q: 'How do you decide which providers to recommend?',
        a: 'A composite ranking with four signals: how well your trade matches the diagnosed problem, your rating (Bayesian-smoothed so a few stars on a thin profile don’t inflate things), how close you are to the homeowner, and how recently you’ve been active. Profile completeness adds a small boost. No single signal dominates.',
    },
    {
        q: 'Can I control which areas and trades I appear in?',
        a: 'Yes — and you should. Your operating area and service categories are the most important things to get right on your profile. If you cover the Southern Suburbs only, you won’t show up for homeowners in Durbanville. If you’re a geyser specialist, you won’t be matched to gate motor faults. Setting these accurately means the enquiries you get are actually within your scope.',
    },
    {
        q: 'Do I have to use Mendr’s quoting tool?',
        a: 'There isn’t one. Mendr deliberately stays out of your quoting and invoicing process. Once a homeowner contacts you through Mendr, everything from that point — how you quote, how you communicate, how you invoice — is handled the way you already do it. You keep full commercial control of every job.',
    },
    {
        q: 'What if a diagnosis turns out to be wrong?',
        a: 'That’s a normal part of the trade. Every report comes with a confidence score, and homeowners are reminded that a site assessment is still needed before any work is confirmed. The diagnosis exists to give your first conversation a better starting point — not to replace your professional judgement on-site.',
    },
    {
        q: 'Does my profile affect how often I’m shown?',
        a: 'Yes. A profile with verified work photos, a real bio, listed specialisations, and a decent volume of genuine reviews will consistently outperform a sparse profile with the same rating. Homeowners see your profile summary when picking who to contact — depth helps them choose you instead of scrolling past.',
    },
    {
        q: 'When do paid plans start? How much notice do I get?',
        a: 'Paid plans roll out once we have enough homeowner volume to make them fair. Founding providers receive at least 30 days’ written notice before any billing begins, and you’ll need to opt in — there’s no automatic upgrade. The plan tiers and prices are shown on this page so you know exactly what to expect.',
    },
    {
        q: 'Is Mendr available outside Cape Town?',
        a: 'The Western Cape is where Mendr launched and where the founding network is being built. Geographic expansion is planned but will follow homeowner demand. If your business operates elsewhere in South Africa, you can still apply — we’ll be in touch when coverage opens in your area.',
    },
    {
        q: 'How do I get started?',
        a: 'Click "Apply To Join The Network" on this page. The application takes about five minutes and covers your business details, trade categories, and operating area. Once approved (usually a few business days), you’ll set up your profile and start appearing in matches.',
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

export function Land2Faq() {
    return (
        <section id="faq" className="scroll-mt-20 bg-[#F4EFE6] py-16 sm:py-24">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                <div className="mb-10 text-center">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#C45C3A]">
                        FAQ
                    </p>
                    <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Common Questions From Providers
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
