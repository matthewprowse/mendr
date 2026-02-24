'use client';

import { StripeBrandText } from '@/components/stripe-brand-text';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Instagram, Linkedin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type FooterSection = {
    title: string;
    links: { href: string; label: string }[];
};

type SocialLink = {
    href: string;
    label: string;
    icon: 'instagram' | 'linkedin' | 'twitter';
};

type LandingFooterProps = {
    sections?: FooterSection[];
    showLargeBrandText?: boolean;
    socialLinks?: SocialLink[];
};

const SocialIcon = ({ icon }: { icon: SocialLink['icon'] }) => {
    switch (icon) {
        case 'instagram':
            return <Instagram className="size-5" aria-hidden />;
        case 'linkedin':
            return <Linkedin className="size-5" aria-hidden />;
        case 'twitter':
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                >
                    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
                </svg>
            );
        default:
            return null;
    }
};

const DEFAULT_SOCIAL: SocialLink[] = [
    { href: 'https://instagram.com', label: 'Instagram', icon: 'instagram' },
    { href: 'https://linkedin.com', label: 'LinkedIn', icon: 'linkedin' },
];

const DEFAULT_SECTIONS: FooterSection[] = [
    {
        title: 'Product',
        links: [
            { href: '#how-it-works', label: 'How It Works' },
            { href: '#features', label: 'Features' },
            { href: '#coverage', label: 'Coverage' },
            { href: '/', label: 'Start Diagnosis' },
        ],
    },
    {
        title: 'For Pros',
        links: [
            { href: '/pro#how-it-works', label: 'How It Works' },
            { href: '/pro#features', label: 'Features' },
            { href: '/pro#register', label: 'Join Network' },
        ],
    },
    {
        title: 'Company',
        links: [
            { href: '/about', label: 'About' },
            { href: '/contact', label: 'Contact' },
            { href: '/report', label: 'Report Provider' },
        ],
    },
    {
        title: 'Legal',
        links: [
            { href: '/privacy', label: 'Privacy Policy' },
            { href: '/terms', label: 'Terms' },
            { href: '/pro/terms', label: 'Pro Terms' },
        ],
    },
];

export function LandingFooter({
    sections = DEFAULT_SECTIONS,
    showLargeBrandText = false,
    socialLinks = DEFAULT_SOCIAL,
}: LandingFooterProps) {
    return (
        <footer className="bg-card">
            <div className="mx-auto max-w-7xl space-y-12 px-4 py-16 sm:px-6 lg:px-8">
                {/* Link columns + Newsletter — equal grid */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-12">
                    {sections.map((section) => (
                        <div key={section.title}>
                            <h3 className="text-sm font-semibold text-foreground">
                                {section.title}
                            </h3>
                            <ul className="mt-4 space-y-3 text-sm">
                                {section.links.map((link) => (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href}
                                            className="text-muted-foreground transition-all duration-[250ms] hover:text-foreground"
                                        >
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    <div className="col-span-2">
                        <h3 className="text-sm font-semibold text-foreground">
                            Get Home Maintenance Tips
                        </h3>
                        <form
                            className="mt-2 flex flex-col gap-2"
                            onSubmit={(e) => e.preventDefault()}
                        >
                            <Input
                                type="email"
                                placeholder="Email Address"
                                className="h-9 text-sm"
                                aria-label="Email "
                            />
                            <Button type="submit" variant="default" className="mt-2">
                                Subscribe
                            </Button>
                        </form>
                    </div>
                </div>

                {/* Large brand text (customer landing only) */}
                {showLargeBrandText && (
                    <div className="overflow-hidden text-muted-foreground">
                        <StripeBrandText />
                    </div>
                )}

                <Separator />

                {/* Copyright + Social */}
                <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                    <p className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} Scandio
                    </p>
                    <div className="flex gap-4 text-muted-foreground">
                        {socialLinks.map((social) => (
                            <Link
                                key={social.href}
                                href={social.href}
                                aria-label={social.label}
                                className="hover:text-primary transition-colors"
                            >
                                <SocialIcon icon={social.icon} />
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </footer>
    );
}
