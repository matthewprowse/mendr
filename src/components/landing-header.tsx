import Link from 'next/link';

type LandingHeaderLink = {
    href: string;
    label: string;
};

type LandingHeaderProps = {
    navLinks: LandingHeaderLink[];
    logoHref?: string;
    showTrades?: boolean;
};

export function LandingHeader({ navLinks, logoHref = '/', showTrades = false }: LandingHeaderProps) {
    return (
        <header className="sticky top-0 z-40 border-b border-border/50 bg-background/90 backdrop-blur">
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <Link href={logoHref} className="text-sm font-semibold text-foreground">
                    Scandio
                </Link>

                <nav className="hidden items-center gap-5 md:flex">
                    {navLinks.map((link) => (
                        <Link
                            key={`${link.href}-${link.label}`}
                            href={link.href}
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            {link.label}
                        </Link>
                    ))}
                    {showTrades ? (
                        <Link
                            href="#all-services"
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Trades
                        </Link>
                    ) : null}
                </nav>
            </div>
        </header>
    );
}
