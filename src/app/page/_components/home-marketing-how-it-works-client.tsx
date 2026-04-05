'use client';

import { motion } from 'framer-motion';
import { Placeholder } from '@/components/placeholder';
import { HOW_IT_WORKS } from '@/app/page/_components/home-marketing-content';

export function HomeMarketingHowItWorksClient() {
    return (
        <section id="how-it-works" className="scroll-mt-16 py-16 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How Scandio Works</h2>
                    <p className="mt-3 text-base text-muted-foreground">
                        Three practical steps to understand your issue and take action with confidence.
                    </p>
                </div>
                <div className="space-y-14 sm:space-y-16">
                    {HOW_IT_WORKS.map(({ title, body, label }, idx) => (
                        <motion.div
                            key={title}
                            initial={{ opacity: 0, y: 18 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-64px' }}
                            className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10"
                        >
                            <div className={idx % 2 === 1 ? 'order-2 lg:order-1' : 'order-2'}>
                                <h3 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h3>
                                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{body}</p>
                            </div>
                            <div className={idx % 2 === 1 ? 'order-1 lg:order-2' : 'order-1'}>
                                <Placeholder label={label} aspectRatio="aspect-[4/3]" className="w-full rounded-lg" />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
