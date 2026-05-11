'use client';

/**
 * Route: /landing1
 * Homeowner marketing landing page — v4
 *
 * Rules:
 * - Title Case all headings, no em dashes, no icons inside buttons
 * - Font sizes from Figma spec (explicit px values)
 * - No placeholder descriptive text inside visual boxes
 * - Trades fetched from Supabase services table, fallback to SERVICE_LABELS
 * - Contact form inline (contact page deleted)
 */

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { ContactForm } from '@/components/contact-form';
import { SERVICE_LABELS } from '@/lib/services';
import { getSupabase } from '@/lib/supabase';
import {
    Zap,
    Droplets,
    ShieldCheck,
    HardHat,
    Hammer,
    Grid2X2,
    Wrench,
    KeyRound,
    Paintbrush,
    Waves,
    Trash2,
    Flame,
    FileText,
    DollarSign,
    AlertTriangle,
    MessageSquare,
    CheckCircle2,
    XCircle,
} from 'lucide-react';

// ── Design tokens ──────────────────────────────────────────────────────────────

const INK = '#131312';
const INK_2 = '#6B6B6B';
const CANVAS = '#FAFAFA';
const SURFACE = '#FFFFFF';
const LINE = '#EBEBEB';
const LIME = '#DCF763';
const DARK_BORDER = '#2A2A28';
const DARK_CARD = '#1C1C1A';

// ── Trade icon map ─────────────────────────────────────────────────────────────

const TRADE_ICONS: Record<string, React.ElementType> = {
    Electrical: Zap,
    Plumbing: Droplets,
    Security: ShieldCheck,
    'Building & Construction': HardHat,
    'Carpentry & Woodwork': Hammer,
    'Flooring & Tiling': Grid2X2,
    'General Handyman': Wrench,
    'Locksmith Services': KeyRound,
    Painting: Paintbrush,
    'Pool Maintenance': Waves,
    'Rubble & Waste Removal': Trash2,
    Welding: Flame,
};

// ── Stats (replace with real values before launch) ────────────────────────────

const STATS = [
    { value: '1,200+', label: 'Diagnoses Completed' },
    { value: '48', label: 'Registered Contractors' },
    { value: '12', label: 'Trade Categories' },
    { value: '<60s', label: 'Avg. Diagnosis Time' },
];

// ── Problem comparison ────────────────────────────────────────────────────────

const WITHOUT = [
    'Call contractors without knowing what is wrong',
    'Describe symptoms without the right terminology',
    'Receive quotes with no reference point',
    'Pay without knowing if the price is reasonable',
];

const WITH = [
    'Know the fault name, cause, and severity before calling',
    'Be matched with the correct trade automatically',
    'Have a cost estimate before the first quote arrives',
    'Arrive at every contractor conversation informed',
];

// ── How It Works ──────────────────────────────────────────────────────────────

const STEPS = [
    {
        n: '01',
        heading: 'Describe the Fault',
        body: "Tell us what is happening. A damp patch on the ceiling, a tripping breaker, a leaking pipe, a gate that won't open. Add a photo if you have one. No technical knowledge needed.",
        flip: false,
    },
    {
        n: '02',
        heading: 'Receive Your Diagnosis',
        body: 'Menda analyses your description and photo and returns a written report: the fault name, likely cause, a repair cost estimate, urgency level, and which trade you need.',
        flip: true,
    },
    {
        n: '03',
        heading: 'Find the Right Contractor',
        body: 'We match you with contractors in your area who specialise in exactly the trade your fault requires. They receive your diagnosis with your enquiry, so no explanation is needed.',
        flip: false,
    },
] as const;

// ── What a diagnosis returns ───────────────────────────────────────────────────

const DIAGNOSIS_OUTPUTS = [
    {
        icon: FileText,
        heading: 'Fault Name and Category',
        body: 'The specific fault identified and its trade category.',
    },
    {
        icon: Zap,
        heading: 'Likely Cause',
        body: 'What is causing the fault, explained in plain language.',
    },
    {
        icon: AlertTriangle,
        heading: 'Severity Level',
        body: 'Safe to monitor, attend within 48 hours, or urgent.',
    },
    {
        icon: DollarSign,
        heading: 'Repair Cost Estimate',
        body: 'A realistic cost range in Rands based on Western Cape contractor rates.',
    },
    {
        icon: Wrench,
        heading: 'Recommended Trade',
        body: 'The specific trade required for your exact fault type.',
    },
    {
        icon: MessageSquare,
        heading: 'What to Tell the Contractor',
        body: 'A prepared script so your first call is direct and efficient.',
    },
];

// ── Value props (inside lime section) ─────────────────────────────────────────

const VALUE_PROPS = [
    {
        n: '01',
        heading: 'Written Diagnosis Report',
        body: 'Fault identified by name. Likely cause explained. Trade specified. Saved and shareable.',
    },
    {
        n: '02',
        heading: 'Repair Cost Estimate',
        body: 'A realistic cost range before anyone quotes you, based on Western Cape contractor rates.',
    },
    {
        n: '03',
        heading: 'Matched Contractor',
        body: 'Contractors in your area who cover your specific fault type, with your diagnosis attached.',
    },
    {
        n: '04',
        heading: 'No Account Required',
        body: 'Start, receive your full report, and contact a contractor without signing up.',
    },
];

// ── FAQ ────────────────────────────────────────────────────────────────────────

const FAQ = [
    {
        q: 'How Does Menda Diagnose My Fault?',
        a: "Menda uses an AI model trained on South African home maintenance faults. You describe the problem and upload a photo. The AI analyses both and identifies the most likely fault, its probable cause, a repair cost estimate, the trade required, and the severity level. The whole process runs in under 60 seconds. You do not need to know what is wrong before you start — that is the point.",
    },
    {
        q: 'How Accurate Are the Diagnoses?',
        a: "Accuracy depends on the quality of the description and photo. A clear description of what you are seeing combined with a focused photo of the affected area produces a reliable diagnosis. Menda is trained on Western Cape fault patterns, so it accounts for local conditions like damp, load shedding damage, and ageing infrastructure. The diagnosis is a structured starting point, not a substitute for an on-site assessment, but it gives you enough to walk into any contractor conversation prepared.",
    },
    {
        q: 'What Does the Repair Cost Estimate Cover?',
        a: 'The cost estimate is a realistic range in South African Rands for the repair described in the diagnosis. It is based on typical contractor rates in the Western Cape for the fault type identified. It covers parts and labour for the standard repair and does not include call-out fees, which vary by contractor and area. Use it as a reference when evaluating quotes.',
    },
    {
        q: 'How Are Contractors Matched to My Diagnosis?',
        a: 'When your diagnosis is complete, Menda matches you with contractors in your area who are registered for the trade your fault requires. Each contractor on the platform has specified their trade category, the areas they cover, and their availability. Your diagnosis is shared with them when you make contact, so they already know what the job involves before they respond.',
    },
    {
        q: 'Can I Share My Diagnosis with Any Contractor?',
        a: 'Yes. Your diagnosis is saved and accessible via a link. You can share it with any contractor, whether they are on the Menda platform or not. Contractors who receive a diagnosis link before a site visit arrive better prepared, which typically results in faster and more accurate quotes.',
    },
    {
        q: 'What If My Fault Is Urgent or Dangerous?',
        a: 'Every diagnosis includes a severity level. If the fault is flagged as urgent — a gas leak, exposed live wiring, a burst water main, or structural risk — call the relevant emergency service immediately. For non-emergency urgent faults, matched contractors can be contacted directly from the results page without delay. No account or sign-in is required at any point.',
    },
    {
        q: 'What Happens to My Photos and Information?',
        a: 'Your photos and description are used only to generate your diagnosis. Menda does not sell your personal data or share it with contractors without your consent. Read our privacy policy for the full details on how data is stored and handled under POPIA.',
    },
    {
        q: 'What If No Contractor Is Available in My Area?',
        a: 'The contractor network is actively growing. If no match is available for your exact area and trade, your diagnosis report still stands. You can share it with any local contractor you find independently. The report gives them the information they need to quote accurately, regardless of whether they are registered on Menda.',
    },
    {
        q: 'Which Areas Do You Cover?',
        a: 'Menda currently serves homeowners in the Western Cape, South Africa. The contractor network covers the greater Cape Town metro area, including the City Bowl, Southern Suburbs, Northern Suburbs, West Coast, and the Winelands. Expansion to other provinces is planned for 2026.',
    },
];

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
    children,
    id,
    bg = CANVAS,
    className = '',
}: {
    children: React.ReactNode;
    id?: string;
    bg?: string;
    className?: string;
}) {
    return (
        <section
            id={id}
            className={`w-full px-5 py-14 md:px-10 md:py-16 lg:px-24 lg:py-24 ${className}`}
            style={{ background: bg }}
        >
            {children}
        </section>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function Landing1Client() {
    // Fetch trade labels from Supabase services table — falls back to SERVICE_LABELS
    const [tradeLabels, setTradeLabels] = useState<readonly string[]>(SERVICE_LABELS);

    useEffect(() => {
        const load = async () => {
            try {
                const sb = getSupabase();
                const { data, error } = await (sb as any)
                    .from('services')
                    .select('label')
                    .order('label');
                if (!error && Array.isArray(data) && data.length > 0) {
                    setTradeLabels(data.map((s: { label: string }) => s.label));
                }
            } catch {
                // Stays on SERVICE_LABELS fallback
            }
        };
        void load();
    }, []);

    // Double array for seamless CSS marquee loop
    const marqueeItems = [...tradeLabels, ...tradeLabels];

    return (
        <div className="min-h-screen antialiased" style={{ background: CANVAS, color: INK }}>

            {/* CSS marquee keyframes */}
            <style>{`
                @keyframes trade-scroll { to { transform: translateX(-50%); } }
                .trade-marquee {
                    display: flex;
                    animation: trade-scroll 32s linear infinite;
                    will-change: transform;
                }
                .trade-marquee:hover { animation-play-state: paused; }
            `}</style>

            {/* ── Nav ───────────────────────────────────────────────────────── */}
            <header
                className="sticky top-0 z-50 border-b"
                style={{ background: SURFACE, borderColor: LINE }}
            >
                <div className="flex h-[72px] items-center justify-between px-5 md:px-10 lg:px-24">
                    <Link
                        href="/"
                        className="w-[136px] text-xl font-semibold leading-8"
                        style={{ color: INK }}
                    >
                        Menda
                    </Link>

                    <nav
                        className="hidden items-center gap-6 md:flex"
                        style={{ color: 'rgba(0,0,0,0.50)', fontSize: '14px' }}
                    >
                        <a href="#how-it-works" className="transition-colors hover:text-black">
                            How It Works
                        </a>
                        <a href="#what-you-get" className="transition-colors hover:text-black">
                            What You Get
                        </a>
                        <a href="#contact" className="transition-colors hover:text-black">
                            Contact
                        </a>
                        <a href="#faq" className="transition-colors hover:text-black">
                            FAQs
                        </a>
                        <Link href="/contractors" className="transition-colors hover:text-black">
                            For Pros
                        </Link>
                    </nav>

                    <Button asChild size="lg" className="rounded-[4px]">
                        <Link href="/start">Get Diagnosis</Link>
                    </Button>
                </div>
            </header>

            {/* ── Hero ──────────────────────────────────────────────────────── */}
            <section
                className="flex items-center px-5 py-16 md:px-10 md:py-[72px] lg:min-h-[936px] lg:px-24 lg:py-[72px]"
                style={{ background: CANVAS }}
            >
                <div className="flex w-full items-center gap-6">
                    {/* Copy */}
                    <div className="flex flex-1 flex-col justify-center gap-6">
                        <h1
                            className="text-[2.5rem] font-semibold leading-[1.2] lg:text-[48px] lg:leading-[64px]"
                            style={{ color: 'black' }}
                        >
                            Know What's Wrong Before Calling Anyone
                        </h1>
                        <p
                            className="max-w-md"
                            style={{ color: INK_2, fontSize: '16px', lineHeight: '24px' }}
                        >
                            Upload a photo of any home fault. Receive a written diagnosis in
                            under 60 seconds, including a repair cost estimate and a matched
                            contractor in the Western Cape.
                        </p>
                        <div className="flex flex-col gap-2 pt-2">
                            <Button asChild size="xl" className="w-fit rounded-[4px]">
                                <Link href="/start">Get Your Diagnosis</Link>
                            </Button>
                            <p style={{ color: INK_2, fontSize: '14px' }}>
                                Free. No account required.
                            </p>
                        </div>
                    </div>

                    {/* Right: clean grey box — matches Figma spec */}
                    <div className="hidden flex-1 self-stretch px-24 lg:flex lg:flex-col">
                        <div
                            className="h-full min-h-[600px] rounded-lg"
                            style={{ background: '#F2F2F0' }}
                        />
                    </div>
                </div>
            </section>

            {/* ── Stats ─────────────────────────────────────────────────────── */}
            <div
                className="px-5 py-12 md:px-10 lg:px-24"
                style={{ background: INK }}
            >
                <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                    {STATS.map((s) => (
                        <div
                            key={s.label}
                            className="flex flex-col items-center justify-center rounded-lg p-6 text-center"
                            style={{
                                background: 'rgba(107,107,107,0.10)',
                                outline: '1px solid rgba(107,107,107,0.25)',
                                outlineOffset: '-1px',
                            }}
                        >
                            <span
                                className="font-medium"
                                style={{ color: LIME, fontSize: '54px', lineHeight: '86px' }}
                            >
                                {s.value}
                            </span>
                            <span
                                className="font-medium"
                                style={{ color: '#F2F2F0', fontSize: '16px' }}
                            >
                                {s.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── The Problem We Solve ──────────────────────────────────────── */}
            <Section bg={SURFACE}>
                <div className="flex flex-col gap-10">
                    <div className="flex flex-col gap-3">
                        <h2
                            className="font-semibold"
                            style={{ color: INK, fontSize: '36px', lineHeight: '60px' }}
                        >
                            The Problem We Solve
                        </h2>
                        <p
                            className="max-w-xl"
                            style={{ color: INK_2, fontSize: '16px', lineHeight: '24px' }}
                        >
                            Most homeowners call the first contractor they find. Without knowing
                            what is wrong, what the repair should cost, or whether that trade is
                            even the right one for the job.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {/* Without Menda */}
                        <div
                            className="flex flex-col gap-5 rounded-xl border p-6"
                            style={{ borderColor: LINE, background: CANVAS }}
                        >
                            <p
                                className="font-semibold uppercase tracking-widest"
                                style={{ color: INK_2, fontSize: '12px' }}
                            >
                                Without Menda
                            </p>
                            <div className="flex flex-col gap-3">
                                {WITHOUT.map((item) => (
                                    <div key={item} className="flex items-start gap-3">
                                        <XCircle
                                            size={15}
                                            className="mt-0.5 shrink-0"
                                            style={{ color: '#C53030' }}
                                        />
                                        <span
                                            style={{ color: INK_2, fontSize: '14px', lineHeight: '24px' }}
                                        >
                                            {item}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* With Menda */}
                        <div
                            className="flex flex-col gap-5 rounded-xl border p-6"
                            style={{ borderColor: LIME, background: CANVAS }}
                        >
                            <p
                                className="font-semibold uppercase tracking-widest"
                                style={{ color: INK, fontSize: '12px' }}
                            >
                                With Menda
                            </p>
                            <div className="flex flex-col gap-3">
                                {WITH.map((item) => (
                                    <div key={item} className="flex items-start gap-3">
                                        <CheckCircle2
                                            size={15}
                                            className="mt-0.5 shrink-0"
                                            style={{ color: '#5C7A00' }}
                                        />
                                        <span
                                            style={{ color: INK, fontSize: '14px', lineHeight: '24px' }}
                                        >
                                            {item}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── How It Works ──────────────────────────────────────────────── */}
            <Section id="how-it-works" bg={CANVAS}>
                <div className="flex flex-col gap-12">
                    <div className="flex flex-col gap-3">
                        <h2
                            className="font-semibold"
                            style={{ color: INK, fontSize: '36px', lineHeight: '60px' }}
                        >
                            How It Works
                        </h2>
                        <p
                            className="max-w-xl"
                            style={{ color: INK_2, fontSize: '16px', lineHeight: '24px' }}
                        >
                            Three steps from a photo to a written diagnosis and a matched
                            contractor. Under 60 seconds.
                        </p>
                    </div>

                    <div className="flex flex-col gap-16">
                        {STEPS.map((step) => (
                            <div
                                key={step.n}
                                className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-6"
                            >
                                {/* Copy */}
                                <div
                                    className={`flex flex-1 flex-col ${step.flip ? 'lg:order-2' : 'lg:order-1'}`}
                                >
                                    <span
                                        className="select-none font-semibold"
                                        style={{
                                            color: 'rgba(107,107,107,0.15)',
                                            fontSize: '96px',
                                            lineHeight: '164px',
                                        }}
                                    >
                                        {step.n}
                                    </span>
                                    <div className="flex flex-col gap-2">
                                        <h3
                                            className="font-semibold"
                                            style={{ color: 'black', fontSize: '24px', lineHeight: '40px' }}
                                        >
                                            {step.heading}
                                        </h3>
                                        <p
                                            style={{ color: INK_2, fontSize: '16px', lineHeight: '24px' }}
                                        >
                                            {step.body}
                                        </p>
                                    </div>
                                </div>

                                {/* Empty box — screenshot goes here */}
                                <div
                                    className={`flex-1 overflow-hidden rounded-lg border ${step.flip ? 'lg:order-1' : 'lg:order-2'}`}
                                    style={{
                                        height: '396px',
                                        background: SURFACE,
                                        borderColor: LINE,
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </Section>

            {/* ── What Your Diagnosis Includes ──────────────────────────────── */}
            <Section bg={SURFACE}>
                <div className="flex flex-col gap-10">
                    <div className="flex flex-col gap-3">
                        <h2
                            className="font-semibold"
                            style={{ color: INK, fontSize: '36px', lineHeight: '60px' }}
                        >
                            What Your Diagnosis Includes
                        </h2>
                        <p
                            className="max-w-xl"
                            style={{ color: INK_2, fontSize: '16px', lineHeight: '24px' }}
                        >
                            Every diagnosis returns six structured outputs. Clear and specific
                            to your fault.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {DIAGNOSIS_OUTPUTS.map(({ icon: Icon, heading, body }) => (
                            <div
                                key={heading}
                                className="flex flex-col gap-4 rounded-xl border p-6"
                                style={{ borderColor: LINE, background: CANVAS }}
                            >
                                <span
                                    className="flex h-9 w-9 items-center justify-center rounded-md"
                                    style={{ background: LIME }}
                                >
                                    <Icon size={15} style={{ color: INK }} />
                                </span>
                                <div className="flex flex-col gap-1.5">
                                    <h3
                                        className="font-semibold"
                                        style={{ color: INK, fontSize: '14px' }}
                                    >
                                        {heading}
                                    </h3>
                                    <p style={{ color: INK_2, fontSize: '14px', lineHeight: '22px' }}>
                                        {body}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Section>

            {/* ── Trades Carousel ───────────────────────────────────────────── */}
            <div style={{ background: INK }} className="py-14 lg:py-20">
                <div className="mb-8 px-5 md:px-10 lg:px-24">
                    <h2
                        className="font-semibold"
                        style={{ color: SURFACE, fontSize: '36px', lineHeight: '60px' }}
                    >
                        All 12 Trades Covered.
                    </h2>
                </div>

                {/* Marquee track */}
                <div className="relative overflow-hidden">
                    {/* Fade edges */}
                    <div
                        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20"
                        style={{ background: `linear-gradient(to right, ${INK}, transparent)` }}
                    />
                    <div
                        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20"
                        style={{ background: `linear-gradient(to left, ${INK}, transparent)` }}
                    />

                    <div className="trade-marquee gap-3 px-3">
                        {marqueeItems.map((label, i) => {
                            const Icon = TRADE_ICONS[label] ?? Wrench;
                            return (
                                <div
                                    key={`${label}-${i}`}
                                    className="flex shrink-0 items-center gap-2 rounded-lg px-5 py-3"
                                    style={{
                                        background: DARK_CARD,
                                        border: `1px solid ${DARK_BORDER}`,
                                    }}
                                >
                                    <Icon size={14} style={{ color: LIME }} />
                                    <span
                                        className="whitespace-nowrap font-medium"
                                        style={{ color: SURFACE, fontSize: '14px' }}
                                    >
                                        {label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Who You'll Be Matched With + Value Props ──────────────────── */}
            <Section id="what-you-get" bg={LIME}>
                <div className="flex flex-col gap-12">
                    <div className="flex flex-col gap-3 text-center lg:px-24">
                        <h2
                            className="font-semibold"
                            style={{ color: INK, fontSize: '36px', lineHeight: '60px' }}
                        >
                            Who You'll Be Matched With
                        </h2>
                        <p style={{ color: INK_2, fontSize: '16px', lineHeight: '24px' }}>
                            Every contractor on Menda has registered their trade, service area,
                            and availability. When your diagnosis is complete, we find the right
                            match for your specific fault.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {VALUE_PROPS.map((item) => (
                            <div
                                key={item.n}
                                className="flex flex-col gap-4 rounded-xl p-6"
                                style={{
                                    background: CANVAS,
                                    outline: `1px solid ${LINE}`,
                                    outlineOffset: '-1px',
                                }}
                            >
                                <span
                                    className="font-semibold uppercase tracking-widest"
                                    style={{ color: INK_2, fontSize: '12px' }}
                                >
                                    {item.n}
                                </span>
                                <div className="flex flex-col gap-2">
                                    <h3
                                        className="font-semibold"
                                        style={{ color: INK, fontSize: '14px' }}
                                    >
                                        {item.heading}
                                    </h3>
                                    <p
                                        style={{ color: INK_2, fontSize: '14px', lineHeight: '22px' }}
                                    >
                                        {item.body}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Section>

            {/* ── Contact ───────────────────────────────────────────────────── */}
            <Section id="contact" bg={CANVAS}>
                <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start lg:gap-20">
                    <div className="flex flex-col gap-6">
                        <h2
                            className="font-semibold"
                            style={{ color: INK, fontSize: '36px', lineHeight: '60px' }}
                        >
                            Get in Touch
                        </h2>
                        <p style={{ color: INK_2, fontSize: '16px', lineHeight: '24px' }}>
                            Questions about Menda, how it works, or what is covered? Reach out
                            and we will get back to you shortly.
                        </p>
                        <div className="flex flex-col gap-3">
                            {[
                                'General questions about the platform',
                                'Contractor or business enquiries',
                                'Technical issues or feedback',
                                'Partnership opportunities',
                            ].map((item) => (
                                <div key={item} className="flex items-start gap-2.5">
                                    <CheckCircle2
                                        size={15}
                                        className="mt-0.5 shrink-0"
                                        style={{ color: '#5C7A00' }}
                                    />
                                    <span style={{ color: INK, fontSize: '14px', lineHeight: '24px' }}>
                                        {item}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div
                        className="rounded-xl border p-6 md:p-8"
                        style={{ borderColor: LINE, background: SURFACE }}
                    >
                        <ContactForm fieldIdPrefix="landing-contact" subjectMode="select" />
                    </div>
                </div>
            </Section>

            {/* ── FAQ ───────────────────────────────────────────────────────── */}
            <Section id="faq" bg={SURFACE}>
                <div className="mx-auto flex max-w-3xl flex-col gap-10">
                    <h2
                        className="text-center font-semibold"
                        style={{ color: INK, fontSize: '36px', lineHeight: '60px' }}
                    >
                        Common Questions.
                    </h2>

                    <Accordion type="single" collapsible className="flex flex-col gap-2">
                        {FAQ.map((item, i) => (
                            <AccordionItem
                                key={i}
                                value={`faq-${i}`}
                                className="rounded-lg border px-5"
                                style={{ borderColor: LINE, background: CANVAS }}
                            >
                                <AccordionTrigger
                                    className="py-4 text-left font-semibold hover:no-underline"
                                    style={{ color: INK, fontSize: '14px' }}
                                >
                                    {item.q}
                                </AccordionTrigger>
                                <AccordionContent
                                    className="pb-5"
                                    style={{ color: INK_2, fontSize: '14px', lineHeight: '24px' }}
                                >
                                    {item.a}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </Section>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <footer
                className="border-t"
                style={{ borderColor: LINE, background: SURFACE }}
            >
                <div className="flex flex-col gap-5 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-10 lg:px-24">
                    <div className="flex flex-col gap-1">
                        <span
                            className="font-semibold"
                            style={{ color: INK, fontSize: '14px' }}
                        >
                            Menda
                        </span>
                        <p style={{ color: INK_2, fontSize: '12px' }}>
                            Clarity first home diagnostics. Cape Town, South Africa.
                        </p>
                    </div>

                    <nav className="flex flex-wrap gap-x-5 gap-y-2">
                        {[
                            { label: 'For Pros', href: '/contractors' },
                            { label: 'About', href: '/about' },
                            { label: 'Contact', href: '#contact' },
                            { label: 'Privacy', href: '/privacy' },
                            { label: 'Terms', href: '/terms' },
                        ].map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="transition-colors hover:text-[#131312]"
                                style={{ color: INK_2, fontSize: '12px' }}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    <p style={{ color: INK_2, fontSize: '12px' }}>
                        {new Date().getFullYear()} Menda
                    </p>
                </div>
            </footer>
        </div>
    );
}
