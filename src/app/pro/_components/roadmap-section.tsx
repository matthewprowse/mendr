"use client";

import { ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const phases = [
  {
    id: "mvp",
    title: "Phase 1 — MVP",
    date: "April 2025",
    placeholder: "[PLACEHOLDER: MVP Chat Interface Mockup]",
    preview: "Lorem ipsum dolor sit amet. The first release focused on homeowner chat and AI diagnosis.",
    dialogContent: {
      title: "Phase 1 — MVP",
      date: "April 2025",
      placeholder: "[PLACEHOLDER: Detailed MVP UI Screenshot]",
      majorFeatures: [
        "AI-powered home maintenance diagnosis from photos",
        "WhatsApp integration for lead delivery to contractors",
        "Pre-diagnosed leads with parts and cost estimates",
        "Basic contractor profile and lead acceptance flow",
      ],
      status: "Shipped",
    },
  },
  {
    id: "pro",
    title: "Phase 2 — Pro SaaS",
    date: "September 2025",
    placeholder: "[PLACEHOLDER: Pro SaaS Dashboard Mockup]",
    preview: "Lorem ipsum dolor sit amet. Contractor dashboard, CRM tools, and team features.",
    dialogContent: {
      title: "Phase 2 — Pro SaaS",
      date: "September 2025",
      placeholder: "[PLACEHOLDER: Detailed Pro Dashboard Screenshot]",
      majorFeatures: [
        "Full Pro dashboard for job pipeline management",
        "CRM & job tracking with calendar integration",
        "Team dispatching and route optimization",
        "Custom branded links and QR codes for existing clients",
      ],
      status: "In Development",
    },
  },
  {
    id: "guarantee",
    title: "Phase 3 — Guarantee & Disputes",
    date: "2026",
    placeholder: "[PLACEHOLDER: Guarantee & Dispute Resolution UI Mockup]",
    preview: "Lorem ipsum dolor sit amet. Service Guarantee, dispute resolution, and guaranteed payouts.",
    dialogContent: {
      title: "Phase 3 — Guarantee & Dispute Resolution",
      date: "2026",
      placeholder: "[PLACEHOLDER: Detailed Guarantee UI Screenshot]",
      majorFeatures: [
        "Service Guarantee program for homeowners",
        "Objective dispute resolution using AI reports",
        "Guaranteed payout flow for completed jobs",
        "Automated invoicing and payment tracking",
      ],
      status: "Planned",
    },
  },
];

export function RoadmapSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mb-12 text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          The Scandio Roadmap
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Lorem ipsum dolor sit amet. Phases of Scandio&apos;s rollout from MVP to full Pro platform.
        </p>
      </div>

      <div className="grid grid-cols-1 grid-rows-[1fr_1fr] gap-6 sm:grid-cols-2">
        {phases.map((phase) => (
          <Dialog key={phase.id}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="group flex h-full min-h-0 flex-col text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl"
              >
                <div className="shrink-0 overflow-hidden rounded-t-xl border border-b-0 border-border bg-muted">
                  <div className="flex aspect-video w-full items-center justify-center bg-muted/50 text-center text-sm text-muted-foreground">
                    {phase.placeholder}
                  </div>
                </div>
                <div className="flex min-h-[140px] flex-1 flex-col rounded-b-xl border border-border bg-card p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">{phase.title}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {phase.date}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">
                    {phase.preview}
                  </p>
                  <p className="mt-4 flex shrink-0 items-center gap-1 text-xs font-medium text-primary group-hover:underline">
                    Read full release notes
                    <ChevronRight className="size-3.5" />
                  </p>
                </div>
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {phase.dialogContent.title} — {phase.dialogContent.date}
                </DialogTitle>
                <DialogDescription>
                  {phase.preview}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/50 text-center text-sm text-muted-foreground">
                  {phase.dialogContent.placeholder}
                </div>
                <div className="space-y-4 text-sm">
                  <p className="font-semibold">Major Features</p>
                  <ul className="list-inside list-disc space-y-1.5 text-muted-foreground">
                    {phase.dialogContent.majorFeatures.map((feature, i) => (
                      <li key={i}>{feature}</li>
                    ))}
                  </ul>
                  <p className="pt-2">
                    <span className="font-semibold">Status:</span>{" "}
                    <span className="text-muted-foreground">
                      {phase.dialogContent.status}
                    </span>
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </section>
  );
}
