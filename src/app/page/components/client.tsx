'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { StartDiagnosisButton } from '@/app/page/components/start-diagnosis-button';
import { LandingHeader } from '@/components/landing-header';
import { Placeholder } from '@/components/placeholder';
import { Button } from '@/components/ui/button';

const HOW_IT_WORKS = [
    {
        title: 'Capture the issue',
        body: 'Take a clear photo and add short context in plain language so the model can interpret what is happening with stronger confidence. You do not need technical wording to get started, and you can describe the issue naturally the way you would explain it to another person at home.',
        label: 'Homeowner uploading fault image',
    },
    {
        title: 'Receive a structured diagnosis',
        body: 'Mendr generates a clear starting-point report with likely issue context, scope cues, and practical next steps that are easier to act on. This gives you a stronger baseline understanding before you call providers, so conversations start with more precision and less confusion.',
        label: 'Diagnosis report screen',
    },
    {
        title: 'Share and choose with confidence',
        body: 'Share the same report context with providers so conversations are clearer and easier to compare. You stay in control of who can access your report.',
        label: 'Provider list with share action',
    },
];

const BENTO_POINTS = [
    { title: 'Understand The Issue Earlier', body: 'Get useful context before making calls so you are not starting from zero.', span: 'lg:col-span-2' },
    { title: 'Reduce Guesswork', body: 'Move from uncertainty to a clearer picture of what may be wrong.', span: 'lg:col-span-2' },
    { title: 'Speak To Providers Better', body: 'Share one report instead of explaining the issue repeatedly.', span: 'lg:col-span-1' },
    { title: 'Compare Quotes More Fairly', body: 'When providers work from the same context, comparisons become cleaner.', span: 'lg:col-span-1' },
    { title: 'Save Time On Back-And-Forth', body: 'Spend less time clarifying details and more time deciding what to do next.', span: 'lg:col-span-1' },
    { title: 'Keep Control Of Your Data', body: 'Your report remains private by default and sharing is always your choice.', span: 'lg:col-span-1' },
    { title: 'Make Better Decisions', body: 'A better understanding up front usually leads to better decisions later.', span: 'lg:col-span-2' },
    { title: 'Designed For Real Homeowner Workflows', body: 'Built around how homeowners actually find help in the real world.', span: 'lg:col-span-2' },
];

const FAQS = [
    {
        q: 'Is the Mendr report really free?',
        a: 'Yes. Mendr report generation is currently free for homeowners. You only pay a provider if you decide to proceed with work.',
    },
    {
        q: 'How accurate is the diagnosis?',
        a: 'Mendr provides a strong starting point from your photo and context. It does not replace an on-site inspection, but it improves pre-visit clarity.',
    },
    {
        q: 'Can I share the report with multiple providers?',
        a: 'Yes. Sharing with multiple providers is encouraged because it helps you compare responses and quote scope on a common understanding.',
    },
    {
        q: 'How are providers recommended?',
        a: 'Recommendrtions are based on diagnosis-to-service relevance, location fit, and provider profile quality signals.',
    },
    {
        q: 'Do you guarantee provider work quality?',
        a: 'No. Mendr is a decision-support platform and does not guarantee third-party workmanship.',
    },
    {
        q: 'What services does Mendr support?',
        a: 'Mendr supports multiple home maintenance categories. The active services list updates as backend coverage changes.',
    },
    {
        q: 'Is my report private?',
        a: 'Yes. Reports are private by default and are only shared when you explicitly choose to share them.',
    },
    {
        q: 'Can I contact Mendr directly?',
        a: 'Yes. You can message us from the contact form for homeowner, provider, or partnership questions.',
    },
];

const SOCIAL_LINKS = [
    { href: 'https://x.com/', label: 'X', icon: Twitter },
    { href: 'https://www.linkedin.com/', label: 'LinkedIn', icon: Linkedin },
    { href: 'https://www.instagram.com/', label: 'Instagram', icon: Instagram },
    { href: 'https://www.facebook.com/', label: 'Facebook', icon: Facebook },
] as const;

export function HomeMarketingPageClient() {
    const [openFaq, setOpenFaq] = useState<string | null>(FAQS[0]?.q ?? null);

    return (
        <MotionConfig reducedMotion="never">
            <div className="flex min-h-screen flex-col bg-background">
                <LandingHeader
                    navLinks={[
                        { href: '#how-it-works', label: 'How It Works' },
                        { href: '#value', label: 'Why Mendr' },
                        { href: '/contact', label: 'Contact' },
                        { href: '#faq', label: 'FAQ' },
                        { href: '/contractors', label: 'For Pros' },
                    ]}
                    logoHref="/"
                    showTrades={false}
                />

                <main className="flex-1">
                    <section className="relative overflow-hidden">
                        <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(circle, var(--foreground) 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.027 }} />
                        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
                            <div className="grid items-center gap-12 lg:grid-cols-[3fr_2fr]">
                                <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
                                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                                        Something Broken At Home? Diagnose It Before Calling Anyone.
                                    </h1>
                                    <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                                        Upload a photo, get a clearer understanding of what is likely happening, and make a better decision before speaking to providers.
                                    </p>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                        <StartDiagnosisButton size="lg">Generate Free Mendr Report</StartDiagnosisButton>
                                        <Button variant="ghost" className="h-10 text-sm" asChild>
                                            <Link href="#how-it-works">How Mendr works</Link>
                                        </Button>
                                    </div>
                                    <p className="text-sm text-muted-foreground">Free report · No account required</p>
                                </div>
                                <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }} className="mx-auto w-full max-w-[360px]">
                                    <Placeholder label="" aspectRatio="aspect-[9/16]" className="w-full rounded-xl" />
                                </motion.div>
                            </div>
                        </div>
                    </section>

                    <section className="bg-foreground py-14 sm:py-20">
                        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
                            <p className="text-2xl font-semibold text-background sm:text-3xl">Most homeowners do not know what is actually wrong.</p>
                            <p className="mt-3 text-base text-background/80 sm:text-lg">That uncertainty leads to unclear quotes, repeated explanations, and wasted call-outs.</p>
                            <p className="mt-3 text-base text-background sm:text-lg">Mendr gives you a clearer starting point before the first call.</p>
                        </div>
                    </section>

                    <section id="how-it-works" className="scroll-mt-16 py-16 sm:py-20">
                        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                            <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
                                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How Mendr Works</h2>
                                <p className="mt-3 text-base text-muted-foreground">
                                    Three practical steps to understand your issue and take action with confidence.
                                </p>
                            </div>
                            <div className="space-y-14 sm:space-y-16">
                                {HOW_IT_WORKS.map(({ title, body, label }, idx) => (
                                    <motion.div key={title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-64px' }} className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10">
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

                    <section id="value" className="scroll-mt-16 bg-muted/30 py-16 sm:py-20">
                        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                            <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
                                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why Homeowners Use Mendr</h2>
                                <p className="mt-3 text-base text-muted-foreground">
                                    Mendr is built to empower homeowners to better understand maintenance issues before speaking to anyone, so each decision starts from stronger context.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                                {BENTO_POINTS.map((item) => (
                                    <div key={item.title} className={['rounded-xl border border-border/50 bg-background p-4 sm:p-5 flex flex-col', item.span].join(' ')}>
                                        <div className="mb-3 overflow-hidden rounded-lg bg-secondary/50">
                                            <Placeholder label="" aspectRatio="aspect-video" className="w-full" />
                                        </div>
                                        <h3 className="text-base font-semibold text-foreground sm:text-lg">{item.title}</h3>
                                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground flex-1">{item.body}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section id="faq" className="scroll-mt-16 py-16 sm:py-20">
                        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                            <div className="mb-10 text-center sm:mb-12">
                                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Frequently Asked Questions</h2>
                            </div>
                            <div className="mx-auto divide-y divide-border/50">
                                {FAQS.map(({ q, a }) => (
                                    <div key={q} className="py-4">
                                        <button onClick={() => setOpenFaq(openFaq === q ? null : q)} className="flex w-full items-center justify-between gap-4 text-left">
                                            <h3 className="text-base font-semibold text-foreground">{q}</h3>
                                            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${openFaq === q ? 'rotate-180' : ''}`} />
                                        </button>
                                        <AnimatePresence initial={false}>
                                            {openFaq === q && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeInOut' }} className="overflow-hidden">
                                                    <p className="mt-3 pb-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="bg-[#0D0D0D] py-20 sm:py-24">
                        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
                            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                                Find Out What Is Likely Wrong Before You Pay For Call-Outs.
                            </h2>
                            <p className="mt-3 text-base text-white/70">
                                Free. Fast. Built For Homeowners.
                            </p>
                            <div className="mt-6">
                                <Button asChild size="lg" className="bg-white font-medium text-black hover:bg-white/90">
                                    <Link href="/start">Generate Free Mendr Report</Link>
                                </Button>
                            </div>
                        </div>
                    </section>
                </main>

                <footer className="border-t border-border/50 bg-background py-12">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="grid gap-10 lg:grid-cols-[2fr_1fr_1fr]">
                            <div>
                                <p className="text-base font-semibold text-foreground">Mendr</p>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                    Home maintenance diagnosis and smarter provider matching, built to reduce uncertainty before repair work begins.
                                </p>
                                <div className="mt-4 flex items-center gap-2">
                                    {SOCIAL_LINKS.map(({ href, label, icon: Icon }) => (
                                        <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground">
                                            <Icon className="h-4 w-4" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Explore</p>
                                <nav className="mt-3 flex flex-col gap-2">
                                    {([['How It Works', '#how-it-works'], ['Why Mendr', '#value'], ['FAQ', '#faq']] as [string, string][]).map(([label, href]) => (
                                        <Link key={`${label}-${href}`} href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                                            {label}
                                        </Link>
                                    ))}
                                </nav>
                            </div>
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Company</p>
                                <nav className="mt-3 flex flex-col gap-2">
                                    {([['Contact', '/contact'], ['For Providers', '/contractors'], ['Privacy Policy', '/privacy'], ['Terms Of Service', '/terms']] as [string, string][]).map(([label, href]) => (
                                        <Link key={`${label}-${href}`} href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                                            {label}
                                        </Link>
                                    ))}
                                </nav>
                            </div>
                        </div>
                        <div className="mt-10 border-t border-border/50 pt-6">
                            <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Mendr. All Rights Reserved.</p>
                        </div>
                    </div>
                </footer>
            </div>
        </MotionConfig>
    );
}
