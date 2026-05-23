# Mendr — Contractor Retention & Pricing Strategy

*Last updated: 2026-05-22. Owner: Matthew Prowse.*

This document defines how Mendr keeps a contractor on the platform for 2–3+ years and how Mendr makes money from them without resorting to a pay-per-lead model.

The thesis: **the platform that becomes the system of record for jobs, money, and customers is almost impossible to leave.** Every other SA home-services platform competes on lead supply alone. Mendr should compete on lead supply *plus* on being the back-office their business runs on.

See `01-diagnostic-quality-and-feature-roadmap.md` for the diagnostic-quality work and competitive context. See `03-homeowner-retention.md` for the homeowner side.

---

## 1. Strategic frame

### The Mendr advantage no other SA player has

Every contractor SaaS (Jobber, Housecall Pro, ServiceTitan, ServiceM8, Tradify) has to acquire its customers from scratch and then sell them tools. Mendr owns the lead acquisition side via the AI diagnosis + marketplace front. **The combination of "we give you the customer" + "and the tools to run that customer's job to completion" is a moat no SA competitor currently has.**

Every SA marketplace today (Snupit, Bark, Kandua/Santam) is a pure lead-gen layer with no significant operational tooling. Every accounting tool (Xero ZA, Sage ZA) has invoicing but no lead supply. Mendr can sit between them and be both — and once the contractor's customers, jobs, quotes, invoices, payments, and reviews all live in Mendr, leaving means losing the data spine the business runs on.

### The Kandua + Santam reality

Kandua is live, operating under Santam ownership since the May 2024 acquisition. The platform has national contractor density and insurer-backed credibility. **Kandua is, however, still a marketplace — not a SaaS.** Mendr's defensible position is therefore the combination Kandua does not have: AI-led fault diagnosis on the consumer side, plus the contractor's operational tooling (quoting, invoicing, payments, CRM, scheduling) on the business side. Either alone is competing with an incumbent. The combination is uniquely Mendr.

The speed-to-execute clock is no longer "establish Mendr before Kandua relaunches" — Kandua is already there. It's "ship the diagnosis moat and the operational-tools moat before Kandua decides to add either of them." Once they decide to, they have the capital. The race is now about feature differentiation, contractor density inside Mendr's specific operational ecosystem, and the lock-in that comes from a contractor's business literally running on the platform.

### The honest answer about "freemium with leads — how do we make money?"

The founder's question. The answer from the research is structurally clear:

> **Free tier gates on VOLUME, not features.** A contractor gets, say, 5 matched leads per month free. Beyond that they upgrade. They also upgrade for team seats, payments, and ranking boost — all proven cliffs.
>
> **Paid tiers monetise on subscription, not per-lead.** R299–R999/month buckets, anchored to what SA SMEs already pay for Xero / Sage (~R310–R820/month).
>
> **The lead-gen layer is what brings them in. The operational tooling is what makes them stay. The subscription is what makes us money.**

This is the same playbook Jobber, Housecall Pro, and ServiceTitan have proven works at ~95%+ gross retention. The only difference: those products have to spend on customer acquisition; Mendr does not.

---

## 2. The stickiness spine — one ledger from lead to paid

The single most important architectural decision: **every accepted lead automatically creates a job record, which becomes a quote, which becomes an invoice, which becomes a payment, which generates a review, which feeds back into marketplace ranking.** This is the spine. Every other feature attaches to it. Every step that lives off-platform breaks the audit trail.

```
Diagnosis lead → Accepted by contractor
            ↓
       Job record auto-created (linked to homeowner profile)
            ↓
       Quote (built on Mendr; sent to homeowner via WhatsApp + in-app)
            ↓
       Quote accepted → Invoice generated (VAT-compliant)
            ↓
       Payment collected (card-on-file via Yoco / PayFast / EFT / Ozow)
            ↓
       Review request triggered → Review on contractor profile
            ↓
       Ranking boost on next match
```

This is the Booking.com pattern applied to home services. A contractor who quotes via WhatsApp from their phone loses the ranking boost because the close can't be attributed. A contractor who invoices via Xero directly loses the on-time-payment score. A contractor who messages a customer off-platform loses the call recording that protects them in a dispute.

### Why this matters more than any single feature

Every individual tool (quoting, invoicing, scheduling, etc.) has multiple alternatives in the market. The contractor can use any one of them and not feel pain. But **the moment those tools are unified by a single thread — the job ID — and that thread runs from the AI diagnosis on one end to a paid review on the other, the contractor's data, money, and reputation all live in Mendr.** Switching means rebuilding all of them simultaneously. That's what 2-3 year retention looks like in this category.

---

## 3. The feature stack — what we build, ranked by retention impact

Synthesised from research on Jobber, Housecall Pro, ServiceTitan, ServiceM8, Tradify, FieldEdge, Square Appointments, plus SA-specific levers. **MVP = first 3 months. v2 = months 4–9. v3 = 10+ months.**

| # | Feature | Phase | Why it sticks (retention mechanism) |
|---|---|---|---|
| 1 | **Lead → Job → Quote → Invoice → Paid audit trail** (single ledger) | MVP | The spine. Every other feature attaches to it. |
| 2 | **Customer database auto-populated from every accepted lead** | MVP | Highest-friction asset to migrate; grows in value monthly. |
| 3 | **VAT-compliant ZAR invoicing** with VAT number, company reg, SARS-compliant tax invoice wording | MVP | Table stakes. Without it, contractors leave on day 1. |
| 4 | **Card-on-file payments via Yoco + PayFast + EFT references** | MVP | Re-collecting cards from every customer is the single hardest migration step in the industry. |
| 5 | **WhatsApp Business chat mirror per job** | MVP | Replaces the #1 tool every SA contractor juggles; messages tied to job history. |
| 6 | **Mobile quote builder with reusable kit bundles** (Tradify-style) | MVP | Daily-use surface; once the library is built, replacing it is months of work. |
| 7 | **Marketplace ranking boost tied to on-platform completion** | MVP | The lead-gen × SaaS compound flywheel. The single most important lock-in mechanism. |
| 8 | **Profile completeness score visible to contractor** | MVP | Already-existing `profileCompleteness` field is invisible. Surface it as a gamified progress bar with specific upgrade actions. Drives self-service profile enrichment. |
| 9 | **Real-time matched-lead notifications via WhatsApp + email** | MVP | Replaces the monthly digest. Speed-to-respond is what wins jobs. |
| 10 | **Drag-drop scheduler with load-shedding warnings** (EskomSePush) | v2 | SA-only differentiator; impossible to replicate without local context. |
| 11 | **Escrow option for marketplace-originated jobs** | v2 | Unique trust play — no other SA platform offers escrow. Ties payments to platform. |
| 12 | **Reviews & rating archive on contractor profile** | v2 | Non-portable reputation = high reputational switching cost. |
| 13 | **Xero / SARS VAT201 bridge** | v2 | Once a bookkeeper depends on it, the contractor's entire back-office is locked in. |
| 14 | **Recurring service plans + auto-charged maintenance contracts** | v2 | Annuity revenue. Pool maintenance, alarm monitoring, geyser inspections. |
| 15 | **POPIA-compliant consent + data-export flows** | v2 | Lock-in dressed as compliance. Marketing wedge plus the consent records live in Mendr. |
| 16 | **Job-costing / profitability reports with YoY trend data** | v3 | Strategic dashboard the contractor runs the business on; trend data is irreplaceable. |
| 17 | **Cloud phone system / call recording per job** | v3 | Captures inbound calls, attaches recordings. Migrating loses the call archive. |
| 18 | **Consumer financing on jobs >R5k** (Mukuru / RainFin / Lulalend partner) | v3 | Lifts average ticket. Once contractors win bigger jobs via financing, leaving = losing those deals. |
| 19 | **Daily-rate worker assignment** (sub-contractor roster) | v3 | Reflects real SA crew structures. Cost-tracking without a full login seat. |
| 20 | **Multi-language customer surfaces** (Afrikaans / isiXhosa quotes + invoices + SMS) | v3 | Increases close rate on customers in non-English suburbs. Mendr-unique. |

---

## 4. Subscription pricing — tiers, what's in them, how much

### Anchoring constraints (from research)

- SA SME mental anchors: Xero Starter ~R310, Sage Start <R300. R299/mo VAT-incl. is the defensible flagship entry.
- Snupit credits anchor the lead-cost mental model at R24–R150/lead.
- Target ARPU R250–R450 on paying contractors. 10–20% paid conversion off the free base.
- Free tier should gate on VOLUME (ServiceM8 pattern), not features.
- **All pricing displayed VAT-inclusive per SA VAT Act for B2C consumer-facing.**

### The four-tier structure

| Tier | Price (ZAR, VAT incl.) | Lead allowance | Best for | Key value |
|---|---|---|---|---|
| **Free — "Listed"** | R0 | **3 matched leads / month** | Brand-new contractor testing the platform | Get found. Profile listed. Direct contact via WhatsApp. No tools beyond that. |
| **Starter — "Active"** | **R299 / mo** (annual R2,990 = R249/mo equivalent) | **15 matched leads / month** | Solo tradesperson running their own business | Unlimited quoting, invoicing, basic CRM, Yoco payments, scheduler. The Xero-ZA price point. |
| **Pro — "Established"** | **R699 / mo** (annual R6,990 = R582/mo equivalent) | **Unlimited matched leads + ranking boost** | 2–5 person team | Everything in Starter + escrow, recurring plans, branded quotes, review automation, multi-user (5 seats), Xero/VAT201 bridge, real-time WhatsApp lead alerts. |
| **Business — "Scaled"** | **R1,499 / mo** (annual R14,990 = R1,249/mo equivalent) | Unlimited + priority placement | 5+ person team / multi-trade | Everything in Pro + financing on >R5k jobs, profitability reports, call recording, daily-rate worker roster, dedicated success contact, custom branded portal. |
| **Verified Add-On** | **+R400 / mo** | (any tier) | Contractor wanting the trust badge | Live CIDB / NHBRC verification, public liability cert verification, "Mendr Verified" badge appears prominently in matches. Sold à la carte on top of any paid tier. |

### Why this structure and these prices

**R0 → R299 jump (the activation cliff):** the 3-lead cap is low enough to be felt within the first month for any active contractor. The Free tier exists to remove the "I'll think about it" objection at signup — they list, they see leads, they convert when the cap bites. R299 matches Xero Starter so the mental price comparison is "Mendr replaces my Xero + gives me leads, for the same price."

**R299 → R699 jump (the expansion cliff):** triggered by *two* drivers stacked together: team seats (going from 1 to 5) AND ranking boost (becoming visible to homeowners ahead of unpaid competitors). This double-trigger is what Jobber's Connect tier does at $119 — and the conversion rate from Core to Connect is the single most lucrative move in their business.

**R699 → R1,499 jump (the lock-in cliff):** profitability reports + financing + call recording. These are operational dependencies the business builds on. Year-end financial reports in Mendr means the bookkeeper can't be moved without losing year-over-year visibility.

**Verified Add-On separate:** keep the trust badge off the standard tier ladder because (a) some contractors will never want to be verified (cash operators) and (b) charging R400/mo for compliance verification only is exactly what Checkatrade does at £100+/mo — verified compliance is a premium signal worth paying for separately.

### Annual discount

40% discount on annual prepay (matches Jobber). This generates working capital up front and dramatically improves retention — research shows annual payers churn at roughly half the rate of monthly. Build the comparison prominently: "R299/mo monthly = R3,588/year. Save R600 — pay R2,990 annually."

### What we explicitly don't sell

- **No pay-per-lead.** Mentioned in every founder-facing message: "Snupit charges you R30 every time you quote. Mendr gives you the leads — pay us a flat monthly fee and keep what you earn."
- **No commission on jobs done off-platform.** A contractor's existing customers are theirs. We only attach value to NEW leads originating through Mendr's diagnosis flow.
- **No commission on the marketplace-originated job either.** This is the controversial choice — Handy takes 50%, SweepSouth takes 4–20%. Mendr does not, and that's the marketing message. The contractor keeps 100% of the job value. We make money on the subscription.

### Optional: a 2% processing margin on platform payments

The one place a transaction fee makes sense: **payments processed through Mendr's payment rails get a small platform margin** on top of the Yoco/PayFast pass-through. E.g., Yoco charges 2.95% — Mendr's flow charges 3.95%, keeping a 1% spread that funds the escrow infrastructure. This is opt-in: contractors can use their own Yoco terminal, or use Mendr's rails for the escrow protection. Sell it on the trust angle: "Money held safely until the job is signed off — only available through Mendr Pay."

---

## 5. The acquisition funnel

### Step 1 — Discover

Contractors find Mendr via:
- Existing Google Places presence (auto-imported provider profiles, currently happening via enrichment)
- The monthly lead digest email (currently shipping) — "8 homeowners contacted businesses like yours in Claremont last month"
- Referral from existing contractors (in-app referral programme — every successful invitee earns the referrer 1 free month)

### Step 2 — Sign up

- WhatsApp-first signup: no email password, just phone OTP via WhatsApp Business
- Pre-filled profile from Google Places auto-import where available
- No credit card required for the Free tier
- 3 matched leads accepted before any paywall fires

### Step 3 — Activate

- First lead arrives within 7 days (we already have the demand-side flow for Western Cape)
- WhatsApp notification with diagnosis summary
- One-tap "Accept" creates the job, customer record, and starts the quote scaffold
- The contractor has now used the spine. Every subsequent job follows the same flow.

### Step 4 — Upgrade

The volume cap is the primary trigger (lead 4 of the month → upgrade prompt). Secondary triggers: trying to add a second team member, trying to enable card payments, trying to send a recurring invoice.

### Step 5 — Retain

The 2–3 year retention thesis depends on:
- The customer database growing every month (lead-attached customer records)
- Reviews accumulating on the profile (unportable reputation)
- Year-over-year financial reports becoming the business owner's strategic view
- Recurring service plans creating predictable revenue the contractor depends on
- VAT201 / Xero bridge becoming the bookkeeper's monthly routine

---

## 6. Switching cost map — what makes leaving genuinely painful

A simple gut-check: if the contractor decided to leave Mendr tomorrow, what would they lose? The more boxes that get ticked over time, the longer they stay.

| Switching cost category | What Mendr does to compound it |
|---|---|
| **Data migration** | Customer database with addresses, payment histories, photos, job notes. Export possible but volume + structure mismatch on any other tool makes it a multi-week project. |
| **Process re-learning** | Mobile quote builder with kit bundles the team knows by heart. A 5-person team retraining off-platform = 4–8 weeks of half-productivity. |
| **Integration cost** | Mendr ↔ Yoco ↔ PayFast ↔ Xero ↔ EskomSePush ↔ WhatsApp Business. Five wires to unplug. |
| **Customer-facing surface** | Customers get quote/invoice/SMS from Mendr-rendered templates. Familiar branding bookmarked. Repeat customers expect the same flow next time. |
| **Reputation** | Reviews accumulated on Mendr marketplace stay with Mendr. Leaving = restarting reputation from zero. |
| **Financial visibility** | Year-over-year P&L, job profitability, marketing ROI — none transfers to alternatives. |
| **Compliance** | VAT201 records, CIDB/NHBRC verification renewal cycle, public liability cert tracking, POPIA consent records. All evidentiary. |

The goal is to make every one of these meaningful within the first 12 months on the platform. By month 12 the contractor should have:

- ≥ 30 customer records auto-attached from leads
- ≥ 15 invoices / payments processed through Mendr
- ≥ 5 reviews on their profile
- ≥ 6 months of recurring revenue tracking data
- A bookkeeper who runs VAT201 from Mendr's export
- An installed muscle memory across the team for the quote builder

By month 24, leaving means redoing all of that. By month 36, leaving is operationally non-viable. That's the playbook.

---

## 7. Revenue model in numbers

A simplified projection — illustrative, not committed.

**Assumptions:**
- 500 active contractors at end of Year 1 (currently ~500 in the network already; conversion from Free to paid is the lever)
- 15% paid conversion (Free → Starter / Pro / Business)
- Of the 15%, 60% Starter, 30% Pro, 10% Business
- Verified Add-on attaches to 25% of paid base

**Year 1 illustrative MRR:**

| Cohort | Contractors | Tier | MRR each (VAT incl.) | Total monthly |
|---|---|---|---|---|
| Free | 425 | — | R0 | R0 |
| Starter | 45 | R299 | R299 | R13,455 |
| Pro | 22 | R699 | R699 | R15,378 |
| Business | 7 | R1,499 | R1,499 | R10,493 |
| Verified Add-on | 19 | +R400 | R400 | R7,600 |
| **Total** | **500 (75 paid)** | | | **R46,926 / month ≈ R563K ARR** |

**Year 2 illustrative MRR (scale + retention):**

- 1,500 contractors, 20% paid conversion, mix shifts towards Pro/Business with maturity
- Annual prepay adopted by ~30% of paid base

Projected MRR R180–R220K, ARR R2.2–2.6M.

These numbers are achievable on the current trajectory IF the spine ships and the volume gate fires. They are not achievable on a pay-per-lead model — Snupit's contractor ARPU is estimated at R150–R400/mo per active pro but their churn is materially higher.

---

## 8. Implementation sequence

### Q3 2026 (MVP — the spine)

Ship the lead → job → quote → invoice → paid flow end-to-end. Yoco + PayFast integration. WhatsApp Business chat mirror. Mobile quote builder with kit bundles. Real-time lead notifications. Subscription paywalls with volume gate at 3 leads (Free) and 15 leads (Starter).

**Goal:** first 50 paying contractors by end of quarter. ≥R15K MRR.

### Q4 2026 (v2 — the lock-in tools)

Escrow. Reviews on profile. Xero / VAT201 bridge. Recurring service plans. POPIA flows. Load-shedding-aware scheduler. Verified add-on with live CIDB/NHBRC.

**Goal:** 200 paying contractors. ≥R75K MRR. First annual prepays converting.

### Q1 2027 (v3 — the strategic tools)

Profitability reports. Call recording. Consumer financing partner. Daily-rate worker roster. Multi-language customer surfaces.

**Goal:** 400 paying contractors. ≥R175K MRR.

### Q2 2027 (consolidation)

National expansion (Joburg, Durban) on the back of a proven Western Cape playbook. Insurance partnership conversations open with Naked / Old Mutual Insure / Santam (the latter potentially as a B2B distribution play even though they own Kandua — there's a both-and scenario).

**Goal:** 700+ paying contractors. ≥R300K MRR.

---

## 9. Open strategic questions

1. **Should the Free tier exist at all, or should the entry be a paid trial?** Free converts at 10–20% in B2B SaaS; paid trial at 40–60%. But the Free tier doubles as a marketing channel — 425 free contractors are 425 Google Places profiles improved by Mendr enrichment, all linking back to the marketplace. The current recommendation: keep Free.

2. **Do we ship escrow in MVP or v2?** Escrow is the most defensible unique trust feature in SA. But it requires regulatory clarity (Mendr holding client funds may trigger FSCA / Reg-licensing concerns). v2 with legal review is the safer bet; consider a pilot via a registered escrow partner (e.g. ESCROW.com or trustee-based structure).

3. **WhatsApp Business chat mirror or full chat replacement?** Full chat replacement is operationally cleaner. But SA contractors will not abandon WhatsApp. The mirror pattern (chat in-app, customers see WhatsApp) is messier but more realistic. Recommendation: mirror in MVP, evaluate full replacement in v3 if the in-app surface wins adoption.

4. **Should we monetise the homeowner side at all?** Currently free. There's an argument for a "homeowner Pro" tier (priority matching, unlimited refinements, PDF export, premium support) but this is secondary to contractor revenue. See `03-homeowner-retention.md`.

5. **Insurance partnership — Naked, Old Mutual, Santam?** Naked is the most product-aligned (tech-native, app-first). Santam already owns Kandua and may see Mendr as competitive; that said, a "Mendr provides the diagnosis, Santam handles the claim" partnership is conceivable. Naked is the safer first conversation.

6. **Pay-per-lead as an emergency revenue lever?** The founder has explicitly ruled this out. The recommendation stands. If revenue is short in Q3, look at the Verified add-on price (R400 could be R599) or a Premium-Marketing add-on (à la Jobber's Marketing Suite) before reintroducing per-lead economics.

---

## 10. The one-line summary

**Charge contractors a flat monthly fee. Give them free leads, business tools, and a trust badge. Build the spine that links every step from lead to paid. Year by year, make leaving genuinely impossible.**

That's the contractor strategy. Pricing anchors it. Tools build the moat. The marketplace is the wedge.

---

*Sources: SA pricing research and contractor SaaS stickiness research conducted via sub-agents May 2026. Full source citations preserved in session transcript and in section-end source links in the research output.*
