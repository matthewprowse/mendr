import Link from 'next/link';
import { Camera, FileText, MessageSquare } from 'lucide-react';

/**
 * Per brief Section 1.3 — How Mendr Works.
 * Three step blocks stacked vertically. Alternating two-column layout per row.
 * Stacks fully on mobile, image above text. Each step has step indicator, title, body.
 * Step 2 also has a disclosure callout below the body.
 */

type Step = {
    num: string;
    title: string;
    body: string;
    alt: string;
    icon: typeof Camera;
    disclosure?: string;
};

const STEPS: Step[] = [
    {
        num: '01',
        title: 'Take a photo and tell us what you’re seeing',
        body:
            'Use your phone to take a photo of the problem. Two or three angles is better than one, but even one photo works. Then describe what you’re seeing in your own words — no technical knowledge needed. You can mention things like “this just started today” or “it happens after the geyser kicks in.” All of that helps.',
        alt: 'Mendr upload screen on a phone, with a homeowner adding a photo of a damp patch.',
        icon: Camera,
    },
    {
        num: '02',
        title: 'Get a written diagnosis in under 60 seconds',
        body:
            'Mendr reads the photo and your description, then writes up a report. You’ll see the likely cause, how serious it might be, a confidence score so you know how sure the diagnosis is, and what typically needs to happen next. It’s not a replacement for a tradesperson coming to look — it’s the structured starting point a good tradesperson would normally have to drag out of you on the phone.',
        alt: 'A completed Mendr diagnosis report shown on a phone, with likely cause, severity, confidence score, and next steps.',
        icon: FileText,
        disclosure:
            'Every report includes: the likely fault, a confidence score, severity guidance, recommended next steps, and the trade you’ll want to call.',
    },
    {
        num: '03',
        title: 'Decide what to do next — on your terms',
        body:
            'Once you have your report, you can do whatever you want with it. Forward it to your usual plumber. Share it with three local pros to compare quotes against the same brief. Or keep it for your records and sit on it for a week. The report belongs to you — it’s private until you choose to share it.',
        alt: 'Mendr provider matches showing three Western Cape providers with ratings, distance, and a share-report button.',
        icon: MessageSquare,
    },
];

function StepVisual({ icon: Icon }: { icon: typeof Camera }) {
    return (
        <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[#E8E4DD] bg-[#1C2B3A] p-1 shadow-lg">
            <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#0F1C2D]">
                <Icon className="h-16 w-16 text-[#C45C3A]/60" strokeWidth={1.25} aria-hidden />
            </div>
        </div>
    );
}

export function Land1HowItWorks() {
    return (
        <section id="how-it-works" className="scroll-mt-20 bg-[#FAFAF8] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-14 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                        How it works
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        How Mendr Works
                    </h2>
                    <p className="mt-4 text-base text-[#2F3E4E]/70">
                        Three steps. About five minutes from photo to report.
                    </p>
                </div>

                <div className="space-y-16 sm:space-y-20">
                    {STEPS.map((step, idx) => {
                        const reverse = idx % 2 === 1;
                        return (
                            <div
                                key={step.num}
                                className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
                            >
                                <div
                                    className={
                                        reverse ? 'order-1 lg:order-2' : 'order-1 lg:order-1'
                                    }
                                >
                                    <StepVisual icon={step.icon} />
                                    <span className="sr-only">{step.alt}</span>
                                </div>
                                <div className={reverse ? 'order-2 lg:order-1' : 'order-2'}>
                                    <span className="text-5xl font-bold text-[#E8E4DD]">
                                        {step.num}
                                    </span>
                                    <h3 className="mt-3 font-[family-name:var(--font-playfair)] text-2xl font-bold text-[#1C2B3A] sm:text-3xl">
                                        {step.title}
                                    </h3>
                                    <p className="mt-4 text-base leading-relaxed text-[#2F3E4E]/75">
                                        {step.body}
                                    </p>
                                    {step.disclosure ? (
                                        <div className="mt-5 rounded-xl border border-[#E8E4DD] bg-white px-5 py-4 text-sm leading-relaxed text-[#2F3E4E]/80">
                                            {step.disclosure}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-16 text-center">
                    <Link
                        href="/start"
                        className="inline-flex items-center gap-2 rounded-xl bg-[#C45C3A] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(196,92,58,0.3)] transition-colors hover:bg-[#A84D30]"
                    >
                        Generate Free Mendr Report
                    </Link>
                </div>
            </div>
        </section>
    );
}
