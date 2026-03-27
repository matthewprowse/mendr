# Scandio — 4-Month Product Roadmap

> Written: 2026-03-25
> Goal: Take the existing MVP into a fully operational two-sided marketplace — a complete homeowner experience and a complete provider experience — ready for paid tier launch.

---

## What This Product Is

Scandio is a **pre-diagnosis marketplace** for home maintenance in the Western Cape, South Africa. It sits between the homeowner's problem and the contractor's solution.

The core loop:
1. Homeowner photographs a fault
2. AI diagnoses it in under 60 seconds and generates a shareable report
3. Homeowner finds a local contractor, contacts them with the report already attached
4. Contractor arrives informed, not guessing

The business model is **subscription SaaS for contractors, always free for homeowners.** Contractors pay a monthly fee for visibility, verification, and CRM tools. Homeowners never pay. This is the competitive moat — no commission, no hidden cuts, pure subscription.

---

## What Homeowners Need for This to Be Valuable

A homeowner opens Scandio with a broken pipe, a damp wall, or a faulty DB board. For them to trust the app and return to it, they need:

**Confidence in the diagnosis**
The AI result must feel authoritative. It needs to name the problem clearly, explain what will happen if ignored, give a realistic cost range, and flag safety hazards. If a homeowner shows the report to a contractor and the contractor says "that's wrong," the homeowner never comes back. The diagnosis quality is the product.

**Frictionless discovery**
Finding the right contractor must take seconds, not minutes. The radius slider, the trade matching, and the card layout need to be fast and obvious. Homeowners won't tolerate broken UI or slow load times when they have an urgent problem.

**A reason to trust the contractor they find**
Right now trust signals are Google ratings and a few reviews. That is weak. Homeowners need to see **verified badges** (insurance, certification, business registration), **structured quality reviews** (not just star ratings — punctuality, cleanliness, workmanship accuracy), and **real work photos**. Without this, the directory is just a slightly better Google Maps.

**A persistent home record**
Homeowners will return if they can look back at previous faults, see what was fixed, and build a history of their property's issues. One-shot use (diagnose, close, forget) doesn't create loyal users. A **My Vault** — a timeline of every diagnosis and job tied to their home — turns Scandio into a property companion, not a one-time tool.

**Security and simplicity in communication**
When a homeowner shares a report with a contractor, they don't want to give out their personal WhatsApp or email unprompted. A simple in-app messaging thread — where they can send photos and get quotes — keeps sensitive information inside the platform and creates a clear record of what was agreed.

**Clarity on cost before the contractor arrives**
The current call-out fee estimate (R350 + R12/km) is a starting point. Homeowners also need to see quoted job costs before work begins. A clear quote, in-app, with line items, removes the most common source of homeowner anxiety.

---

## What Providers Need for This to Be Valuable

A contractor joins Scandio instead of ignoring it because they believe it will bring them better work. For that promise to hold:

**Qualified leads, not noise**
The difference between Scandio and a random enquiry is the Scandio Report. When a homeowner contacts a provider through the platform, the report should travel with the contact — the contractor sees the image, the diagnosis, the address, the estimated call-out. If this doesn't happen reliably, the product loses its core differentiator.

**A place to manage their jobs**
Right now there is no provider dashboard. A contractor who joins has no way to manage, accept, or track the jobs that come through. This is the single biggest gap in the product. Without a job management system, contractors can't actually use Scandio — they can only be found on it.

**A credible, controllable profile**
Contractors need to own their profile. That means uploading their own work photos, writing their own description, setting their own operating hours, and seeing their reviews in one place. It also means being able to correct Google data that is wrong. A provider who can't control how they appear will either ignore the platform or resent it.

**Verification that makes them stand out**
A verified badge — especially for insurance and certifications — is a competitive advantage. Providers who invest in verification should be visibly rewarded (higher placement, badge display, more trust from homeowners). This is also how Scandio charges more — higher tiers get better verification and better placement.

**Simple quoting and invoicing**
Contractors don't want to switch between Scandio and WhatsApp and a PDF template. If Scandio can handle the quote (line items, labor, call-out, total), send it to the homeowner in-app, and track whether it was accepted and paid, that is genuine value. Payment proof upload closes the loop.

**A fair pricing model they believe in**
Zero commission is a strong proposition. The monthly subscription must feel worth it. For it to feel worth it, the job quality must be visibly better than enquiries from Gumtree or Google. Founding members who lock in now must feel that was the right call when paid tiers launch.

**Analytics on their performance**
Contractors are running small businesses. They want to know: how many leads came in this month, how many converted, what their average job value is, and what their review score trends look like. This is a retention feature — the longer they stay, the more data accumulates, and the harder it becomes to leave.

---

## Current State Summary

| Area | Status |
|------|--------|
| AI diagnosis engine | ✅ Complete |
| Photo upload + storage | ✅ Complete |
| Provider search (Google Places) | ✅ Complete |
| Provider detail page (About, Reviews, Gallery) | ✅ Complete |
| Shareable report (`/report/[id]`) | ✅ Complete |
| WhatsApp integration (message generation) | ✅ Complete |
| Provider enrichment (AI summaries, photos) | ✅ Complete |
| Rate limiting | ✅ Complete |
| Homeowner accounts / login | ❌ Not built |
| My Vault (conversation history) | ❌ Not built |
| Contractor onboarding → database | ❌ Wired to nothing (TODO) |
| Contractor authentication | ❌ Not built |
| Provider dashboard | ❌ Not built |
| Job lifecycle (lead → quote → complete) | ❌ Not built |
| In-app messaging | ❌ Not built |
| Quote / invoice builder | ❌ Not built |
| Payment tracking | ❌ Not built |
| Verification + badges | ❌ Not built |
| Subscription billing | ❌ Not built |
| Product catalog (per provider) | ❌ Not built |
| Admin panel | ❌ Not built |
| Analytics dashboards | ❌ Not built |
| Video upload support | ❌ Not built |
| Customer favourites / saved providers | ❌ Not built |

---

## The 4-Month Plan

---

## Month 1 — Make It Real on Both Sides

**Theme:** Everything needed to have a real homeowner sign in, diagnose a fault, and have a real contractor receive and respond to that job.

The MVP already works for anonymous discovery. Month 1 closes the loop: accounts on both sides, jobs that can be tracked, and a working contractor dashboard shell.

---

### Week 1–2: Fix the Foundation + Contractor Onboarding

**Fix all launch blockers first** (from launch.md):
- [ ] Rotate all exposed API keys (Gemini, Google Places, Supabase service role)
- [ ] Rename `.env` → `.env.local`, add to `.gitignore`
- [ ] Create `.env.example` with placeholder values for every variable
- [ ] Fix `/chat` redirect — currently sends users to `/scan/{id}` which does not exist; should be `/diagnosis/{id}`
- [ ] Remove `@ts-nocheck` from `src/app/pro/[id]/page.tsx` and resolve type errors

**Wire up contractor onboarding:**
- [ ] Create `provider_profiles` table in Supabase with fields: `business_name`, `contact_name`, `email`, `phone`, `website`, `primary_trade`, `sub_trades`, `service_area_address`, `service_area_lat`, `service_area_lng`, `years_in_business`, `team_size`, `registration_number`, `about`, `referral_source`, `status` (`pending` | `active` | `suspended`), `plan_tier` (default: `founding`)
- [ ] Create `/api/pro/apply` POST route — validates onboarding form data with Zod, inserts to `provider_profiles`, returns new provider ID
- [ ] Wire `pro/onboard` form submit to `/api/pro/apply` (replaces the TODO `setTimeout`)
- [ ] On success: store provider ID in local session, redirect to a "Application received" confirmation page
- [ ] (Optional) Send confirmation email via Resend/SendGrid — "We've received your application, we'll be in touch within 2 business days"

**Deliverable:** A contractor can fill in the onboarding form and their data actually saves.

---

### Week 2–3: Authentication (Both Sides)

Authentication gates everything else. Use Supabase Auth with magic link (email OTP) for simplicity — no passwords to manage.

**Homeowner auth:**
- [ ] Add "Sign in / Create account" to navigation header (minimal, non-intrusive)
- [ ] Auth modal: email input → magic link sent → user clicks link → session created
- [ ] After sign-in, associate existing anonymous `conversations` with the user's `user_id` (match on session storage key set at diagnosis time)
- [ ] Create `customer_profiles` table: `user_id` (FK → auth.users), `display_name`, `primary_address`, `primary_lat`, `primary_lng`, `created_at`
- [ ] Populate `customer_profiles` on first sign-in (prompt for name, skip is fine)

**Contractor auth:**
- [ ] When a contractor applies via onboarding, their email is stored in `provider_profiles`
- [ ] Post-approval (manual for now), admin sends invite via Supabase Auth invite or magic link
- [ ] On first login, link `auth.users.id` → `provider_profiles.user_id`
- [ ] Pro routes (`/pro/dashboard`, `/pro/jobs/*`) check for valid provider session; redirect to `/pro/join` if not authenticated

**Deliverable:** Homeowners can create an account and contractors can log in post-approval.

---

### Week 3–4: Contractor Dashboard Shell + Job Model

**Create the jobs table:**
```
jobs
  id              uuid PK
  customer_id     uuid FK → auth.users (nullable for anonymous)
  provider_id     uuid FK → provider_profiles.id
  conversation_id uuid FK → conversations.id
  status          text: 'lead' | 'active' | 'quoted' | 'completed' | 'cancelled'
  source_channel  text: 'whatsapp' | 'phone' | 'in_app'
  customer_name   text
  customer_phone  text
  customer_address text
  notes           text
  created_at      timestamptz
  updated_at      timestamptz
```

**Dashboard pages:**
- [ ] `/pro/dashboard` — summary cards: leads this week, active jobs, completed jobs, average rating. Quick links to job inbox and profile
- [ ] `/pro/jobs` — table/list of all jobs for this provider, filterable by status
- [ ] `/pro/jobs/[jobId]` — job detail page:
  - Homeowner name, contact, address
  - Linked Scandio Report (diagnosis image, fault title, cost range)
  - Status badge + status change buttons (Accept Lead → Activate → Complete)
  - Notes field (contractor-only)
  - Placeholder sections for quote, messages (built in Month 2)
- [ ] `/pro/profile` — read/edit their provider profile (name, about, phone, website, sub-trades)
- [ ] Sidebar navigation (desktop) / bottom tab bar (mobile) for the pro area

**Job creation trigger:**
- [ ] When a homeowner clicks "Call" or "WhatsApp" on the match page for a provider that is a registered Scandio provider (i.e. has a `provider_profiles` record linked to their Google Place ID), create a `job` record with `status = 'lead'`
- [ ] This is how leads flow into the contractor's dashboard automatically

**Deliverable:** A logged-in contractor can see their dashboard, view incoming leads, and move jobs through a basic status flow.

---

## Month 2 — Engagement Loops

**Theme:** Give both sides the tools that make them come back. For homeowners: their home history. For contractors: messaging, quotes, and a profile they own.

---

### Week 5–6: In-App Messaging

This is the most critical feature for making Scandio a real marketplace rather than a directory. Without it, all communication happens off-platform and Scandio loses visibility into the relationship.

**Create messages tables:**
```
job_messages
  id            uuid PK
  job_id        uuid FK → jobs.id
  sender_id     uuid FK → auth.users
  sender_role   text: 'customer' | 'provider'
  body          text
  created_at    timestamptz

message_attachments
  id              uuid PK
  message_id      uuid FK → job_messages.id
  storage_path    text
  file_type       text: 'image' | 'document' | 'video'
  file_name       text
  file_size_bytes int
  created_at      timestamptz
```

**Message thread UI:**
- [ ] Messaging thread on `/pro/jobs/[jobId]` (contractor view) — shows full conversation, send field, attachment upload
- [ ] Messaging thread on `/diagnosis/[id]` or a new `/my-jobs/[jobId]` (homeowner view) — mirrors the contractor's thread
- [ ] Real-time updates using Supabase Realtime (subscribe to `job_messages` where `job_id = X`)
- [ ] Image attachment upload (reuse existing upload-image logic, add `message_attachments` record)
- [ ] Push notification stub: log to `audit_logs` when new message arrives (real push notifications in Month 4)
- [ ] RLS policies: contractor can only read/write messages on their own jobs; customer can only read/write messages on jobs where `customer_id = auth.uid()`

**Deliverable:** Homeowner and contractor can message each other inside a job thread, with image attachments.

---

### Week 6–7: Quote & Invoice Builder

**Add to the job detail page:**
- [ ] `job_quotes` table: `job_id`, `line_items` (JSONB array of `{description, quantity, unit_price}`), `callout_fee`, `travel_fee`, `subtotal`, `vat`, `total`, `status` (`draft` | `sent` | `accepted` | `rejected`), `sent_at`, `accepted_at`
- [ ] Quote builder UI on `/pro/jobs/[jobId]`:
  - Add/remove line items
  - Auto-calculate subtotal, VAT (15%), total
  - "Send Quote to Customer" button — updates status to `sent`, sends message with quote summary to thread
- [ ] Homeowner view: quote displays in their job thread as a structured card with "Accept" / "Decline" buttons
- [ ] On acceptance: job status moves to `active`, contractor notified in dashboard
- [ ] Invoice: once job is `completed`, quote becomes an invoice — contractor can mark as paid and upload payment proof (photo/PDF)
- [ ] `payment_proof_url` column on `job_quotes`

**Deliverable:** Full quote-to-invoice flow inside a job thread. Homeowner accepts quotes in-app.

---

### Week 7–8: Customer Hub (My Vault)

Turn the homeowner into a returning user rather than a one-time visitor.

**My Vault — `/my-home`:**
- [ ] Requires homeowner login
- [ ] Lists all conversations linked to `auth.uid()` — fault title, trade, date, image thumbnail, status (diagnosed / matched / job in progress / completed)
- [ ] Each item links back to `/diagnosis/[id]` and to the active job (if one exists)
- [ ] Filter by date range, trade, status
- [ ] Saved providers — star icon on provider cards; saves to `customer_saved_providers` table; accessible from `/my-home/saved`
- [ ] Settings — primary address(es), display name, notification preferences
- [ ] Mobile-first layout — most homeowner interactions happen on phone

**Link conversations to accounts:**
- [ ] When an anonymous user later signs in, match `conversations` where `session_id` matches a local storage key set at diagnosis time, back-fill `user_id`
- [ ] All future diagnoses by a logged-in user automatically link to their account

**Deliverable:** A homeowner can see their full property history, revisit past diagnoses, and see job status at a glance.

---

### Week 8: Provider Profile Ownership

Contractors need to control how they appear to homeowners.

- [ ] `/pro/profile/edit` — form to update: about/description, sub-trades, operating hours override (default from Google, allow custom), call-out fee base, rate per km
- [ ] `/pro/gallery` — manage work photos: upload new photos (with captions), reorder via drag-and-drop, delete photos, see pending/approved/rejected status
- [ ] Photos uploaded by provider go to `provider_images` with `source = 'scandio'`, `status = 'pending'` initially
- [ ] Basic auto-approval rule: if provider is `active` and `plan_tier` is not `founding`, approve immediately; otherwise queue for review
- [ ] Add `base_callout_fee` and `rate_per_km` fields to `provider_profiles` — use these in `/report/[id]` cost calculation instead of hardcoded defaults

**Deliverable:** Contractors control their profile copy, gallery, and pricing inputs.

---

## Month 3 — Verification, Tiers, and Monetisation

**Theme:** Build the trust layer homeowners need and the revenue model the business needs.

---

### Week 9–10: Verification System

**Verification tables:**
```
provider_verification_docs
  id              uuid PK
  provider_id     uuid FK → provider_profiles.id
  doc_type        text: 'id' | 'insurance' | 'coidc' | 'business_reg' | 'certification'
  storage_path    text
  status          text: 'pending' | 'verified' | 'rejected'
  reviewed_by     uuid FK → auth.users (admin)
  reviewed_at     timestamptz
  rejection_note  text
  uploaded_at     timestamptz
```

**Provider upload flow (`/pro/verification`):**
- [ ] Page listing required documents per plan tier with upload status for each
- [ ] File upload (PDF, JPEG, PNG) for each document type — stored in private Supabase bucket
- [ ] Status display: pending review / verified / rejected (with rejection note)
- [ ] Once all required docs for a tier are verified, `provider_profiles.verification_status` is updated

**Badge display:**
- [ ] `provider_profiles.badge_level`: `none` | `id_verified` | `quality_assured` | `verified_professional` | `scandio_elite`
- [ ] Badge renders on: provider cards in match results, provider detail page header, report page
- [ ] Badge colours and icons as per branding (consistent across all touchpoints)

**Admin verification queue (minimal):**
- [ ] A simple `/admin/verification` page (protected by admin role) listing pending documents
- [ ] View document, approve or reject with a note
- [ ] On approval, trigger badge level update

**Deliverable:** Providers can upload credentials, admins can verify them, and homeowners see trust badges on every provider touchpoint.

---

### Week 10–11: Subscription Tiers + Billing

**Plan definitions:**

| Tier | Monthly (ZAR) | Seats | Badge |
|------|--------------|-------|-------|
| Founding Member | Free | 1 | Legacy (locked rate) |
| Solo Starter | R149 | 1 | ID Verified |
| Team Lite | R399 | 3 | Quality Assured |
| Pro Team | R799 | 6 | Verified Professional |
| Enterprise | R1,499 | Unlimited | Scandio Elite |

**Payment integration:**
- [ ] Integrate **PayFast** (South African payment gateway, supports debit orders and instant EFT — more appropriate for ZAR than Stripe)
- [ ] `/api/billing/create-subscription` — creates PayFast subscription, stores `subscription_id` in `provider_subscriptions` table
- [ ] `/api/billing/webhook` — handles PayFast ITN (Instant Transaction Notification) callbacks: payment success → activate plan, payment failure → notify provider, cancellation → downgrade to Founding
- [ ] `provider_subscriptions` table: `provider_id`, `plan_tier`, `billing_cycle` (`monthly` | `annual`), `payfast_subscription_id`, `status`, `current_period_end`, `created_at`
- [ ] `/pro/settings/billing` — shows current plan, next billing date, upgrade/downgrade options, invoice history, cancellation

**Seat management:**
- [ ] `provider_seats` table: `provider_id`, `user_id` (FK → auth.users), `role` (`owner` | `member`), `invited_at`, `accepted_at`
- [ ] `/pro/settings/team` — invite team member by email (sends magic link), list current members, remove member
- [ ] Seat limit enforced: if provider has 2 active seats on Team Lite (3 seat limit), they can add one more before hitting the gate

**Feature gating:**
- [ ] Products catalog limited to: 10 items (Starter), 25 (Team Lite), 50 (Pro Team), unlimited (Enterprise)
- [ ] Gallery photos limited to: 10 (Starter), 25 (Team Lite), 50 (Pro Team), unlimited (Enterprise)
- [ ] Search placement: Founding and Starter show after verified tiers in results ranking

**Deliverable:** Contractors can subscribe to a paid plan, manage billing, and invite team members. Revenue begins.

---

### Week 11–12: Product Catalog

- [ ] `provider_products` table: `provider_id`, `name`, `description`, `price`, `unit` (e.g. "per hour", "per unit", "per m²"), `category`, `sort_order`, `is_active`
- [ ] `/pro/products` — CRUD interface: add, edit, reorder (drag handle), toggle active/inactive
- [ ] Products used in quote builder: "Add from catalog" dropdown pre-fills line item name, unit, and default price
- [ ] Displayed on provider profile page (homeowner view) in a new "Services & Pricing" tab — builds trust, sets expectations before contact

**Deliverable:** Contractors define their service catalog; homeowners see prices before they call.

---

## Month 4 — Polish, Analytics, and Launch Readiness

**Theme:** Everything needed to confidently flip the switch to public beta. Performance, mobile quality, analytics, and operational readiness.

---

### Week 13: Notification System

Without notifications, neither side will return organically. Users need to know when something requires their attention.

- [ ] Email notifications via Resend (transactional, not marketing):
  - Homeowner: "Your quote from [Provider] is ready to review"
  - Homeowner: "New message from [Provider]"
  - Contractor: "New lead — [Fault Title] — [Distance] away"
  - Contractor: "Your quote was accepted"
  - Contractor: "Verification document approved / rejected"
- [ ] In-app notification bell (top nav) — unread count badge, list of recent notifications, mark all as read
- [ ] `notifications` table: `user_id`, `type`, `title`, `body`, `link`, `is_read`, `created_at`
- [ ] Web push notifications (PWA) — optional stretch goal for this week

**Deliverable:** Both sides get timely notifications when action is required. Reduces drop-off at every handoff point.

---

### Week 13–14: Analytics Dashboards

**Contractor analytics (`/pro/analytics`):**
- [ ] Leads received (by week/month)
- [ ] Lead conversion rate (leads → active jobs)
- [ ] Average job value
- [ ] Revenue by month (from completed, paid jobs)
- [ ] Top performing trades/sub-trades
- [ ] Review score trend (star rating over time)
- [ ] Profile views vs contact rate

**Platform analytics (admin, `/admin/analytics`):**
- [ ] Daily active users (homeowners)
- [ ] Diagnoses generated per day/week
- [ ] Match searches per day
- [ ] Contact events (phone, WhatsApp, in-app) per day
- [ ] Contractor sign-ups and activation rate
- [ ] MRR (monthly recurring revenue from subscriptions)
- [ ] Churn rate

**Implementation:**
- [ ] Log events consistently to `audit_logs` (already exists, needs consistent population)
- [ ] Aggregate queries running nightly into summary tables (avoid heavy queries on dashboards)
- [ ] Recharts (already in dependencies) for all chart rendering

**Deliverable:** Contractors see whether Scandio is worth the subscription. You see whether the platform is growing.

---

### Week 14: Video Support

- [ ] Allow video uploads in the diagnosis flow (`/welcome`) — MP4/MOV, max 50MB, max 2 minutes
- [ ] Video thumbnail generation on upload (client-side canvas or server-side)
- [ ] Video playback in `/diagnosis/[id]` and `/report/[id]` (native HTML5 `<video>` with controls)
- [ ] Video attachments in job messages — same upload flow as images
- [ ] Supabase storage bucket for video (`diagnosis-videos`, `message-videos`) with appropriate size limits

**Deliverable:** Homeowners can show a leaking pipe in motion, not just a static photo. Diagnosis quality improves significantly for time-dependent faults.

---

### Week 14–15: Admin Panel

An admin panel is required to operate the marketplace — approving contractors, reviewing flagged content, resolving disputes, managing subscriptions.

**`/admin` routes (protected, admin role only):**
- [ ] `/admin/providers` — list all providers with filters (status, plan, verification level). View full profile, approve/suspend, edit plan tier manually
- [ ] `/admin/verification` — queue of pending verification documents. View file, approve or reject with note
- [ ] `/admin/jobs` — list all jobs across the platform with status, flagged jobs highlighted
- [ ] `/admin/reports` — customer-submitted reports/complaints about providers. Flag provider, contact provider, resolve dispute
- [ ] `/admin/analytics` — platform-level metrics (as above)
- [ ] Admin role enforcement: `user_roles` table or Supabase custom claims, checked on every admin route

**Deliverable:** You can operate the marketplace without touching the database directly.

---

### Week 15–16: Performance, Security, and Launch Preparation

**Performance:**
- [ ] Add `next/image` with `remotePatterns` for Supabase storage and Google Places image URLs — replaces `<img>` tags, enables automatic optimisation and lazy loading
- [ ] Audit all pages with Lighthouse — target 90+ on mobile for all core pages
- [ ] Add loading skeletons where missing (provider cards, diagnosis, report)
- [ ] Prefetch diagnosis and match pages (they are always the next step after welcome)
- [ ] Review and remove unused npm packages (`dotenv`, `tw-animate-css`, move `shadcn` to devDependencies)

**Security:**
- [ ] Implement full Supabase RLS policies:
  - `conversations`: readable by owner (`user_id = auth.uid()`) or public for `report/[id]` (anonymous read of specific fields only)
  - `jobs`: readable/writable only by the job's `provider_id` or `customer_id`
  - `job_messages`: scoped to job participants
  - `provider_profiles`: writable only by linked `user_id`
  - `provider_verification_docs`: readable only by owner and admins
- [ ] Audit all API routes — confirm every route that writes data validates the caller's session
- [ ] Add `NEXT_PUBLIC_` prefix audit — confirm no server secrets are exposed to the browser
- [ ] Remove `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` fallback in the providers route (use server-only key)
- [ ] Restrict Google Maps API keys in GCP console to allowed domains/referrers

**TypeScript cleanup:**
- [ ] Eliminate all `any` casts in `src/app/pro/hooks/` (reviews.ts, gallery.ts, providers.ts)
- [ ] Fix `auth-context.tsx` event/session typing
- [ ] Create shared type definitions for Supabase table rows in `src/types/`

**Launch checklist:**
- [ ] All environment variables documented in `.env.example`
- [ ] `README.md` updated with current setup instructions
- [ ] Supabase database backed up and production project separated from development
- [ ] Error monitoring set up (Sentry or equivalent — add to API routes and client error boundaries)
- [ ] Custom domain configured, SSL verified
- [ ] Google API key restrictions applied (domain lock, API scope limit)
- [ ] Smoke test every user journey end-to-end on mobile: diagnose → match → contact → job created → message → quote → accept → complete

**Deliverable:** The platform is secure, fast, and operationally ready. Public beta can go live.

---

## Milestone Summary

| Month | End State |
|-------|-----------|
| **Month 1** | Contractors can apply and have their data saved. Both sides can log in. Contractors see a dashboard with incoming leads and can move jobs through a basic status flow. |
| **Month 2** | Homeowners and contractors can message each other inside a job thread. Quotes can be sent, accepted, and tracked. Homeowners have a My Vault with their full property history. Contractors own their profile. |
| **Month 3** | Contractors can be verified with trust badges visible to homeowners. Subscription billing is live. Contractors can subscribe, manage their team, and define a product catalog. Revenue begins. |
| **Month 4** | Notifications keep both sides engaged. Analytics tell contractors whether Scandio is delivering ROI. An admin panel lets you operate without touching the database. The platform is secure, fast, and ready for public launch announcement. |

---

## Feature Count by Month

| Month | Homeowner Gains | Provider Gains | Platform Gains |
|-------|----------------|----------------|----------------|
| 1 | Login, account linking | Onboarding saves, dashboard, lead inbox, job status | Jobs table, provider auth |
| 2 | My Vault, messaging, quote review | Messaging, quote builder, invoice, profile ownership, gallery | RLS policies, real-time |
| 3 | Trust badges on every provider card | Verification upload, subscription management, team seats, product catalog | PayFast billing, admin verification queue |
| 4 | Notifications, video diagnosis | Analytics dashboard, notifications | Admin panel, Sentry, performance audit, full security review |

---

## What Makes Scandio Win

The risk for any two-sided marketplace is cold-start: providers won't join if there are no homeowners, homeowners won't use it if providers aren't on it. Scandio avoids this because the homeowner side already works without providers — the AI diagnosis has standalone value. A homeowner can get a useful result even if no contractor ever signs up.

This means the growth flywheel is:
1. Homeowners use the free diagnosis tool (no friction, no account required)
2. Homeowners share Scandio Reports with contractors via WhatsApp (organic distribution)
3. Contractors receive a Scandio Report and get curious about the platform
4. Contractors join to be findable by the homeowners already using it
5. More verified contractors means better matches → more homeowner trust → more usage
6. More usage → more leads → more contractor subscriptions → revenue

The job over the next four months is to build the infrastructure that supports steps 3 through 6 reliably.
