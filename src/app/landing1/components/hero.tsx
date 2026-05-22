'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Star, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* Floating diagnosis card shown as the "phone mockup" */
function DiagnosisCard() {
    return (
        <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-3xl bg-[#1C2B3A] p-1 shadow-2xl">
            {/* Phone chrome */}
            <div className="rounded-[22px] bg-[#0F1C2D] px-4 pb-6 pt-8">
                {/* Status bar dots */}
                <div className="mb-4 flex justify-center">
                    <div className="h-1 w-16 rounded-full bg-white/20" />
                </div>
                {/* Card */}
                <div className="rounded-2xl bg-white p-4">
                    {/* Badge */}
                    <div className="mb-3 flex items-center justify-between">
                        <span className="rounded-full bg-[#C45C3A]/10 px-2.5 py-1 text-xs font-semibold text-[#C45C3A]">
                            Structural
                        </span>
                        <span className="rounded-full bg-[#6B8F71]/10 px-2.5 py-1 text-xs font-medium text-[#6B8F71]">
                            Moderate
                        </span>
                    </div>
                    {/* Diagnosis text */}
                    <p className="font-mono text-xs font-semibold leading-snug text-[#1C2B3A]">
                        DIAGNOSIS
                    </p>
                    <p className="mt-1 font-mono text-[11px] leading-relaxed text-[#2F3E4E]">
                        Penetrating damp: roof or parapet flashing failure
                    </p>
                    {/* Stats row */}
                    <div className="mt-3 grid grid-cols-3 divide-x divide-[#E8E4DD] border-y border-[#E8E4DD] py-2.5 text-center">
                        <div>
                            <p className="text-[9px] text-[#2F3E4E]/40 uppercase tracking-wide">Cause</p>
                            <p className="mt-0.5 text-[10px] font-medium text-[#1C2B3A]">Flashing</p>
                        </div>
                        <div>
                            <p className="text-[9px] text-[#2F3E4E]/40 uppercase tracking-wide">Urgency</p>
                            <p className="mt-0.5 text-[10px] font-medium text-[#6B8F71]">Moderate</p>
                        </div>
                        <div>
                            <p className="text-[9px] text-[#2F3E4E]/40 uppercase tracking-wide">Estimate</p>
                            <p className="mt-0.5 text-[10px] font-medium text-[#1C2B3A]">R2,400+</p>
                        </div>
                    </div>
                    {/* Bullet points */}
                    <ul className="mt-2.5 space-y-1">
                        {[
                            'Common in Cape Town homes pre-1980',
                            'Inspect flashings before repainting',
                            'Address within 1–3 months',
                        ].map((pt) => (
                            <li key={pt} className="flex items-start gap-1.5 text-[10px] text-[#2F3E4E]/60">
                                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C45C3A]" />
                                {pt}
                            </li>
                        ))}
                    </ul>
                    {/* CTA */}
                    <div className="mt-3 rounded-lg bg-[#C45C3A] py-2 text-center text-[11px] font-semibold text-white">
                        Find a contractor →
                    </div>
                </div>
            </div>
        </div>
    );
}

/* Sticky CTA bar — appears when hero CTA scrolls out of view on mobile */
function StickyMobileCta() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const hero = document.getElementById('hero-cta');
        if (!hero) return;
        const obs = new IntersectionObserver(
            ([entry]) => setVisible(!entry.isIntersecting),
            { threshold: 0 },
        );
        obs.observe(hero);
        return () => obs.disconnect();
    }, []);

    return (
        <div
            className={`fixed bottom-0 left-0 right-0 z-50 sm:hidden transition-transform duration-200 ${
                visible ? 'translate-y-0' : 'translate-y-full'
            }`}
        >
            <div className="bg-[#C45C3A] px-4 pb-6 pt-3 shadow-lg">
                <Link
                    href="/start"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-semibold text-[#C45C3A]"
                >
                    Get free diagnosis
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        </div>
    );
}

export function Land1Hero() {
    return (
        <>
            <section className="relative overflow-hidden bg-[#F4EFE6] py-16 sm:py-24 lg:py-28">
                {/* Subtle grain texture */}
                <div
                    className="pointer-events-none absolute inset-0"
                    aria-hidden="true"
                    style={{
                        backgroundImage:
                            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.03\'/%3E%3C/svg%3E")',
                        backgroundSize: '200px 200px',
                    }}
                />

                <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
                        {/* Text block */}
                        <div className="flex max-w-2xl flex-col">
                            {/* Social proof pill */}
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4 }}
                                className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#E8E4DD] bg-white px-3 py-1.5 text-sm text-[#2F3E4E]/70 shadow-sm"
                            >
                                <Star className="h-3.5 w-3.5 fill-[#C8973A] text-[#C8973A]" />
                                52 homeowners helped in the Western Cape
                            </motion.div>

                            {/* Headline */}
                            <motion.h1
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className="font-[family-name:var(--font-playfair)] text-4xl font-bold leading-[1.12] tracking-tight text-[#1C2B3A] sm:text-5xl lg:text-6xl"
                            >
                                Your home is telling you something.
                            </motion.h1>

                            {/* Subheadline */}
                            <motion.p
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                                className="mt-5 text-lg leading-relaxed text-[#2F3E4E]/70 sm:text-xl"
                            >
                                Upload a photo of the problem. Get a free expert diagnosis in 60 seconds. Then choose
                                from vetted local contractors who want your work — without paying anyone a commission.
                            </motion.p>

                            {/* CTA */}
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                                className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
                            >
                                <Button
                                    id="hero-cta"
                                    asChild
                                    size="lg"
                                    className="group bg-[#C45C3A] text-white hover:bg-[#A84D30] shadow-[0_4px_14px_rgba(196,92,58,0.35)] h-13 px-7 text-base"
                                >
                                    <Link href="/start">
                                        Upload a photo and start
                                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </Link>
                                </Button>
                                <Button
                                    asChild
                                    variant="ghost"
                                    className="text-[#2F3E4E]/60 hover:text-[#1C2B3A]"
                                >
                                    <Link href="#how-it-works">How Mendr works</Link>
                                </Button>
                            </motion.div>

                            {/* Trust microline */}
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5, delay: 0.45 }}
                                className="mt-4 text-sm text-[#2F3E4E]/40"
                            >
                                Free for homeowners · No sign-up required · Western Cape only
                            </motion.p>
                        </div>

                        {/* Phone mockup */}
                        <motion.div
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.7, delay: 0.2 }}
                            className="mx-auto w-full max-w-[280px] lg:max-w-[300px] hidden sm:block"
                        >
                            <DiagnosisCard />
                        </motion.div>
                    </div>
                </div>
            </section>
            <StickyMobileCta />
        </>
    );
}
