import Link from 'next/link';
import { Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';
import { Placeholder } from '@/components/placeholder';
import { Button } from '@/components/ui/button';
import { BENTO_POINTS } from '@/app/page/_components/home-marketing-content';

const SOCIAL_LINKS = [
    { href: 'https://x.com/', label: 'X', icon: Twitter },
    { href: 'https://www.linkedin.com/', label: 'LinkedIn', icon: Linkedin },
    { href: 'https://www.instagram.com/', label: 'Instagram', icon: Instagram },
    { href: 'https://www.facebook.com/', label: 'Facebook', icon: Facebook },
] as const;

export function HomeMarketingProblemSection() {
    return (
        <section className="bg-foreground py-14 sm:py-20">
            <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
                <p className="text-2xl font-semibold text-background sm:text-3xl">
                    Most homeowners do not know what is actually wrong.
                </p>
                <p className="mt-3 text-base text-background/80 sm:text-lg">
                    That uncertainty leads to unclear quotes, repeated explanations, and wasted call-outs.
                </p>
                <p className="mt-3 text-base text-background sm:text-lg">
                    Scandio gives you a clearer starting point before the first call.
                </p>
            </div>
        </section>
    );
}

export function HomeMarketingValueSection() {
    return (
        <section id="value" className="scroll-mt-16 bg-muted/30 py-16 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why Homeowners Use Scandio</h2>
                    <p className="mt-3 text-base text-muted-foreground">
                        Scandio is built to empower homeowners to better understand maintenance issues before speaking to
                        anyone, so each decision starts from stronger context.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                    {BENTO_POINTS.map((item) => (
                        <div
                            key={item.title}
                            className={['rounded-xl border border-border/50 bg-background p-4 sm:p-5 flex flex-col', item.span].join(
                                ' ',
                            )}
                        >
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
    );
}

export function HomeMarketingCtaSection() {
    return (
        <section className="bg-[#0D0D0D] py-20 sm:py-24">
            <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
                <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Find Out What Is Likely Wrong Before You Pay For Call-Outs.
                </h2>
                <p className="mt-3 text-base text-white/70">Free. Fast. Built For Homeowners.</p>
                <div className="mt-6">
                    <Button asChild size="lg" className="bg-white font-medium text-black hover:bg-white/90">
                        <Link href="/welcome">Generate Free Scandio Report</Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}

export function HomeMarketingFooter() {
    return (
        <footer className="border-t border-border/50 bg-background py-12">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid gap-10 lg:grid-cols-[2fr_1fr_1fr]">
                    <div>
                        <p className="text-base font-semibold text-foreground">Scandio</p>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            Home maintenance diagnosis and smarter provider matching, built to reduce uncertainty before
                            repair work begins.
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                            {SOCIAL_LINKS.map(({ href, label, icon: Icon }) => (
                                <a
                                    key={label}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={label}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <Icon className="h-4 w-4" />
                                </a>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Explore</p>
                        <nav className="mt-3 flex flex-col gap-2">
                            {(
                                [
                                    ['How It Works', '#how-it-works'],
                                    ['Why Scandio', '#value'],
                                    ['FAQ', '#faq'],
                                ] as [string, string][]
                            ).map(([label, href]) => (
                                <Link
                                    key={`${label}-${href}`}
                                    href={href}
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    {label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Company</p>
                        <nav className="mt-3 flex flex-col gap-2">
                            {(
                                [
                                    ['Contact', '/contact'],
                                    ['For Providers', '/pro/join'],
                                    ['Privacy Policy', '/privacy'],
                                    ['Terms Of Service', '/terms'],
                                ] as [string, string][]
                            ).map(([label, href]) => (
                                <Link
                                    key={`${label}-${href}`}
                                    href={href}
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    {label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                </div>
                <div className="mt-10 border-t border-border/50 pt-6">
                    <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Scandio. All Rights Reserved.</p>
                </div>
            </div>
        </footer>
    );
}
