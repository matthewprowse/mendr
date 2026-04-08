'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { FAQS } from '@/app/page/components/content';

export function HomeMarketingFaqClient() {
    const [openFaq, setOpenFaq] = useState<string | null>(FAQS[0]?.q ?? null);

    return (
        <section id="faq" className="scroll-mt-16 py-16 sm:py-20">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                <div className="mb-10 text-center sm:mb-12">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Frequently Asked Questions</h2>
                </div>
                <div className="mx-auto divide-y divide-border/50">
                    {FAQS.map(({ q, a }) => (
                        <div key={q} className="py-4">
                            <button
                                type="button"
                                onClick={() => setOpenFaq(openFaq === q ? null : q)}
                                className="flex w-full items-center justify-between gap-4 text-left"
                            >
                                <h3 className="text-base font-semibold text-foreground">{q}</h3>
                                <ChevronDown
                                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${openFaq === q ? 'rotate-180' : ''}`}
                                />
                            </button>
                            <AnimatePresence initial={false}>
                                {openFaq === q && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                                        className="overflow-hidden"
                                    >
                                        <p className="mt-3 pb-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
