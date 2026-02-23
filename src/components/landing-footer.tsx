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

export function LandingFooter({ showLargeBrandText }: LandingFooterProps) {
  return (
    <footer className="bg-card">
      <div className="mx-auto max-w-7xl overflow-visible px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        {showLargeBrandText && (
          <div className="w-full overflow-hidden text-muted-foreground">
            <StripeBrandText />
          </div>
        )}
        <div className="text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Scandio
        </div>
      </div>
    </footer>
  );
}
