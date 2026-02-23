import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/landing-footer";
import { ProHeader } from "./_components/pro-header";
import { ProSignupSection } from "./_components/pro-signup-section";
import { RoadmapSection } from "./_components/roadmap-section";

export const metadata: Metadata = {
  title: "Scandio Pro | Contractor Lead Generation Western Cape — Scandio Professional Network",
  description:
    "Contractor lead generation Western Cape. Join Scandio Professional Network. Stop paying for dead leads. Get AI pre-diagnosed jobs, 0% upfront costs.",
  keywords: [
    "Contractor lead generation Western Cape",
    "Scandio Professional Network",
    "contractor leads Cape Town",
    "plumber leads",
    "electrician leads",
    "AI pre-diagnosed leads",
  ],
  openGraph: {
    title: "Scandio Pro — Contractor Lead Generation Western Cape",
    description: "Scandio Professional Network. Pre-diagnosed leads, no dead leads, no call-out fees.",
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
      className={`flex items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/50 text-center text-sm text-muted-foreground shadow-sm ${aspectRatio} ${className}`}
    >
      <span className="max-w-[90%] px-3">{label}</span>
    </div>
  );
}

export default function ProLandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ProHeader />

      <main className="flex-1">
        {/* 3. SaaS Hero Section (High Impact) */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col items-center space-y-8 text-center lg:items-start lg:text-left">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Stop buying dead leads. Get pre-diagnosed jobs.
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                Lorem ipsum dolor sit amet. Western Cape contractors tired of call-out fees and vague complaints. We send you homeowners who already know what&apos;s wrong—and what parts you need—before you drive.
              </p>
              <div className="flex flex-col items-center gap-3 lg:items-start">
                <Button asChild size="lg" className="h-12 px-8 text-base">
                  <Link href="#register">Register Interest</Link>
                </Button>
                <p className="text-xs text-muted-foreground">No credit card required</p>
              </div>
            </div>
            <div className="flex justify-center">
              <div className="relative w-full max-w-[260px] overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xl sm:max-w-[280px]">
                <Placeholder
                  label="[PLACEHOLDER: UI Mockup of an incoming Scandio Lead showing the AI Diagnosis, parts needed, and exact distance]"
                  aspectRatio="aspect-[9/16]"
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* How Scandio Works (mirrors customer landing page) */}
        <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              How Scandio Works
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </p>
          </div>

          {/* Row 1: Left text, Right visual */}
          <div className="grid items-center gap-8 py-8 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-4 order-2 lg:order-1">
              <h3 className="text-xl font-semibold">Step One — Lorem Ipsum</h3>
              <p className="text-muted-foreground">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
              </p>
            </div>
            <div className="order-1 lg:order-2">
              <Placeholder
                label="[PLACEHOLDER: Web Dashboard UI showing AI breakdown of a broken DB board and estimated repair costs]"
                aspectRatio="aspect-[4/3]"
                className="w-full"
              />
            </div>
          </div>

          {/* Row 2: Right text, Left visual */}
          <div className="grid items-center gap-8 py-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <Placeholder
                label="[PLACEHOLDER: Mockup of Contractor's branded WhatsApp share link and custom QR code]"
                aspectRatio="aspect-[4/3]"
                className="w-full"
              />
            </div>
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Step Two — Lorem Ipsum</h3>
              <p className="text-muted-foreground">
                Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
              </p>
            </div>
          </div>

          {/* Row 3: Left text, Right visual */}
          <div className="grid items-center gap-8 py-8 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-4 order-2 lg:order-1">
              <h3 className="text-xl font-semibold">Step Three — Lorem Ipsum</h3>
              <p className="text-muted-foreground">
                Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
              </p>
            </div>
            <div className="order-1 lg:order-2">
              <Placeholder
                label="[PLACEHOLDER: Wallet / Completed Job Payout UI Mockup]"
                aspectRatio="aspect-[4/3]"
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* Features (bento - matches customer, extended) */}
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
                  label="[PLACEHOLDER: Chat Bubble Snippet / Lead notification with AI diagnosis]"
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
                  label="[PLACEHOLDER: Provider List / Pro Dashboard Match UI]"
                  aspectRatio="aspect-[21/9]"
                  className="h-full min-h-[120px] w-full"
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
              <div className="lg:col-span-2 lg:row-span-2">
                <Placeholder
                  label="[PLACEHOLDER: CRM & Job Pipeline Board UI]"
                  aspectRatio="aspect-[4/3]"
                  className="h-full min-h-[240px] w-full"
                />
              </div>
              <div>
                <Placeholder
                  label="[PLACEHOLDER: Team Dispatching & Calendar UI]"
                  aspectRatio="aspect-video"
                  className="h-full min-h-[160px] w-full"
                />
              </div>
              <div>
                <Placeholder
                  label="[PLACEHOLDER: Route Optimization Map UI]"
                  aspectRatio="aspect-video"
                  className="h-full min-h-[160px] w-full"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <Placeholder
                  label="[PLACEHOLDER: Wallet / Payout & Dispute Resolution UI]"
                  aspectRatio="aspect-[21/9]"
                  className="h-full min-h-[120px] w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Product Roadmap & Changelog */}
        <RoadmapSection />

        {/* ROI & Market Stats Bar */}
        <section className="bg-foreground py-16 text-background">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 text-center">
              <div>
                <p className="text-3xl font-bold sm:text-4xl">[X]</p>
                <p className="mt-1 text-sm opacity-80">Homeowners in Western Cape</p>
              </div>
              <div>
                <p className="text-3xl font-bold sm:text-4xl">[X]</p>
                <p className="mt-1 text-sm opacity-80">Average Job Value</p>
              </div>
              <div>
                <p className="text-3xl font-bold sm:text-4xl">0%</p>
                <p className="mt-1 text-sm opacity-80">Upfront Lead Costs</p>
              </div>
            </div>
          </div>
        </section>

        {/* B2B Testimonials */}
        <section id="testimonials" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              What Contractors Say
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Lorem ipsum. Western Cape plumbers, electricians, and contractors on Scandio Pro.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { date: "Jan 15, 2025" },
              { date: "Feb 3, 2025" },
              { date: "Feb 18, 2025" },
            ].map(({ date }, i) => (
              <div
                key={i}
                className="flex flex-col gap-4 rounded-md border border-input bg-card p-4 shadow-none"
              >
                <blockquote className="border-l-2 border-input pl-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Lorem ipsum dolor sit amet. No more dead leads. The AI diagnosis means I show up with the right parts. Game-changer.
                  </p>
                </blockquote>
                <p className="text-xs text-muted-foreground">{date}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Register Interest / Signup */}
        <section className="border-t border-border bg-muted/20">
          <ProSignupSection />
        </section>

      </main>

      <LandingFooter
        logoBadge="For Pros"
        sections={[
          {
            title: "Product",
            links: [
              { href: "#how-it-works", label: "How It Works" },
              { href: "#features", label: "Features" },
              { href: "#register", label: "Register Interest" },
            ],
          },
          {
            title: "Support",
            links: [
              { href: "/support", label: "Help Centre" },
              { href: "/support/contact", label: "Contact" },
              { href: "/report", label: "Report a provider" },
              { href: "/api-docs", label: "API Documentation" },
            ],
          },
          {
            title: "Legal",
            links: [
              { href: "/privacy", label: "Privacy Policy" },
              { href: "/terms", label: "Terms of Service" },
              { href: "/pro/terms", label: "Pro Terms of Service" },
            ],
          },
        ]}
      />
    </div>
  );
}
