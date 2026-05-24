/**
 * Canonical pricing source for the public /pricing page.
 *
 * This reflects the contractor subscription strategy documented in
 * `app/docs/strategy/02-contractor-retention-and-pricing.md`.
 *
 * NOTE: a separate pricing component used to live under `src/app/landing2/`
 * with different headline numbers (R249 / R649 / R1,249) — that copy was
 * driven by the marketing brief. The numbers below (R299 / R699 / R1,499)
 * reflect the actual product roadmap and are the canonical source.
 *
 * All prices are VAT-inclusive (legally required for B2C surfaces in SA per
 * the VAT Act).
 */

export type PricingTier = {
    /** Short identifier — Free, Starter, Pro, Business */
    name: string;
    /** Marketing label paired with the name (e.g. "Listed", "Active") */
    label: string;
    /** Monthly price in ZAR, VAT inclusive. 0 for the Free tier. */
    price: number;
    /** Optional annual price in ZAR, VAT inclusive. Omitted for Free. */
    annualPrice?: number;
    /** Saving amount in ZAR when paying annually vs monthly. */
    annualSaving?: number;
    /** One-line "best for" descriptor shown on the card. */
    bestFor: string;
    /** Lead allowance copy (e.g. "3 matched leads / month"). */
    leadCap: string;
    /** Whether this tier is highlighted as the recommended option. */
    featured: boolean;
    /** Optional badge text shown on featured cards. */
    badge?: string;
    /** Headline value proposition (sub-tagline under the price). */
    tagline: string;
    /** Included feature highlights — 4-6 items per tier. */
    included: string[];
    /** CTA label and destination. */
    ctaLabel: string;
    ctaHref: string;
};

/** The four subscription tiers. */
export const PRICING_TIERS: PricingTier[] = [
    {
        name: 'Free',
        label: 'Listed',
        price: 0,
        bestFor: 'New contractors testing the platform',
        leadCap: '3 matched leads / month',
        featured: false,
        tagline: 'Get found. No card required.',
        included: [
            'Profile listing in the Mendr marketplace',
            'Service-area and trade matching',
            'Review collection on your profile',
            'Basic match stats (views and clicks)',
        ],
        ctaLabel: 'Apply now',
        ctaHref: '/contractors/network',
    },
    {
        name: 'Starter',
        label: 'Active',
        price: 299,
        annualPrice: 2990,
        annualSaving: 600,
        bestFor: 'Solo tradespeople running their own business',
        leadCap: '15 matched leads / month',
        featured: false,
        tagline: 'Quote, invoice, and get paid on one rail.',
        included: [
            'Everything in Free',
            'Reusable kit-bundle quoting on mobile',
            'VAT-compliant ZAR invoicing',
            'Yoco, PayFast and Ozow payment integrations',
            'Single-user scheduler with WhatsApp chat mirror',
            'Auto status messages to customers',
        ],
        ctaLabel: 'Apply now',
        ctaHref: '/contractors/network',
    },
    {
        name: 'Pro',
        label: 'Established',
        price: 699,
        annualPrice: 6990,
        annualSaving: 1398,
        bestFor: 'Teams of two to five with growing pipeline',
        leadCap: 'Unlimited leads + ranking boost',
        featured: true,
        badge: 'Most popular',
        tagline: 'Run the whole back office. Win more work.',
        included: [
            'Everything in Starter',
            'Multi-technician scheduling (up to 5 seats)',
            'Escrow on marketplace jobs and card-on-file',
            'Recurring service plans and auto-chase on overdue invoices',
            'Branded quote templates, Xero and VAT201 bridge',
            'Google Calendar sync, audit log and CRM with CLV',
        ],
        ctaLabel: 'Apply now',
        ctaHref: '/contractors/network',
    },
    {
        name: 'Business',
        label: 'Scaled',
        price: 1499,
        annualPrice: 14990,
        annualSaving: 2998,
        bestFor: 'Multi-trade operations of five or more',
        leadCap: 'Unlimited leads + priority placement',
        featured: false,
        tagline: 'Strategic visibility. Year-over-year clarity.',
        included: [
            'Everything in Pro',
            'Unlimited team seats and sub-contractor roster',
            'Profitability reports with year-over-year trends',
            'Inbound call recording attached to each job',
            'Consumer financing on jobs over R5,000',
            'Multi-language customer surfaces and load-shedding-aware scheduling',
        ],
        ctaLabel: 'Apply now',
        ctaHref: '/contractors/network',
    },
];

export type PricingAddOn = {
    name: string;
    price: number;
    tagline: string;
    description: string;
    included: string[];
    ctaLabel: string;
    ctaHref: string;
};

/**
 * Verified add-on — orthogonal to the four tiers. Attaches to any paid plan.
 */
export const VERIFIED_ADD_ON: PricingAddOn = {
    name: 'Verified',
    price: 400,
    tagline: 'Live compliance verification and the Mendr Verified badge.',
    description:
        'Attach to any paid tier. We keep your CIDB, NHBRC and Public Liability cover continuously verified — and surface the Mendr Verified badge prominently in homeowner matches.',
    included: [
        'Live CIDB registration verification',
        'Live NHBRC registration verification',
        'Public Liability cover validity tracking',
        'Mendr Verified badge in marketplace matches',
    ],
    ctaLabel: 'Apply now',
    ctaHref: '/contractors/network',
};

export type PricingFaq = { q: string; a: string };

export const PRICING_FAQS: PricingFaq[] = [
    {
        q: 'Why don’t you charge a commission on jobs?',
        a: 'We make our money on subscriptions, not by taking a slice of your work. Every rand you earn from a Mendr lead is yours to keep, whether the job is R500 or R50,000. Snupit, Handy and SweepSouth all built businesses on commission. We deliberately have not — because contractors are weary of paying every time they quote.',
    },
    {
        q: 'Why does the Free tier cap leads at three per month?',
        a: 'Because an uncapped Free tier would degrade the quality of the marketplace for everyone. The cap is set so a new contractor can sample the platform without paying, then upgrade when the lead flow becomes meaningful to their business. We gate on volume, not features — every contractor sees a fair number of matches before any paywall fires.',
    },
    {
        q: 'When do the paid plans actually start?',
        a: 'Not yet. We are currently in the founding phase, which means every tier is unlocked at no cost. Paid plans will roll out once homeowner volume is stable and predictable across the Western Cape. Founding contractors get a minimum of thirty days’ written notice before any billing begins, and contracts at favourable terms locked for the launch cohort. There will be no automatic charge — you will always confirm a plan first.',
    },
    {
        q: 'Can I upgrade or downgrade later?',
        a: 'Yes, at any time and pro-rated. If you move from Starter to Pro mid-month, we charge the prorated difference for the days remaining. If you downgrade, you keep the higher tier features until the end of your current billing period and switch at renewal. There are no annual lock-ins on the monthly plans.',
    },
    {
        q: 'Do I need a credit card to sign up?',
        a: 'No. The Free tier needs nothing more than an approved profile — no card, no commitment, no automatic upgrade. You only add a payment method when you choose to move to a paid tier yourself.',
    },
];
