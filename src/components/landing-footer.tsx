import Image from "next/image";
import Link from "next/link";
import { Instagram, Linkedin, Twitter } from "lucide-react";
import { StripeBrandText } from "@/components/stripe-brand-text";

type FooterSection = {
  title: string;
  links: { href: string; label: string }[];
};

type LandingFooterProps = {
  sections: FooterSection[];
  /** Optional badge beside logo (e.g. "For Pros") */
  logoBadge?: string;
  /** Show huge diagonally striped Scandio branding in footer (customer landing page) */
  showLargeBrandText?: boolean;
};

const socialLinks = [
  { href: "#", icon: Twitter, label: "Twitter" },
  { href: "#", icon: Linkedin, label: "LinkedIn" },
  { href: "#", icon: Instagram, label: "Instagram" },
] as const;

export function LandingFooter({ sections, logoBadge, showLargeBrandText }: LandingFooterProps) {
  return (
    <footer className="bg-muted/30">
      <div className="mx-auto max-w-7xl overflow-visible px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        {showLargeBrandText && (
          <div className="text-muted-foreground mb-12 w-full overflow-hidden">
              <StripeBrandText />
          </div>
        )}
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          {/* Logo + Social */}
          <div className="flex flex-col gap-6">
            <Link href={logoBadge ? "/pro" : "/"} className="flex items-center gap-2">
              <Image
                src="/logo.svg"
                alt="Scandio"
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-lg"
              />
              <span className="font-semibold text-foreground">Scandio</span>
              {logoBadge && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {logoBadge}
                </span>
              )}
            </Link>
            <div className="flex gap-4">
              {socialLinks.map(({ href, icon: Icon, label }) => (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon size={20} />
                </Link>
              ))}
            </div>
          </div>

          {/* 3 columns: Product / Company / Legal */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="mb-4 text-sm font-semibold text-foreground">
                  {section.title}
                </h3>
                <ul className="space-y-3">
                  {section.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Scandio
        </div>
      </div>
    </footer>
  );
}
