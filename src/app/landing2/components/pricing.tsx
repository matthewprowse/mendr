import Link from 'next/link';
import { CheckCircle, ArrowRight } from 'lucide-react';

/* Per brief Section 2.7 — three-tier pricing with founding-phase notice. */

type Plan = {
    name: string;
    price: number;
    description: string;
    cta: string;
    included: string[];
    notIncluded: string[];
    featured?: boolean;
};

const PLANS: Plan[] = [
    {
        name: 'Starter',
        price: 249,
        description: 'Everything you need to get listed and start receiving informed enquiries in your area.',
        cta: 'Apply For Free',
        included: [
            'Profile listing in Mendr matching',
            'Service category and area matching',
            'Up to 30 homeowner enquiries per month',
            'AI-generated starter bio',
            'Photo gallery (up to 10 photos)',
            'Review aggregation and display',
            'Basic match analytics (views, clicks)',
        ],
        notIncluded: [
            'Priority placement in results',
            '"Recommended" badge',
            'Extended service areas (up to 3 zones)',
            'Advanced analytics',
            'Dedicated account support',
        ],
    },
    {
        name: 'Professional',
        price: 649,
        description: 'For established businesses ready to grow volume and stand out in a competitive area.',
        cta: 'Apply For Free',
        featured: true,
        included: [
            'Everything in Starter',
            'Up to 100 homeowner enquiries per month',
            'Priority placement in results',
            '"Recommended" badge on profile',
            'Photo gallery (up to 40 photos)',
            'Extended service areas (up to 3 zones)',
            'AI-generated specialisation highlights',
            'Advanced analytics and enquiry trends',
            'WhatsApp enquiry routing',
        ],
        notIncluded: [
            'Unlimited enquiries per month',
            'Featured placement above standard results',
            'Dedicated account support',
        ],
    },
    {
        name: 'Premium',
        price: 1249,
        description: 'Maximum visibility and unlimited capacity for high-volume businesses across multiple areas.',
        cta: 'Apply For Free',
        included: [
            'Everything in Professional',
            'Unlimited enquiries per month',
            'Featured placement above standard results',
            'Up to 6 service zone coverage areas',
            'Unlimited photo gallery',
            'Multi-trade profile support',
            'Full enquiry history and conversion analytics',
            'Early access to new features',
            'Dedicated account support and onboarding',
            'Custom profile highlights and positioning',
            'Priority review verification',
            'Co-marketing in homeowner communications',
        ],
        notIncluded: [],
    },
];

function PlanCard({ plan }: { plan: Plan }) {
    return (
        <div
            className={`relative flex flex-col rounded-2xl p-6 transition-shadow sm:p-7 ${
                plan.featured
                    ? 'border-2 border-[#C45C3A] bg-white shadow-[0_8px_30px_rgba(196,92,58,0.18)]'
                    : 'border border-[#E8E4DD] bg-white shadow-sm hover:shadow-md'
            }`}
        >
            {plan.featured ? (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#C45C3A] px-3.5 py-1 text-xs font-bold text-white">
                    Most Popular
                </div>
            ) : null}

            <div className="mb-5">
                <p className="text-sm font-semibold uppercase tracking-widest text-[#2F3E4E]/45">
                    {plan.name}
                </p>
                <div className="mt-3 flex items-end gap-1">
                    <span className="font-[family-name:var(--font-playfair)] text-4xl font-bold text-[#1C2B3A]">
                        R{plan.price.toLocaleString()}
                    </span>
                    <span className="mb-1.5 text-sm text-[#2F3E4E]/45">/ month</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#2F3E4E]/65">{plan.description}</p>
            </div>

            <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#1C2B3A]/50">
                    Included
                </p>
                <ul className="space-y-2.5">
                    {plan.included.map((f) => (
                        <li
                            key={f}
                            className="flex items-start gap-2 text-sm text-[#2F3E4E]/75"
                        >
                            <CheckCircle
                                className="mt-0.5 h-4 w-4 shrink-0 text-[#6B8F71]"
                                strokeWidth={1.75}
                            />
                            {f}
                        </li>
                    ))}
                </ul>
            </div>

            {plan.notIncluded.length > 0 ? (
                <div className="mt-5 border-t border-[#E8E4DD] pt-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#1C2B3A]/45">
                        Not in this tier
                    </p>
                    <ul className="space-y-1.5">
                        {plan.notIncluded.map((f) => (
                            <li
                                key={f}
                                className="text-xs text-[#2F3E4E]/45"
                            >
                                · {f}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <Link
                href="/contractors/network"
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
        <section id="pricing" className="scroll-mt-20 bg-[#FAFAF8] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-14 max-w-3xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                        Pricing
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Simple, Honest Pricing
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-[#2F3E4E]/75">
                        Free while we build the network. Paid plans roll out once founding volume is stable.
                        Founding providers get at least 30 days&rsquo; written notice before any billing starts —
                        and you&rsquo;ll need to opt in, no automatic upgrades.
                    </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-3">
                    {PLANS.map((plan) => (
                        <PlanCard key={plan.name} plan={plan} />
                    ))}
                </div>

                <p className="mt-10 text-center text-sm text-[#2F3E4E]/55">
                    All plans are free during the founding phase. No credit card required to apply or maintain a
                    profile during this period.
                </p>
            </div>
        </section>
    );
}
