# Mendr — Contractor Feature Spec

*Last updated: 2026-05-23. Owner: Matthew Prowse.*

This document is the canonical inventory of what we are building on the contractor side: every feature, what it actually does, which subscription tier it sits in, and which build phase it belongs to.

See `02-contractor-retention-and-pricing.md` for the strategic rationale and pricing model that underpins this spec.

---

## Phasing legend

- **MVP** — first 3 months. Must ship to make the entry tier credible.
- **v2** — months 4–9. The lock-in expansion features that make leaving genuinely painful.
- **v3** — months 10+. The high-ticket / large-team / strategic-tool features.

## Tier legend

- **Free (R0)** — listed in marketplace, 3 matched leads/month
- **Starter (R299/mo)** — solo tradesperson; 15 leads/month
- **Pro (R699/mo)** — small team (up to 5 seats); unlimited leads + ranking boost
- **Business (R1,499/mo)** — established team (unlimited seats); priority placement + advanced reporting
- **Verified Add-On (+R400/mo)** — live CIDB / NHBRC / Public Liability verification badge; orthogonal to any paid tier

---

## 1. Job management

The spine. Every other domain attaches to it.

### Job inbox
A single dashboard screen showing matched leads + scheduled jobs + active jobs + awaiting-payment jobs. Status chips: `New` / `Quoting` / `Scheduled` / `In Progress` / `Awaiting Payment` / `Closed`.

- **Tier:** all paid
- **Phase:** MVP

### Auto-create job from accepted lead
When the contractor taps "Accept" on a diagnosis match, a job record is created automatically: customer, address, diagnosis text, photos, trade, subcategory_id all pre-populated. No re-entry.

- **Tier:** all
- **Phase:** MVP

### Job status workflow
Update status with one tap. Each transition triggers a customer-facing notification ("Your contractor is on the way", "Job complete — please confirm"). Status history retained as audit log.

- **Tier:** all
- **Phase:** MVP

### Job photos: before / during / after
Tech uploads photos against the job record at each stage. Photos surface on the invoice and become evidence in any dispute.

- **Tier:** all paid
- **Phase:** MVP

### Job notes (internal)
Long-form private notes — gate codes, customer quirks, parts ordered.

- **Tier:** all paid
- **Phase:** MVP

### Job profitability tracker
Track parts cost + labour hours per job. Compute margin. Surface profitability per job type over time.

- **Tier:** Business
- **Phase:** v3

---

## 2. Quoting

Daily-use surface. Once a contractor's kit-bundle library is built here, switching means rebuilding it.

### Mobile quote builder
On-site, on a phone, in under 2 minutes. Line items with quantity, unit price, VAT. Customer info auto-populated from the job. Save as draft, send to customer.

- **Tier:** all paid
- **Phase:** MVP

### Reusable kit bundles
Save common job templates ("Standard geyser swap = element + thermostat + drip tray + 4 hrs labour"). One-tap drop into a new quote. Editable per use.

- **Tier:** Starter+
- **Phase:** MVP

### Customer accept/sign link
Customer receives the quote via WhatsApp or email, clicks a tokenised link, reviews, accepts with digital signature. No login required.

- **Tier:** all paid
- **Phase:** MVP

### Quote-to-invoice one-tap
When customer accepts, convert to invoice with one tap. No re-entry of line items.

- **Tier:** all paid
- **Phase:** MVP

### Quote expiry dates
Auto-expire after N days (default 30). Nudge customer at 75% of expiry.

- **Tier:** Starter+
- **Phase:** MVP

### Discounts + bundled pricing
Apply % or fixed discount. Surface savings to customer ("You save R200").

- **Tier:** Pro+
- **Phase:** v2

### Photo annotations on quotes
Mark up photos with arrows / circles ("replace this fitting") to make the quote scope visually clear. Sits inside the quote PDF.

- **Tier:** Pro+
- **Phase:** v2

### Branded quote templates
Contractor's logo, colours, banking details on every customer-facing surface. White-label feel.

- **Tier:** Pro+
- **Phase:** v2

---

## 3. Invoicing

SARS-compliant ZAR invoicing. Non-negotiable from day one.

### VAT-compliant tax invoice
Auto-generates with all SARS-required fields: contractor's VAT number, company reg, sequential tax invoice number, customer details, line items, VAT @ 15%, total. PDF render.

- **Tier:** all paid
- **Phase:** MVP

### PDF generation + WhatsApp / email delivery
One-tap send. Customer receives PDF + payment link. Read receipts tracked.

- **Tier:** all paid
- **Phase:** MVP

### Invoice status tracking
States: `Draft` / `Sent` / `Viewed` / `Paid` / `Overdue`. Surface in a dashboard with filters.

- **Tier:** all paid
- **Phase:** MVP

### Credit notes
For refunds or corrections. SARS-compliant credit note numbering. Reverses VAT on the linked invoice.

- **Tier:** Starter+
- **Phase:** MVP

### Recurring invoices
Auto-generate monthly / quarterly for service plans (pool, alarm, geyser annual inspection).

- **Tier:** Pro+
- **Phase:** v2

### Aged debtors report
Table of unpaid invoices grouped by age bucket: current / 30 / 60 / 90+ days. With one-tap "chase" action.

- **Tier:** Pro+
- **Phase:** v2

### Auto-chase on overdue
Configurable WhatsApp / email reminders at +3, +7, +14, +21 days. Customisable message per reminder.

- **Tier:** Pro+
- **Phase:** v2

### Year-end accounting pack
One PDF: all invoices, expenses, VAT summary, customer list. Designed for the bookkeeper.

- **Tier:** Pro+
- **Phase:** v2

---

## 4. Payments

Multiple integrations because SA contractors mix card-present, online, and EFT depending on the customer.

### Yoco card-present
Tap-to-pay or card-machine integration. Funds settle to the contractor's own Yoco account directly. Mendr records the transaction.

- **Tier:** all paid
- **Phase:** MVP

### PayFast / Peach card-not-present
Customer pays online via the invoice link. Card, EFT, Mobicred.

- **Tier:** all paid
- **Phase:** MVP

### Ozow / Capitec Pay instant EFT
Lower fees than card. Customer picks bank, pays in seconds. Auto-matched against the invoice.

- **Tier:** all paid
- **Phase:** MVP

### EFT references + bank-statement matching
Auto-generate unique reference per invoice. Pro tier adds bank statement import (Stitch / TrueID / direct CSV) + auto-match.

- **Tier:** Starter (reference only), Pro+ (matching)
- **Phase:** MVP / v2

### Card-on-file
Save customer's card for recurring service plans. Auto-charge on schedule. Compliant with PCI requirements (tokenisation via PayFast or Stripe).

- **Tier:** Pro+
- **Phase:** v2

### Escrow option
For marketplace-originated jobs, customer pays into Mendr-held trust. Released to contractor on job sign-off (or on dispute resolution). Critical trust feature for first-time contractor↔customer pairs. **Requires regulatory clarity — see implementation note below.**

- **Tier:** Pro+
- **Phase:** v2

### Consumer financing on jobs >R5,000
Partner with Mukuru, RainFin, Lulalend, or Mobicred. Customer applies in-flow; contractor gets paid in full upfront; customer pays the financier over 3–12 months.

- **Tier:** Business
- **Phase:** v3

### Mendr Pay processing margin
Optional 1% spread on top of Yoco / PayFast pass-through fees when contractor uses Mendr's escrow rails (3.95% Mendr Pay vs 2.95% direct Yoco). Funds the escrow infrastructure.

- **Tier:** Pro+ when escrow used
- **Phase:** v2

**Implementation note on escrow:** Mendr holding client funds may trigger FSCA registration or trustee-based structure. Pilot via a registered escrow partner (e.g. Escrow.com SA, Sygnia trust services) before in-house. Legal review required.

---

## 5. CRM — customer database

Simple, focused. Not Salesforce. The asset that grows in value monthly and creates the highest migration friction.

### Customer record auto-created from every lead
Name, phone, address (geocoded), language preference, first job date. Populated automatically the moment a lead is accepted.

- **Tier:** all paid
- **Phase:** MVP

### Job history per customer
Every diagnosis, quote, invoice, payment, photo timestamped against the customer. The contractor-side equivalent of the homeowner's home record.

- **Tier:** all paid
- **Phase:** MVP

### Tags + segments
Free-text tags: `VIP`, `Slow payer`, `Repeat`, `Referred by ...`. Filter customer list by tags.

- **Tier:** Starter+
- **Phase:** MVP

### Notes per customer
Long-form persistent notes ("Has a German Shepherd — call before arrival", "Prefers EFT").

- **Tier:** all paid
- **Phase:** MVP

### Communication log
Every WhatsApp message, call recording, email tied to the customer record. Searchable.

- **Tier:** Pro+
- **Phase:** v2

### Customer lifetime value (CLV)
Total paid invoices per customer + repeat-job probability score. Used for prioritisation and marketing.

- **Tier:** Pro+
- **Phase:** v2

### Last-contacted re-engagement prompts
"You haven't quoted Mrs. Naidoo in 14 months. Was there an issue?" Nudges contractor to revive dormant customers.

- **Tier:** Business
- **Phase:** v3

### Bulk import existing customers
CSV / Excel upload during onboarding. Mapping wizard to align columns to Mendr fields.

- **Tier:** all paid
- **Phase:** MVP

---

## 6. Scheduling

Drag-drop calendar. Single user on Starter; multi-tech on Pro+. This is the team-seats expansion cliff in action.

### Drag-drop calendar
Day / week / month view. Drag jobs between time slots and between team members. Conflict warnings on double-booking.

- **Tier:** Starter+
- **Phase:** MVP

### Job assignment to specific tech
Pick from team roster. Tech sees only their own jobs on their mobile view.

- **Tier:** Pro+ (multi-tech)
- **Phase:** MVP

### Travel time buffer
Auto-calculate driving time between consecutive jobs (Google Maps Directions API) and add buffer. Warn if back-to-back is too tight.

- **Tier:** Pro+
- **Phase:** v2

### Load-shedding awareness
Warn when a scheduled job overlaps with Stage 3+ for that suburb. Surface the schedule (from EskomSePush API). One-tap "reschedule" sends a WhatsApp to the customer with new options.

- **Tier:** all paid
- **Phase:** v2

### Google Calendar two-way sync
Contractor's personal Gmail calendar reflects Mendr jobs; events created in Gmail appear in Mendr.

- **Tier:** Pro+
- **Phase:** v2

### Customer reminders (day before)
Auto-send "Your contractor arrives tomorrow at 10am" the day before via WhatsApp + email. Reduces no-shows.

- **Tier:** Starter+
- **Phase:** MVP

### "On my way" notifications
One-tap by tech → customer receives WhatsApp with ETA, vehicle description, contractor photo.

- **Tier:** all paid
- **Phase:** MVP

### Reschedule with one tap
Tap → pick new slot → customer notified automatically with reschedule reason if provided.

- **Tier:** all paid
- **Phase:** MVP

---

## 7. Multi-user accounts + role-based access (RBAC)

The Pro tier's primary expansion cliff. Each role has scoped permissions.

### Role definitions

| Role | Permissions | Available in |
|---|---|---|
| **Owner** | Everything. Billing, team management, all reports, all jobs, all customer data | Subscription owner |
| **Admin** | Manage jobs/quotes/invoices for everyone. Approve refunds. Cannot manage billing or team membership | Pro (1), Business (3) |
| **Technician** | Sees ONLY assigned jobs. Can update status, upload photos, mark complete. Cannot view invoices or customer payment history | Pro (up to 5), Business (unlimited) |
| **Office** | Quote builder, customer support, scheduling. Cannot perform field actions | Pro (1), Business (3) |
| **Sub-contractor (daily-rate)** | Limited view of just their day's jobs. No customer payment data. No CRM access | Business |

### Invite team members
Email invite, OTP login, role selection. Resend invite + revoke flow.

- **Tier:** Pro+
- **Phase:** MVP

### Per-user mobile app view
Technician sees only their jobs today. Big buttons for status update, photo upload, mark done. Optimised for one-handed use in the field.

- **Tier:** Pro+
- **Phase:** MVP

### Job reassignment
Owner/admin drags job from one tech to another. Both notified.

- **Tier:** Pro+
- **Phase:** MVP

### Audit log
Who did what when. "Sipho updated invoice #12345 at 14:32." Filterable by user.

- **Tier:** Pro+
- **Phase:** v2

### Sub-contractor (daily-rate) roster
Limited login for casual labour. Cost-per-day tracked against job profitability. Worker assignment to a job without giving them full CRM access.

- **Tier:** Business
- **Phase:** v3

---

## 8. Communications

### WhatsApp Business chat mirror per job
Contractor sees the WhatsApp thread with the customer inside Mendr, tied to the job. Customer still uses WhatsApp natively. Detailed in `05-whatsapp-integration.md`.

- **Tier:** Starter+
- **Phase:** MVP

### Auto-status messages to customer
"Quote accepted — booking confirmed" / "Your contractor is on the way" / "Job complete — rate your experience." Templates approved by Meta.

- **Tier:** all paid
- **Phase:** MVP

### Voice note attachments
Tech records a voice note describing what they found on-site. Attached to job + customer record. Auto-transcribed (Google Speech, already integrated).

- **Tier:** all paid
- **Phase:** MVP

### Call recording on inbound calls
Phone calls to the contractor's Mendr-provisioned number are recorded and attached to the job. Useful for disputes.

- **Tier:** Business
- **Phase:** v3

### Multi-language customer surfaces
Quotes, invoices, and SMS in English / Afrikaans / isiXhosa per customer preference toggle.

- **Tier:** Business
- **Phase:** v3

### Quote / invoice / lead generation via WhatsApp
Contractor types `/quote Mrs Naidoo, geyser element R3500, labour R800` to the Mendr WhatsApp number. PDF generated, draft saved, contractor can preview before sending. Detailed in `05-whatsapp-integration.md`.

- **Tier:** Pro+
- **Phase:** v2

---

## 9. Reviews + reputation

The non-portable asset that makes leaving Mendr reputationally expensive.

### Auto-request review on job complete
When tech marks job done, customer auto-receives WhatsApp asking for rating. Already shipping (May 2026).

- **Tier:** all paid
- **Phase:** MVP

### Public review on contractor profile
Star rating + verbatim review appears on `/contractors/[id]`. Visible to all homeowners browsing matches.

- **Tier:** all paid
- **Phase:** MVP

### Reply to reviews
Contractor responds publicly. Handle bad reviews gracefully.

- **Tier:** Starter+
- **Phase:** MVP

### Flag fake reviews for admin review
Anti-spam / anti-malice mechanism. Mendr admin can suppress.

- **Tier:** all
- **Phase:** MVP

### Review-based ranking boost
More 5-star reviews → higher in matches. The spine flywheel.

- **Tier:** all paid
- **Phase:** MVP

---

## 10. Reports + analytics

### Lead intelligence dashboard
Leads received this month, conversion rate, by trade, by suburb. Visible to contractor.

- **Tier:** Starter+
- **Phase:** MVP

### Profile completeness score
Visible gamified progress bar with specific actions ("Add 3 photos to move from 2/3 to 3/3"). Drives self-service profile enrichment.

- **Tier:** all
- **Phase:** MVP

### Revenue summary
This month vs last month, top customers, top job types, average ticket size.

- **Tier:** Pro+
- **Phase:** v2

### Cashflow surface
"Pending invoices total R12,400. Overdue R3,200. Expected this week R8,500."

- **Tier:** Pro+
- **Phase:** v2

### Marketing ROI
Cost of Mendr subscription ÷ revenue from Mendr-matched jobs. The proof of subscription value.

- **Tier:** Pro+
- **Phase:** v2

### Job profitability report
Revenue minus parts and labour cost per job. Identifies money-losing job types.

- **Tier:** Business
- **Phase:** v3

### Year-over-year trends
Same month last year vs this year. Year-end summary export. Trend data is irreplaceable on migration.

- **Tier:** Business
- **Phase:** v3

---

## 11. Compliance + admin

### VAT201 export
Generate VAT201 line-item summary for SARS eFiling. CSV or push to Xero.

- **Tier:** Pro+
- **Phase:** v2

### Xero / Sage two-way sync
Customers, invoices, payments sync bi-directionally. Once a bookkeeper depends on it, the contractor's entire back-office is locked in.

- **Tier:** Pro+
- **Phase:** v2

### CIDB / NHBRC live verification
Programmatic check against public registers. "Verified" badge appears on profile + match results. Quarterly re-verification cron.

- **Tier:** Verified add-on
- **Phase:** v2

### Public liability cert tracking
Upload, expiry countdown, auto-flag at 30 days before expiry.

- **Tier:** Verified add-on
- **Phase:** v2

### POPIA consent + data export
Customer consent capture at lead acceptance. Per-customer data export / delete flows. Compliance dressed as lock-in (consent records live in Mendr).

- **Tier:** all paid
- **Phase:** v2

### CIPC + B-BBEE fields on every doc
Auto-populate on all customer-facing surfaces: company reg, B-BBEE level, VAT number.

- **Tier:** Pro+
- **Phase:** v2

---

## 12. Profile + marketplace presence

### Public profile page
The `/contractors/[id]` listing shown to homeowners. Photos, services, certifications, reviews. Already exists.

- **Tier:** all
- **Phase:** MVP

### Service area map
Draw your service radius on a map. Out-of-area leads not shown to contractor.

- **Tier:** Starter+
- **Phase:** MVP

### Featured placement
Pro+ contractors are shown higher in match results when ranking score ties.

- **Tier:** Pro+
- **Phase:** MVP

### Priority placement
Business tier shown first in match results regardless of rank score (within service area + trade match).

- **Tier:** Business
- **Phase:** v2

### Custom URL
`mendr.co.za/[your-business]` for marketing channels.

- **Tier:** Pro+
- **Phase:** v2

---

## 13. Tier-feature matrix

The single-table summary.

| Domain | Free | Starter | Pro | Business |
|---|---|---|---|---|
| **Lead allowance / mo** | 3 | 15 | Unlimited | Unlimited + priority |
| **Job inbox** | ✓ | ✓ | ✓ | ✓ |
| **Mobile quoting** | — | ✓ | ✓ | ✓ |
| **Reusable kit bundles** | — | ✓ | ✓ | ✓ |
| **VAT invoicing** | — | ✓ | ✓ | ✓ |
| **Credit notes** | — | ✓ | ✓ | ✓ |
| **Yoco / PayFast / Ozow** | — | ✓ | ✓ | ✓ |
| **Bank statement matching** | — | — | ✓ | ✓ |
| **Card-on-file** | — | — | ✓ | ✓ |
| **Escrow** | — | — | ✓ | ✓ |
| **Recurring invoices / service plans** | — | — | ✓ | ✓ |
| **Auto-chase overdue** | — | — | ✓ | ✓ |
| **CRM (basic)** | — | ✓ | — | — |
| **CRM with comms log + CLV** | — | — | ✓ | ✓ + re-engagement |
| **Scheduling (single user)** | — | ✓ | — | — |
| **Scheduling (multi-tech)** | — | — | ✓ (up to 5) | ✓ (unlimited) |
| **Job assignment + reassignment** | — | — | ✓ | ✓ + sub-contractors |
| **Audit log** | — | — | — | ✓ |
| **Travel time + load-shedding scheduling** | — | — | — | ✓ |
| **Google Calendar sync** | — | — | ✓ | ✓ |
| **WhatsApp chat mirror** | — | ✓ | ✓ | ✓ |
| **WhatsApp quote / invoice generation** | — | — | ✓ | ✓ |
| **Auto-status messages** | — | ✓ | ✓ | ✓ |
| **Voice note attachments** | — | ✓ | ✓ | ✓ |
| **Call recording** | — | — | — | ✓ |
| **Multi-language surfaces** | — | — | — | ✓ |
| **Review collection + replies** | ✓ | ✓ | ✓ | ✓ |
| **Ranking boost** | — | — | ✓ (featured) | ✓ (priority) |
| **Lead intelligence dashboard** | Basic | ✓ | ✓ | ✓ |
| **Revenue + cashflow reports** | — | — | ✓ | ✓ |
| **Marketing ROI** | — | — | ✓ | ✓ |
| **Job profitability** | — | — | — | ✓ |
| **Year-over-year trends** | — | — | — | ✓ |
| **Xero / Sage sync** | — | — | ✓ | ✓ |
| **VAT201 export** | — | — | ✓ | ✓ |
| **POPIA flows** | — | ✓ | ✓ | ✓ |
| **Branded quote templates** | — | — | ✓ | ✓ |
| **Custom URL** | — | — | ✓ | ✓ |
| **Service area map** | — | ✓ | ✓ | ✓ |
| **Consumer financing on >R5k** | — | — | — | ✓ |
| **Year-end accounting pack** | — | — | ✓ | ✓ |
| **Verified add-on** (CIDB + NHBRC + Public Liability) | — | +R400 | +R400 | +R400 |

---

## 14. Build order — MVP first 90 days

The minimum we need to ship before the entry tier is credible. Ordered by dependency.

1. **The spine** — Lead → Job → Quote → Invoice → Paid audit trail (job inbox, job status workflow, auto-create-from-lead)
2. **Customer record auto-population** from accepted leads
3. **Mobile quote builder** with one-tap save and customer accept link
4. **VAT-compliant invoicing** with WhatsApp + email delivery, PDF render
5. **Yoco + PayFast + Ozow payment integrations** with EFT references
6. **Reusable kit bundles** for quoting
7. **Single-user scheduling** (drag-drop calendar)
8. **WhatsApp chat mirror per job** (read in `05-whatsapp-integration.md` for full architecture)
9. **Auto-status messages** to customer (on-my-way, complete, review request)
10. **Subscription paywall** with volume gate at 3 leads (Free) and 15 leads (Starter)
11. **Profile completeness score** (gamified onboarding)
12. **Lead intelligence dashboard** (basic version)
13. **Public review collection + replies**
14. **Service area map**

That's the credibility floor for a R299/mo paid tier. Everything else builds on it.

---

## 15. Open product questions

1. **Bank statement import for matching — Stitch (proper SA aggregator) or CSV-only initially?** Stitch is the right choice long-term but costs and complexity are higher. CSV gets Pro tier shipped faster.

2. **Mendr Pay (the escrow rails) vs pure pass-through?** Holding client funds may trigger FSCA-regulated trustee structures. Pilot via Escrow.com SA or similar regulated partner before in-house.

3. **POPIA consent — block lead acceptance until contractor confirms POPIA-compliant process?** Adds friction. Likely soft-gate (warn but allow) for MVP, hard-gate at v2.

4. **Mobile app or PWA?** Mobile app gives push notifications + offline. PWA gets there 60% with 20% of the build cost. Recommendation: PWA for MVP, native app at v2 if conversion data justifies it.

5. **Should multi-language be Afrikaans-only at v3 launch and isiXhosa later?** Translation cost + maintenance is real. Afrikaans has higher Western Cape coverage; isiXhosa has higher national coverage. Recommendation: Afrikaans v3 launch, isiXhosa v3.5.

6. **Sub-contractor / daily-rate worker module — is it a Business-tier seat or a separate add-on?** Currently planned as Business-only. Could be a "+R50/sub-contractor/mo" add-on instead.

---

*See also: `02-contractor-retention-and-pricing.md` for the strategic context and pricing model. See `05-whatsapp-integration.md` for the WhatsApp Business API architecture that underpins quoting, invoicing, lead notifications, and customer messaging.*
