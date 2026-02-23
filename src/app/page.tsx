import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/landing-footer";
import { LandingHeader } from "@/app/page/_components/landing-header";
import { TestimonialsSection } from "@/app/page/_components/testimonials-section";
import { CoverageMap } from "@/app/page/_components/coverage-map";

export const metadata: Metadata = {
  title: "Scandio: Home Maintenance Assistant",
  description:
    "",
  keywords: [],
  openGraph: {
    title: "Scandio: Home Maintenance Assistant",
    description: "",
  },
};

function Placeholder({
  label,
  aspectRatio = "aspect-video",
  className = "",
}: {
  label: string;
  aspectRatio?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 text-center text-sm text-muted-foreground ${aspectRatio} ${className}`}
    >
      <span className="max-w-[85%] px-2">{label}</span>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader />

      <main className="flex-1">
        {/* Hero Section (Split Layout) */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col items-center space-y-8 text-center lg:items-start lg:text-left">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Stop the Maintenance Guesswork. 
                <br />
                Get Scandio's Report.
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                Your home didn&apos;t come with a manual, so we&apos;re attempting to create one. Scandio is trained to identify common home maintenance issues and connect you to the best service providers near you. We&apos;ll always be free to assist you in taking care of your home.
              </p>
              <Button asChild size="lg" className="h-12 px-8 text-base">
                <Link href="/chat/start">Start Diagnosis (Free)</Link>
              </Button>
            </div>
            <div className="flex justify-center">
              <div className="relative w-full max-w-[260px] overflow-hidden rounded-[2.5rem] border-2 border-border bg-secondary shadow-xl sm:max-w-[280px]">
                <div className="aspect-[9/16] flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
                  [PLACEHOLDER: Phone Model showing Chat UI]
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust / Social Proof Bar */}
        <section className="bg-muted/30 py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:grid-rows-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="flex h-16 items-center justify-center rounded-lg bg-muted/50 text-center text-xs text-muted-foreground"
                >
                  [Press Logo / Stat {i}]
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works (Alternating Z-Pattern) */}
        <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              How Scandio Works
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              From a single photo to a repair report you can share with contractors—no account, no guesswork. Our AI home repair diagnosis puts expert-level insight in your pocket and connects you with trusted local professionals in minutes.
            </p>
          </div>

          {/* Row 1: Left text, Right visual */}
          <div className="grid items-center gap-8 py-8 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-4 order-2 lg:order-1">
              <h3 className="text-xl font-semibold">Step One — Snap a Photo</h3>
              <p className="text-muted-foreground">
                Spot a leak, a crack, or something that just doesn&apos;t look right? Snap a photo of the issue—or describe it in plain English. No sign-up required. Scandio&apos;s AI is trained to recognise common home maintenance problems, from electrical faults to plumbing, roofing, and more.
              </p>
            </div>
            <div className="order-1 lg:order-2">
              <Placeholder
                label="[PLACEHOLDER: Image Upload UI Mockup]"
                aspectRatio="aspect-[4/3]"
                className="w-full"
              />
            </div>
          </div>

          {/* Row 2: Right text, Left visual */}
          <div className="grid items-center gap-8 py-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <Placeholder
                label="[PLACEHOLDER: AI Diagnosis Report UI Mockup]"
                aspectRatio="aspect-[4/3]"
                className="w-full"
              />
            </div>
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Step Two — Get Your Diagnosis</h3>
              <p className="text-muted-foreground">
                Within seconds, you&apos;ll receive an expert-level home repair analysis: what&apos;s wrong, what parts you might need, and an estimated cost range. Save or share your report—it&apos;s the perfect handover for any contractor. No more vague call-outs or second opinions; you&apos;re already informed.
              </p>
            </div>
          </div>

          {/* Row 3: Left text, Right visual */}
          <div className="grid items-center gap-8 py-8 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-4 order-2 lg:order-1">
              <h3 className="text-xl font-semibold">Step Three — Connect with Local Contractors</h3>
              <p className="text-muted-foreground">
                We match you with trusted plumbers, electricians, roofers, and other home service professionals near you. Share your diagnosis report so they arrive ready with the right tools and parts. Compare options, get quotes, and book—all from one place. Taking care of your home just got simpler.
              </p>
            </div>
            <div className="order-1 lg:order-2">
              <Placeholder
                label="[PLACEHOLDER: Contractor Selection UI Mockup]"
                aspectRatio="aspect-[4/3]"
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* Bento Box UI Showcase */}
        <section id="features" className="border-t border-b border-border bg-muted/20 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Features
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
              <div className="lg:col-span-2 lg:row-span-2">
                <Placeholder
                  label="[PLACEHOLDER: Chat Bubble Snippet]"
                  aspectRatio="aspect-[4/3]"
                  className="h-full min-h-[240px] w-full"
                />
              </div>
              <div>
                <Placeholder
                  label="[PLACEHOLDER: Cost Estimate UI]"
                  aspectRatio="aspect-video"
                  className="h-full min-h-[160px] w-full"
                />
              </div>
              <div>
                <Placeholder
                  label="[PLACEHOLDER: Repair Report Card]"
                  aspectRatio="aspect-video"
                  className="h-full min-h-[160px] w-full"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <Placeholder
                  label="[PLACEHOLDER: Provider List / Match UI]"
                  aspectRatio="aspect-[21/9]"
                  className="h-full min-h-[120px] w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Dedicated Map / Coverage Section */}
        <section id="coverage" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Service Coverage
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Find out if we serve your area. Search or use your location to see nearby plumbers, electricians, gate repair, and roofing professionals.
            </p>
          </div>
          {process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
          process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ? (
            <CoverageMap
              apiKey={
                process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
                process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
                ""
              }
            />
          ) : (
            <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              Configure NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY or NEXT_PUBLIC_GOOGLE_PLACES_API_KEY to show the map.
            </div>
          )}
        </section>

        <TestimonialsSection />

        {/* Final CTA Banner */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="rounded-xl border border-border bg-muted/20 px-8 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Start Diagnosis (Free)
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Join thousands of satisfied users today.
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href="/chat/start">Start Diagnosis (Free)</Link>
            </Button>
          </div>
        </section>
      </main>

      <LandingFooter
        showLargeBrandText
        sections={[
          {
            title: "Product",
            links: [
              { href: "#how-it-works", label: "How It Works" },
              { href: "#features", label: "Features" },
              { href: "#coverage", label: "Coverage" },
              { href: "/chat/start", label: "Start Diagnosis (Free)" },
            ],
          },
          {
            title: "Company",
            links: [
              { href: "/about", label: "About" },
              { href: "/contact", label: "Contact" },
              { href: "/careers", label: "Careers" },
              { href: "/report", label: "Report a provider" },
            ],
          },
          {
            title: "Legal",
            links: [
              { href: "/privacy", label: "Privacy Policy" },
              { href: "/terms", label: "Terms of Service" },
            ],
          },
        ]}
      />
    </div>
  );
}
