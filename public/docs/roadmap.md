# Menda — Product Roadmap
### May 19 – December 31, 2026

---

## Where You Are Today

*Last updated: May 19, 2026. Audited against the live codebase.*

**Built:**
- AI diagnosis pipeline (Gemini, multimodal, zero-shot) ✅
- Contractor listing and individual contractor view ✅
- Contractor waitlist ✅
- Google Maps scraping and caching pipeline ✅
- Supabase backend with 476+ provider records ✅
- Homeowner auth — email/password, magic link, Google OAuth (Supabase) ✅
- Contractor application flow — 11-step onboarding (company search, KYC, trade/services, gallery, registration cert, confirm) ✅
- Contractor profile editing — update services, areas, bio, hours, gallery via `/contractors/application/edit` ✅
- Contractor gallery with Google Places photo sync ✅
- Review system — homeowner-generated, multi-category ratings (punctuality, cleanliness, work quality, quote accuracy), pending/approved states ✅
- WhatsApp message generation — AI-generated prefill message from diagnosis context sent to contractor ✅
- Cost estimation — market rates research pipeline (web search → AI synthesis) + parts price lookup ✅
- Admin dashboard — provider management, analytics, contact messages, gallery, reviews ✅
- Report sharing — shareable diagnosis report page (`/report/[id]`) ✅
- Chat interface — AI conversation mode for diagnosis ✅
- Design tokens and component library (shadcn/ui based, CSS variables, brand system) ✅
- Brand rename complete — `BRAND_NAME = 'Menda'`; legacy name `'Scandio'` retained only in migration_later identifiers (DB source values, analytics event names, localStorage keys)

**Not yet built:**
- Contractor dashboard / portal (contractors can apply and edit profile, but have no dashboard to see leads, enquiry history, or profile status)
- Homeowner diagnosis history (no saved history page for returning homeowners)
- Saved favourite contractors
- Quoting and invoicing
- CRM / job tracking (job pipeline: Lead → Quoted → In Progress → Completed)
- Payment infrastructure (PayFast / Peach Payments)

**Known issues to fix before any marketing push:**
- Lorem ipsum placeholder text in the `/start` diagnosis flow (Steps 1, 2, 3 subtitles are all filler)
- All marketing page illustrations are grey `<Placeholder>` boxes — no real screenshots of the product
- Social media links on contractor page point to root platform URLs, not actual Menda accounts
- Pricing FAQ still says "later in 2025" — it is now 2026
- OG images still named `og-scandio.jpg` / `og-scandio-pro.jpg` in public/ — rename image files and update references when new assets are ready

---

## Guiding Principles

- **Ship before perfect.** The diagnosis engine is done. Stop building in isolation and get real users.
- **Contractors first, homeowners second.** You can't market to homeowners without contractors. Fill supply before demand.
- **Design is a one-time investment.** Hire a designer once, use the system forever. Do this early, not late.
- **AI-assisted development is your superpower.** Use Claude Code and Cursor aggressively. Most features below are 1-3 day builds with proper prompting.
- **Honours comes first.** Some weeks you will do nothing on Menda. That is okay. The milestones below account for this.

---

## Phase 0 — Validation (May 19 – May 31)

*Before writing a single new line of code, validate what you have.*

**Week 1 (May 19-25)**

- [ ] Show the app to your sister. Watch her use it without helping her. Note every moment of confusion.
- [ ] Show it to one other person — a friend, classmate, or neighbour. Same process.
- [ ] Write down the top 3 things that broke or confused them.
- [ ] Do not fix anything yet. Just observe.

**Week 2 (May 26-31)**

- [ ] Fix the top 3 issues from user testing.
- [ ] Post in one Cape Town homeowner Facebook group (Rondebosch, Constantia, or Claremont). Offer free diagnosis help. Watch how people respond.
- [ ] Compile a list of 20 contractors from your database to cold outreach first — highest rating, most reviews, trades where diagnosis adds most value (plumbing, electrical, roofing).

**Milestone:** At least 2 real humans have used the diagnosis flow by May 31.

---

## Phase 1 — Foundation (June 2026)

*Auth and the contractor dashboard are the remaining gaps. Several items here are already built.*

**June — Homeowner Auth & Profile**

- [x] Homeowner sign up / login (Supabase Auth — email + Google OAuth) ✅ Already built
- [ ] Basic homeowner profile page (name, property type — auth exists, profile page does not)
- [ ] Diagnosis history — homeowners can see their past diagnoses (no history page yet)
- [ ] Save favourite contractors

**June — Contractor Auth & Portal (MVP)**

- [x] Contractor login (same Supabase Auth, role-differentiated) ✅ Already built
- [x] Contractor onboarding flow — 11-step application with KYC, gallery, services, areas ✅ Already built
- [x] Contractor profile editing — services, areas, bio, hours, photos ✅ Already built
- [ ] Contractor dashboard — **this is the real gap**. Contractors have no place to see leads received, profile status, or subscription state. Build this first.

**Design Hire — Brief and appoint by June 15**

- [ ] Write a one-page design brief: what Menda is, who uses it (homeowners + contractors), tone (trustworthy, modern, South African, not corporate), and what you need (full design system: colours, typography, icons, component library for web and mobile)
- [ ] Post on Dribbble, Behance, and LinkedIn. Budget: R35,000 – R50,000.
- [ ] Review portfolios — look specifically for SaaS or marketplace experience
- [ ] Appoint designer by June 15. Target delivery of design system by July 31.

**Milestone:** Homeowners and contractors can both log in by June 30.

---

## Phase 2 — Design System + Contractor Tools (July 2026)

*Your designer delivers the system. You implement it. Contractors get their first real tools.*

**July — Implement Design System**

- [ ] Receive design system from designer (colours, fonts, component library, icons)
- [x] Design tokens across the app (CSS variables, Tailwind config) ✅ Already implemented — but currently using shadcn/ui defaults, not a custom brand identity. Designer's job is to replace these values, not build from scratch.
- [ ] Replace placeholder illustrations with real product screenshots across both marketing pages
- [ ] Redesign homeowner-facing screens with new system
- [ ] Redesign contractor portal with new system
- [ ] Mobile responsiveness audit — Menda must work on a phone. Most contractors will access it on mobile.
- [ ] Complete brand rename: rename OG image files (og-scandio.jpg → og-menda.jpg), migrate session/analytics/DB keys when safe, finalise menda.co.za domain

**July — Contractor Quoting Tool (MVP)**

- [ ] Contractor can create a quote from their dashboard
- [ ] Quote includes: job description, line items, total, validity period, contractor branding
- [ ] Quote is sent to homeowner via email and visible in their Menda account
- [ ] Homeowner can accept or decline quote
- [ ] Keep it simple — this is not Xero. It is a basic quote builder.

**July — Homeowner Review System**

- [x] Review form with multi-category ratings (punctuality, cleanliness, work quality, quote accuracy) ✅ Already built
- [x] Reviews displayed on contractor profile, supplementing Google reviews ✅ Already built
- [x] Review moderation — pending/approved state in admin ✅ Already built
- [ ] Post-job review prompt trigger — reviews exist but there is no automated prompt after a job is marked complete (requires CRM pipeline first)
- [ ] Photo attachments on reviews (not yet built)

**Milestone:** First contractor creates and sends a quote through Menda by July 31.

---

## Phase 3 — Contractor CRM + Outreach (August 2026)

*Contractors start managing their business through Menda. You start converting waitlist.*

**August — Basic CRM**

- [ ] Job pipeline: New Lead → Quoted → Accepted → In Progress → Completed
- [ ] Contractor can add notes to each job
- [ ] Homeowner contact history visible to contractor
- [ ] Basic job calendar — contractor sees upcoming jobs
- [ ] Job status visible to homeowner — they can see where their job is in the process

**August — Invoicing (MVP)**

- [ ] Contractor can convert an accepted quote to an invoice
- [ ] Invoice includes: job details, payment terms, bank details, contractor logo
- [ ] Invoice sent to homeowner via email and visible in Menda
- [ ] Mark invoice as paid (manual — no payment processing yet)
- [ ] Invoice history for contractor

**August — Contractor Outreach Campaign**

- [ ] Build your personalised AI outreach pipeline (pull contractor data → generate personalised email referencing their trade, location, rating, and a specific lead that came through in their area)
- [ ] Send first batch of 50 cold emails to highest-quality contractors in your database
- [ ] Follow up via WhatsApp 3 days after email (personal message, not automated)
- [ ] Target: 20 contractors onboarded and active by August 31

**Milestone:** 20 paying contractors on the platform by August 31.

---

## Phase 4 — Growth Features + Subscription (September 2026)

*Honours exam period — lighter dev load. Focus on converting waitlist and refining.*

> **Note:** September is likely your busiest honours month. Protect your thesis. Menda should be in maintenance and outreach mode this month, not heavy development.

**September — Subscription and Billing**

- [ ] Implement subscription tiers (R300 / R799 / R1,500) via PayFast or Peach Payments
- [ ] Contractor billing portal — view current plan, upgrade, cancel
- [ ] Free trial period — 60 days free, no credit card required for beta contractors
- [ ] Automated billing and invoice generation for contractor subscriptions

**September — Contractor Outreach (continued)**

- [ ] Second batch of 100 cold emails
- [ ] Follow up with contractors who opened but didn't respond
- [ ] WhatsApp follow-up to all non-responders from August batch
- [ ] Personal outreach in relevant Facebook and WhatsApp trade groups

**September — Homeowner Acquisition (first push)**

- [ ] Run first paid Facebook/Instagram campaign targeting Cape Town homeowners (R3,000 – R5,000 test budget)
- [ ] Post consistently in Cape Town homeowner Facebook groups — offer free diagnoses, answer questions, be helpful
- [ ] Track: how many homeowners sign up, how many run a diagnosis, how many contact a contractor

**Milestone:** Paying subscriptions live. First R payment processed by September 30.

---

## Phase 5 — Polish and Scale (October – November 2026)

*Thesis submitted. Full focus on Menda. Hit 100 contractors by year end.*

**October — Notifications and Engagement**

- [ ] Email notifications: new lead for contractor, quote received for homeowner, job status updates
- [ ] In-app notification centre
- [x] WhatsApp prefill message generation from diagnosis context ✅ Already built — homeowner taps to send a pre-drafted WhatsApp to the contractor
- [ ] Proper WhatsApp Business API integration (Twilio) for two-way notifications — not the same as the prefill approach above
- [ ] Push notifications for mobile (if PWA or React Native by this point)

**October — Contractor Profile Enhancement**

- [x] Photo gallery — contractors can upload past work photos ✅ Already built (gallery in application flow + Google photo sync)
- [x] Certifications and accreditations — catalog and display exists ✅ Already built
- [ ] Service area map visualisation on public profile
- [ ] Verified badge for contractors with 10+ reviews and active subscription
- [ ] Response rate and average response time displayed

**November — Homeowner Dashboard**

- [ ] Full job history — all diagnoses, quotes, jobs, invoices in one place
- [ ] Saved contractors list
- [ ] Re-request a contractor (book them again with one tap)
- [ ] Refer a friend — homeowner referral programme (refer a homeowner, get a free diagnosis or discount)

**November — Outreach and Conversion**

- [ ] Third outreach batch — all remaining high-quality contractors in WC database
- [ ] Begin soft outreach to Gauteng contractors (waitlist only — not paying yet)
- [ ] Reach out to contractors who signed up to waitlist but haven't converted — personal call or WhatsApp
- [ ] Target: 75 paying contractors by November 30

**Milestone:** 75 paying contractors, R40,000+ MRR by November 30.

---

## Phase 6 — Year End Push (December 2026)

*Close out the year strong. Position for Gauteng launch in Q1 2027.*

**December — Analytics and Reporting**

- [ ] Contractor dashboard analytics: leads received, quotes sent, jobs completed, revenue tracked through Menda
- [ ] Platform analytics for you: MRR, churn, active users, diagnosis volume, contractor response rates
- [ ] Monthly contractor performance report (automated email summary to each contractor)

**December — Gauteng Preparation**

- [ ] Expand scraping pipeline to cover Johannesburg, Pretoria, Sandton, Midrand, Soweto, Centurion
- [ ] Target 1,000+ Gauteng contractor records in database by December 31
- [ ] Build Gauteng waitlist landing page — start collecting contractor interest
- [ ] Prepare Gauteng launch strategy for Q1 2027

**December — Investor Prep (if 100 contractors reached)**

- [ ] Compile key metrics: MRR, ARR, churn rate, contractor retention, homeowner MAU, diagnosis volume
- [ ] Write a one-page summary of Menda for investor conversations
- [ ] Identify 5 target investors: Knife Capital, 4Di Capital, Startupbootcamp AfriTech, HBAN, Launch Africa
- [ ] Do not cold email investors yet. Warm introductions only — ask your network.

**Milestone: 100 paying contractors, R54,000+ MRR by December 31.**

---

## What Is NOT in This Roadmap (Intentionally)

These are real features but they belong in 2027, not 2026. Do not build them early.

| Feature | Why it's 2027 |
|---|---|
| MandaPay (escrow payments) | Requires FSCA engagement, legal structure, and significant engineering. Build after you have traction. |
| Email marketing tool for contractors | Complex to build well. Add after CRM is proven. |
| Mobile app (native iOS/Android) | PWA is sufficient for 2026. Native app is a 2027 investment. |
| Multi-language support | Not needed for SA launch. |
| AI-generated contractor proposals | Cool feature, but not a retention driver yet. |
| Franchise / multi-location contractor management | Your R1,500 tier covers this manually for now. |

---

## Summary Timeline

| Month | Focus | Key Milestone |
|---|---|---|
| May | Validate with real users | 2 humans use the app |
| June | Auth, profiles, hire designer | Both sides can log in |
| July | Design system, quoting, reviews | First quote sent through Menda |
| August | CRM, invoicing, outreach begins | 20 paying contractors |
| September | Subscriptions live, homeowner ads | First payment processed |
| October | Notifications, contractor profiles | WhatsApp leads live |
| November | Homeowner dashboard, heavy outreach | 75 paying contractors |
| December | Analytics, Gauteng prep, investor deck | 100 paying contractors, R54k MRR |

---

## Budget Guide

| Category | Estimated Spend |
|---|---|
| Designer (full design system) | R35,000 – R50,000 |
| Claude Max subscription | ~R1,800/month (R12,600 for 7 months) |
| Cursor Pro | ~R400/month (R2,800 for 7 months) |
| Supabase / hosting | R500 – R1,500/month |
| Gemini API (diagnosis calls) | R1,000 – R3,000/month (scales with usage) |
| WhatsApp Business API | R500 – R1,000/month |
| PayFast / Peach Payments setup | R0 (percentage per transaction) |
| Facebook/Instagram ads (Sep-Dec) | R15,000 – R25,000 total |
| Miscellaneous (domains, tools) | R2,000 |
| **Total estimated spend (May-Dec)** | **R75,000 – R105,000** |

This fits comfortably within your R75,000 ring-fenced budget with minor overflow covered by early subscription revenue.

---

## One Last Thing

The roadmap above assumes one thing: that you showed your sister the app and she actually used it.

Everything else depends on that first step.

*Built for Matthew — May 2026*
