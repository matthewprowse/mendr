'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, ArrowRight } from 'lucide-react';

const PLANS = [
    {
        name: 'Starter',
        price: 249,
        description: 'For tradespeople testing the platform or part-time contractors.',
        leads: '5 leads/month',
        features: [
            'Up to 5 active leads per month',
            'Verified contractor profile listing',
            'Homeowner messaging portal',
            'Western Cape area coverage',
            'Email support',
        ],
        cta: 'Apply — Starter',
        featured: false,
    },
    {
        name: 'Pro',
        price: 649,
        description: 'Best for full-time contractors growing their client base.',
        leads: '20 leads/month',
        features: [
            'Up to 20 active leads per month',
            'Priority profile placement',
            'Pre-diagnosed lead summaries',
            'Homeowner messaging portal',
            'Multi-area coverage',
            'Priority email & phone support',
            'Monthly performance report',
        ],
        cta: 'Apply — Pro',
        featured: true,
    },
    {
        name: 'Premium',
        price: 1249,
        description: 'For established businesses wanting maximum lead volume.',
        leads: 'Unlimited leads',
        features: [
            'Unlimited active leads',
            'Top-of-list profile placement',
            'Pre-diagnosed lead summaries',
            'Homeowner messaging portal',
            'All-area Western Cape coverage',
            'Dedicated account manager',
            'Monthly performance report',
            'Early access to new features',
        ],
        cta: 'Apply — Premium',
        featured: false,
    },
];

function PlanCard({ plan }: { plan: (typeof PLANS)[0] }) {
    return (
        <div
            className={`relative flex flex-col rounded-2xl p-6 transition-shadow ${
                plan.featured
                    ? 'border-2 border-[#C45C3A] bg-white shadow-[0_8px_30px_rgba(196,92,58,0.18)]'
                    : 'border border-[#E8E4DD] bg-white shadow-sm hover:shadow-md'
            }`}
        >
            {plan.featured && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#C45C3A] px-3.5 py-1 text-xs font-bold text-white">
                    Most popular
                </div>
            )}

            <div className="mb-5">
                <p className="text-sm font-semibold uppercase tracking-widest text-[#2F3E4E]/40">{plan.name}</p>
                <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-bold text-[#1C2B3A]">R{plan.price.toLocaleString()}</span>
                    <span className="mb-1 text-sm text-[#2F3E4E]/40">/month</span>
                </div>
                <p className="mt-1 text-xs font-medium text-[#C45C3A]">{plan.leads}</p>
                <p className="mt-2 text-sm text-[#2F3E4E]/60">{plan.description}</p>
            </div>

            <ul className="flex-1 space-y-2.5">
                {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[#2F3E4E]/70">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6B8F71]" />
                        {f}
                    </li>
                ))}
            </ul>

            <Link
                href="#apply"
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors ${
                    plan.featured
                        ? 'bg-[#C45C3A] text-white hover:bg-[#A84D30]'
                        : 'border border-[#E8E4DD] text-[#1C2B3A] hover:border-[#C45C3A]/40 hover:text-[#C45C3A]'
                }`}
            >
                {plan.cta}
                <ArrowRight className="h-4 w-4" />
            </Link>
        </div>
    );
}

export function Land2Pricing() {
    return (
        <section id="pricing" className="bg-[#FAFAF8] py-16 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* Founding member banner */}
                <div className="mb-10 rounded-2xl border border-[#C8973A]/30 bg-[#C8973A]/8 p-5 sm:p-6">
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C8973A]/20 text-lg">
                                ★
                            </span>
                            <div>
                                <p className="text-sm font-bold text-[#1C2B3A]">Founding Member Offer — Limited spots</p>
                                <p className="mt-0.5 text-sm text-[#2F3E4E]/60">
                                    First 50 contractors lock in{' '}
                                    <strong className="text-[#1C2B3A]">30% off their chosen plan for life</strong>. No
                                    price increases, ever.
                                </p>
                            </div>
                        </div>
                        <Link
                            href="#apply"
                            className="shrink-0 rounded-lg bg-[#C8973A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B07A2A] transition-colors"
                        >
                            Claim founding rate
                        </Link>
                    </div>
                </div>

                {/* Section header */}
                <div className="mb-10 text-center">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#C45C3A]">Pricing</p>
                    <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Flat fee. No surprises.
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-[#2F3E4E]/60">
                        Every plan includes the same vetted-contractor promise — the tiers differ only in lead volume
                        and support level. No commission on any jobs, ever.
                    </p>
                </div>

                {/* Plan grid */}
                <div className="grid gap-6 sm:grid-cols-3">
                    {PLANS.map((plan) => (
                        <PlanCard key={plan.name} plan={plan} />
                    ))}
                </div>

                {/* Footer note */}
                <p className="mt-8 text-center text-sm text-[#2F3E4E]/40">
                    All plans billed monthly in ZAR · Cancel any time · VAT not included · Approval required
                </p>
            </div>
        </section>
    );
}
