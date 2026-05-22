'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Star, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ContractorQuoteCard() {
    return (
        <div className="w-full max-w-[300px] rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C45C3A] text-sm font-bold text-white">
                    R
                </div>
                <div>
                    <p className="text-sm font-semibold text-white">Reza M.</p>
                    <p className="text-xs text-white/50">Electrical · Cape Town Metro</p>
                </div>
                <div className="ml-auto flex">
                    {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-[#C8973A] text-[#C8973A]" />
                    ))}
                </div>
            </div>

            {/* Lead card */}
            <div className="rounded-xl bg-white/8 p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                    <span className="rounded-full bg-[#C8973A]/20 px-2 py-0.5 text-[10px] font-semibold text-[#C8973A]">
                        New lead
                    </span>
                    <span className="text-[10px] text-white/30">2 min ago</span>
                </div>
                <p className="text-xs font-medium text-white">DB trip + burning smell at distribution board</p>
                <p className="mt-1 text-[10px] text-white/50">Observatory · Already diagnosed: possible loose neutral</p>
                <div className="mt-3 flex gap-2">
                    <div className="flex-1 rounded-lg bg-[#C45C3A] py-2 text-center text-[11px] font-semibold text-white">
                        Send quote
                    </div>
                    <div className="flex-1 rounded-lg border border-white/10 py-2 text-center text-[11px] text-white/50">
                        View more
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="mt-3.5 grid grid-cols-3 divide-x divide-white/10 text-center">
                <div className="pr-2">
                    <p className="text-base font-bold text-white">12</p>
                    <p className="text-[9px] text-white/40 uppercase tracking-wide">Leads/mo</p>
                </div>
                <div className="px-2">
                    <p className="text-base font-bold text-[#6B8F71]">R0</p>
                    <p className="text-[9px] text-white/40 uppercase tracking-wide">Commission</p>
                </div>
                <div className="pl-2">
                    <p className="text-base font-bold text-white">4.9</p>
                    <p className="text-[9px] text-white/40 uppercase tracking-wide">Rating</p>
                </div>
            </div>
        </div>
    );
}

export function Land2Hero() {
    return (
        <section className="relative overflow-hidden bg-[#0F1C2D] py-16 sm:py-24 lg:py-28">
            {/* Subtle texture */}
            <div
                className="pointer-events-none absolute inset-0 opacity-30"
                aria-hidden="true"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 70% 50%, rgba(196,92,58,0.08) 0%, transparent 60%), radial-gradient(circle at 20% 80%, rgba(107,143,113,0.06) 0%, transparent 50%)',
                }}
            />

            <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
                    {/* Text block */}
                    <div className="flex max-w-xl flex-col">
                        {/* Badge */}
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4 }}
                            className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/60"
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-[#C8973A]" />
                            Founding contractor programme — limited spots
                        </motion.div>

                        {/* Headline */}
                        <motion.h1
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="font-[family-name:var(--font-playfair)] text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl"
                        >
                            More work.
                            <br />
                            <span className="text-[#C45C3A]">Zero commission.</span>
                        </motion.h1>

                        {/* Sub */}
                        <motion.p
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="mt-5 text-lg leading-relaxed text-white/60 sm:text-xl"
                        >
                            Mendr sends you homeowner leads who already know what's wrong with their home. No lead fees.
                            No bidding wars. Flat monthly subscription, cancel any time.
                        </motion.p>

                        {/* Bullet trust signals */}
                        <motion.ul
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.28 }}
                            className="mt-6 space-y-2.5"
                        >
                            {[
                                'Pre-diagnosed leads — homeowners already know the fault',
                                'Flat subscription from R249/month — no lead fees ever',
                                'You set your own quote — Mendr never takes a cut',
                                'Western Cape focus — no competing with national spam farms',
                            ].map((item) => (
                                <li key={item} className="flex items-start gap-2.5 text-sm text-white/60">
                                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6B8F71]" />
                                    {item}
                                </li>
                            ))}
                        </motion.ul>

                        {/* CTA */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.35 }}
                            className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
                        >
                            <Button
                                id="hero-apply-cta"
                                asChild
                                size="lg"
                                className="group bg-[#C45C3A] text-white hover:bg-[#A84D30] shadow-[0_4px_14px_rgba(196,92,58,0.4)] h-13 px-7 text-base"
                            >
                                <Link href="#apply">
                                    Apply for early access
                                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </Link>
                            </Button>
                            <Button
                                asChild
                                variant="ghost"
                                className="text-white/40 hover:text-white/70"
                            >
                                <Link href="#pricing">See pricing</Link>
                            </Button>
                        </motion.div>

                        {/* Microline */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.5 }}
                            className="mt-4 text-sm text-white/25"
                        >
                            No lock-in · Cancel any month · Manual approval — quality over quantity
                        </motion.p>
                    </div>

                    {/* Right: contractor quote card */}
                    <motion.div
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.7, delay: 0.2 }}
                        className="mx-auto hidden sm:block"
                    >
                        <ContractorQuoteCard />
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
