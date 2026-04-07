# Scandio — Full Product Roadmap to Paid Provider Launch (Q4 2026)

---

## Context and philosophy

This document covers everything required to take Scandio from a marketing and diagnosis flow into a platform that service providers will willingly pay R249 to R1,249 per month for. The principle throughout is that providers pay for lead quality and operational efficiency — not for features they have to learn. Every feature below must either bring them better jobs or save them meaningful time. If it does neither, it does not belong in the product.

The job booking and review system you described is the right instinct. Verified reviews tied to real jobs are worth more than any number of star ratings scraped from Google. This document builds that out fully.

---

## Section 1 — Authentication and access gates

### 1.1 Homeowner authentication

Currently the diagnosis flow runs without a login. This needs to change before paid plans launch, but the change must be handled carefully to avoid killing conversion.

The recommended approach is a soft gate at the match page rather than at the welcome page. Homeowners should be able to complete the full diagnosis without logging in. The moment they want to view provider details or make contact, they are prompted to create a free account. This preserves the diagnosis conversion rate while creating the authenticated user base needed for job tracking and verified reviews.

**Implementation:**

- Diagnosis flow remains unauthenticated
- Match page renders provider cards with names and ratings visible but contact details blurred
    - I think the provider cards should be shown (just showing their rating, number of reviews, and summary), but their names/ the map is blurred out, and when clicked, the user should be prompted to login or to create an account.
- A persistent bottom sheet or overlay appears when the homeowner taps any provider card: "Create a free account to contact this provider and receive your full Scandio Report"
- Account creation is email plus password or Google OAuth — two steps maximum
- On account creation the diagnosis is automatically linked to the new user account
- The blurred providers immediately resolve without requiring the user to re-run the diagnosis

**Database changes:**

- Add `user_id` foreign key to `diagnoses` table — nullable for anonymous diagnoses, populated on account creation or login
- Add `homeowners` table: `id`, `email`, `display_name`, `phone` (optional), `address` (optional), `created_at`, `auth_user_id`

### 1.2 Provider authentication and onboarding

Providers currently submit via the waitlist form. The paid launch requires a proper onboarding flow that takes them from application approval to a live profile.

**Onboarding steps:**

1. Admin approves waitlist application — triggers email via SendGrid with onboarding link
2. Provider clicks link, sets password, lands on onboarding wizard
3. Wizard collects: business name confirmation, primary trade, service areas (suburb multi-select), phone, WhatsApp number, business hours, website (optional)
4. Profile photo and up to 8 work photos uploaded with AI categorisation
5. Stripe subscription setup — founding member locks in R249/mo, others select plan
6. Profile goes live on match page

**Database changes:**

- Add `provider_users` table: `id`, `provider_id` (FK to `providers`), `auth_user_id`, `role` (owner, team_member), `created_at`
- Add `onboarding_completed_at` to `providers` table
- Add `stripe_customer_id`, `stripe_subscription_id`, `subscription_plan`, `subscription_status` to `providers` table

---

## Section 2 — In-app messaging

This is the most critical infrastructure piece. Everything else — jobs, invoices, reviews — flows through messaging. Without it you cannot enforce the verified review system or track job lifecycle.

### 2.1 Conversation model

When a homeowner taps "Get in Touch" on a provider card, a conversation is created in the database. This conversation is permanently linked to the diagnosis that triggered it. The provider and homeowner exchange messages within this thread. All contact information exchange happens here — phone numbers and WhatsApp links are available inside the thread but are not shown on public provider profiles.

**Database tables:**

```
conversations
  id uuid pk
  diagnosis_id uuid fk → diagnoses
  homeowner_id uuid fk → homeowners
  provider_id uuid fk → providers
  status text — active | quoted | job_started | job_completed | disputed | closed
  created_at timestamptz
  last_message_at timestamptz

messages
  id uuid pk
  conversation_id uuid fk → conversations
  sender_type text — homeowner | provider | system
  sender_id uuid
  message_type text — text | quote | invoice | job_update | system_event
  content text nullable
  metadata jsonb nullable — stores structured data for quotes/invoices/events
  created_at timestamptz
  read_at timestamptz nullable
```

### 2.2 Conversation UI

**Homeowner side (`/messages` or embedded in `/match`):**

- Thread list showing all conversations grouped by provider
- Each thread shows provider name, last message preview, unread count, conversation status badge
- Thread view shows message history with provider name and avatar
- Homeowner can send text messages and see structured cards for quotes and invoices
- Homeowner receives push notifications via browser notifications API and email for new messages

**Provider side (`/pro/inbox`):**

- Same thread list but grouped by homeowner
- Provider sees the homeowner's Scandio Report at the top of each conversation — fault type, cost estimate, images — before reading a single message
- Provider can send text, quotes, and invoices directly from the thread
- Unread badge on the nav icon

### 2.3 Real-time delivery

Use Supabase Realtime subscriptions on the `messages` table. Both parties subscribe to their conversation threads. New messages appear without page refresh. Read receipts are written back to `messages.read_at` when the message enters viewport.

---

## Section 3 — Job lifecycle

### 3.1 How a job starts

A job does not start when a homeowner messages a provider. It starts when a formal quote is accepted. This is the correct design because it creates a clear contract moment that the platform can enforce.

**Flow:**

1. Homeowner contacts provider through the conversation
2. Provider sends a quote (structured card within the message thread)
3. Homeowner reviews quote — Accept or Decline buttons appear in the thread
4. On Accept: a `jobs` record is created, conversation status changes to `job_started`, both parties receive a confirmation message from the system, a system message appears in the thread: "Job started — [Date]. Provider: [Name]. Homeowner: [Name]."
5. Provider is notified via email and in-app

**Database table:**

```
jobs
  id uuid pk
  conversation_id uuid fk → conversations
  diagnosis_id uuid fk → diagnoses
  homeowner_id uuid fk → homeowners
  provider_id uuid fk → providers
  quote_amount decimal
  quote_accepted_at timestamptz
  started_at timestamptz
  completed_at timestamptz nullable
  disputed_at timestamptz nullable
  dispute_reason text nullable
  status text — active | pending_completion | completed | disputed
  created_at timestamptz
```

### 3.2 How a job ends

This is where your instinct about the 72-hour window is correct and well-thought-out. Here is the full implementation:

**Flow:**

1. Provider taps "Mark Job as Complete" in their job view
2. System sends a message to the homeowner: "Your provider has marked this job as complete. If you are satisfied, you do not need to do anything — the job will close automatically in 72 hours. If there is an issue, tap Raise a Dispute before then."
3. A 72-hour countdown is visible to both parties in the conversation
4. If the homeowner does nothing: job status changes to `completed` automatically, review prompt is sent to homeowner
5. If the homeowner taps "Raise a Dispute": job status changes to `disputed`, both parties are notified, dispute flow begins

### 3.3 Dispute resolution

For the dispute flow, the honest answer is that you should not build a complex arbitration system at this stage. You do not have the team to manage it and getting it wrong is worse than keeping it simple.

The recommended approach for Q4 2026 is manual resolution. When a dispute is raised:

1. Both parties are asked to submit their account of what happened — a text field, maximum 500 characters, submitted once
2. A system message appears: "Our team has been notified and will be in touch within 2 business days."
3. A `disputes` record is created and appears in the admin dashboard
4. You review it manually and mark it as resolved in favour of homeowner or provider
5. The resolved outcome updates the job status and sends a notification to both parties

This is not scalable long-term but it is honest about what a 1 to 2 person team can manage in the first six months. Revisit after 50 disputes to understand the patterns before building automated resolution.

### 3.4 Final invoice

After job completion the provider can issue a final invoice from the conversation thread. This is separate from the quote — the quote is an estimate, the invoice is the final amount. The homeowner receives the invoice in the thread and via email. Payment happens outside the platform for now (Scandio Pay is a 2028 feature).

---

## Section 4 — Verified review system

This is your strongest trust differentiator versus Kandua. Every review on Scandio is tied to a completed job. No job, no review. This is the rule and there are no exceptions.

### 4.1 Review prompt

72 hours after a job completes (either automatically or accepted by the homeowner), the system sends a review request:

- In-app notification
- Email: "How did [Provider Name] do? Leave a review — it takes 30 seconds and helps other homeowners."

The review link is a one-time token linked to the specific job. It expires after 30 days. It can only be used once.

### 4.2 Review structure

The review is not a single star rating. It uses a structured format that produces more useful signal:

```
Overall rating: 1–5 stars (required)
Category ratings (each 1–5, optional):
  - Punctuality — did they arrive when they said they would?
  - Workmanship — how good was the actual work?
  - Communication — did they keep you informed?
  - Quote accuracy — did the final amount match what you were quoted?
  - Site cleanliness — did they leave the site tidy?
Written review: free text, 20–500 characters (optional)
Would you book again: Yes / No / Maybe (required)
```

The category ratings feed into the provider's profile — each category is shown separately, not averaged together. A provider with 5-star workmanship and 2-star punctuality shows both scores. This is more honest than a single number and more useful to homeowners making decisions.

**Database table:**

```
reviews
  id uuid pk
  job_id uuid fk → jobs unique
  homeowner_id uuid fk → homeowners
  provider_id uuid fk → providers
  overall_rating integer 1–5
  punctuality_rating integer nullable
  workmanship_rating integer nullable
  communication_rating integer nullable
  quote_accuracy_rating integer nullable
  site_cleanliness_rating integer nullable
  written_review text nullable
  would_book_again text — yes | no | maybe
  token text unique
  token_used_at timestamptz nullable
  token_expires_at timestamptz
  created_at timestamptz
  published_at timestamptz nullable
```

### 4.3 Provider response to reviews

Providers on Basic Team and Enterprise plans can respond to reviews. The response appears below the review on their profile. One response per review, maximum 300 characters. Responses cannot be edited after 24 hours.

### 4.4 Review moderation

Reviews go through a brief moderation hold — 24 hours — before publishing. This gives the provider time to flag an obviously fraudulent or abusive review. Flagging pauses publication and creates an admin task. The homeowner is not notified their review is flagged. If the flag is dismissed, the review publishes. If upheld, the review is removed and the homeowner is notified.

---

## Section 5 — Provider CRM

This is the feature that justifies the subscription price more than anything else. A sole trader currently manages their customer relationships in WhatsApp, a spreadsheet, and their memory. Giving them a proper CRM that auto-populates from Scandio jobs is genuinely valuable.

### 5.1 Customer records

Every homeowner who contacts a provider through Scandio is automatically added to the provider's CRM. The provider can also manually add customers who came from outside Scandio.

**Customer record contains:**

- Name, phone, email, address
- Source: Scandio (auto) or manual import
- Job history: all jobs with this customer, each showing date, fault type, job amount, status, and review if given
- Quote history: all quotes sent, with status (pending, accepted, declined, expired)
- Invoice history: all invoices with payment status
- Notes: private free-text notes visible only to the provider
- Review status: whether this customer has reviewed the provider after their last job
- Gallery images: photos the provider uploaded for this customer's job

**Database table:**

```
crm_contacts
  id uuid pk
  provider_id uuid fk → providers
  homeowner_id uuid fk → homeowners nullable — null for manual imports
  name text
  phone text nullable
  email text nullable
  address text nullable
  source text — scandio | manual | import
  notes text nullable
  created_at timestamptz
  updated_at timestamptz
```

### 5.2 CRM import

Providers on any paid plan can import existing customers via CSV. The import maps columns to the `crm_contacts` schema. Required fields are name and at least one contact method (phone or email). Duplicates are detected by email address and merged rather than creating new records.

The import UI is a drag-and-drop CSV uploader with a column mapping step and a preview before confirmation. Maximum 500 records per import on Solo and Basic Team plans. Unlimited on Enterprise.

### 5.3 CRM views

- **Contact list**: searchable, filterable by source, job count, last job date
- **Contact detail**: full history of all interactions with this customer
- **Job pipeline**: Kanban view showing all jobs by status — enquiry, quoted, active, completed, disputed
- **Recent activity**: chronological feed of new messages, accepted quotes, completed jobs, new reviews

### 5.4 CRM notifications

Providers receive in-app and email notifications for:
- New message from a homeowner
- Quote accepted or declined
- Job marked as complete (by the system after 72 hours or by homeowner acceptance)
- New review published
- Review flag resolved

Notification preferences are configurable per channel (in-app, email, WhatsApp) per event type.

---

## Section 6 — Quotes and invoices

### 6.1 Quote template

All providers on any paid plan get access to the Scandio quote template. The template is rendered in the browser and exported as PDF.

**Quote contains:**

- Provider logo (uploaded) or Scandio-branded header if no logo uploaded
- Provider name, address, phone, email
- Homeowner name and address
- Quote reference number (auto-generated, sequential)
- Date issued and expiry date (default 30 days, configurable)
- Line items: description, quantity, unit price, VAT flag, line total
- Subtotal, VAT total (15%), grand total
- Payment terms
- Scandio watermark on Solo plan — removed on Basic Team and above

**Quote actions:**
- Send via in-app message (embeds as a structured card the homeowner can accept or decline)
- Download as PDF
- Copy link (generates a shareable PDF link valid for 30 days)

### 6.2 Invoice template

Identical structure to quote but with:
- Invoice number instead of quote number
- Payment due date
- Bank details field (provider fills in once, persists across all invoices)
- "Amount Paid" field for partial payments
- Balance due calculation

### 6.3 Custom templates (Basic Team and Enterprise)

Providers on Basic Team and Enterprise can upload their own quote and invoice template as a `.docx` file. The system extracts the template structure and maps Scandio data fields to template placeholders using a documented field syntax — `{{homeowner_name}}`, `{{quote_total}}`, `{{line_items}}` and so on. The uploaded template is rendered server-side using a Word template library and exported as PDF.

This is the most technically complex feature in this section. Use `docxtemplater` or equivalent for server-side Word template rendering. Add this to the Q2 2027 sprint rather than launch — the Scandio-branded template is sufficient for Q4 2026.

### 6.4 Quote and invoice storage

All quotes and invoices are stored in Supabase Storage as PDFs. They are linked to the relevant job and CRM contact. The homeowner can access their quotes and invoices from their account dashboard.

```
documents
  id uuid pk
  job_id uuid fk → jobs nullable
  conversation_id uuid fk → conversations nullable
  provider_id uuid fk → providers
  homeowner_id uuid fk → homeowners nullable
  document_type text — quote | invoice
  status text — draft | sent | accepted | declined | paid
  amount_cents integer
  pdf_path text
  reference_number text unique
  issued_at timestamptz
  expires_at timestamptz nullable
  paid_at timestamptz nullable
  created_at timestamptz
```

---

## Section 7 — Provider dashboard

The provider dashboard (`/pro/dashboard`) is the home screen providers see after login. It replaces the current placeholder.

### 7.1 Dashboard overview

**Top row — four metric cards:**
- New enquiries this week
- Active jobs
- Revenue this month (sum of accepted invoices)
- Average rating (Bayesian, across all reviews)

**Second row — activity feed:**
Chronological list of the last 20 events across all conversations and jobs. Each event is clickable and navigates to the relevant thread or job.

**Third row — two columns:**
Left: Upcoming jobs (jobs with `started_at` in the next 7 days if scheduling is added, otherwise active jobs sorted by last message)
Right: Pending actions (quotes awaiting response, jobs pending completion confirmation, reviews requiring response)

### 7.2 Profile completeness indicator

A persistent progress bar or checklist showing profile completeness. Items include: profile photo, business description, work photos (minimum 3), service areas, certifications, business hours, WhatsApp number, bank details for invoices. Incomplete profiles rank lower in match results — this is stated explicitly in the UI to motivate completion.

### 7.3 Analytics (Basic Team and Enterprise)

- Profile views over time (7 days, 30 days, 90 days)
- Conversion rate: profile views to enquiries
- Quote acceptance rate
- Average job value
- Review score trend over time
- Comparison to network average (anonymised benchmark)

---

## Section 8 — Provider profile (public-facing)

The current `/pro/[id]` page needs significant expansion to justify the subscription and to give homeowners enough information to make a confident decision.

### 8.1 Profile sections

**Header:**
- Provider name and logo
- Primary trade badge and secondary trade tags
- Star rating with category breakdown (punctuality, workmanship, communication, quote accuracy, cleanliness)
- Total reviews count
- Years in business
- Verified badge (Basic Team and above, after identity verification)
- Open / closed status based on business hours
- Distance from homeowner

**About:**
- Bio (from enrichment or manually written — provider can override the AI-generated bio)
- Service areas as pill tags
- Certifications and registrations

**Work gallery:**
- Photo grid of categorised work photos
- Filterable by job type if categories are tagged

**Reviews:**
- Full review list, most recent first
- Each review shows: overall rating, category ratings, written review, would book again, date, provider response if given
- Filter by rating, category

**Contact:**
- "Send Enquiry" button — opens the in-app messaging flow
- Phone and WhatsApp visible to logged-in homeowners only
- Business hours

### 8.2 What changes by plan tier

| Feature | Founding / Solo | Basic Team | Enterprise |
|---|---|---|---|
| Profile visible in search | Yes | Yes | Yes |
| Work photo gallery | Yes | Yes | Yes |
| Category review scores | Yes | Yes | Yes |
| Verified badge | No | Yes | Yes |
| Provider review response | No | Yes | Yes |
| Analytics on profile views | No | Yes | Yes |
| Custom quote template | No | No | Yes |
| White label report branding | No | No | Yes |
| Priority placement | Launch only | Yes | Highest |

---

## Section 9 — Homeowner account dashboard

Homeowners need their own dashboard to make the platform feel coherent rather than transactional.

### 9.1 Homeowner dashboard (`/account`)

- **My Reports**: all Scandio Reports generated, each with fault type, date, and link to the full report
- **My Jobs**: all active and past jobs, each showing provider, status, amount, and link to conversation
- **My Messages**: all conversations with providers
- **My Reviews**: reviews given and pending review prompts
- **Saved Providers**: providers the homeowner has bookmarked from the match page

### 9.2 Report history

Each diagnosis is permanently saved to the homeowner's account. They can share any past report with a new provider. This is useful when a homeowner had a fault diagnosed but did not immediately book — they can retrieve the report months later.

---

## Section 10 — Subscription and billing

### 10.1 Stripe integration

Use Stripe for all subscription management. The integration covers:

- Subscription creation at end of founding period (or immediately for new sign-ups after launch)
- Monthly recurring billing in ZAR
- Webhook handling for payment success, payment failure, subscription cancellation
- Grace period: 7 days after failed payment before account downgrade
- Downgrade logic: if a provider on Basic Team fails to pay, they revert to Solo features without losing their data

**Stripe products to create:**
- Solo — R249/mo recurring
- Basic Team — R649/mo recurring
- Enterprise — R1,249/mo recurring
- Founding Member — R249/mo recurring (locked rate, separate product)

### 10.2 Billing page (`/pro/billing`)

- Current plan and next billing date
- Payment method management (Stripe customer portal link)
- Invoice history (Stripe invoices, not to be confused with job invoices)
- Plan upgrade/downgrade controls
- Cancellation flow with a retention question before confirming

### 10.3 Plan enforcement

Feature access is checked server-side on every relevant API call. Store `subscription_plan` and `subscription_status` on the provider record and check it in middleware or route handlers. Never rely solely on client-side feature flags.

---

## Section 11 — Notifications system

### 11.1 Notification types

| Event | Homeowner | Provider |
|---|---|---|
| New message received | Email + in-app | Email + in-app |
| Quote received | Email + in-app | — |
| Quote accepted | — | Email + in-app |
| Quote declined | — | Email + in-app |
| Job started | Email + in-app | Email + in-app |
| Job completion pending | Email + in-app | — |
| Job completed | Email + in-app | Email + in-app |
| Dispute raised | Email + in-app | Email + in-app |
| Review prompt | Email + in-app | — |
| New review published | — | Email + in-app |
| Subscription payment | — | Email |
| Payment failed | — | Email |

### 11.2 WhatsApp notifications (Phase 2)

After launch, add WhatsApp Business API notifications for high-priority events — new messages, job starts, and review prompts. This is the highest-converting notification channel for SA providers. Use 360dialog or Twilio for delivery. Phase 2 target: Q1 2027.

---

## Section 12 — Admin dashboard extensions

The existing admin pages need extensions to manage the new features.

### 12.1 Jobs admin (`/admin/jobs`)

- Table of all jobs with status, provider, homeowner, amount, created date
- Filter by status — active, completed, disputed
- Dispute queue: list of open disputes with both parties' submissions, resolve button
- Export to CSV

### 12.2 Reviews admin (`/admin/reviews`)

- Table of all reviews pending moderation
- Each review shows: homeowner, provider, overall rating, written review, job details
- Approve or remove with a reason
- Flag queue: reviews flagged by providers awaiting decision

### 12.3 Subscriptions admin (`/admin/subscriptions`)

- Table of all provider subscriptions with plan, status, next billing date
- Filter by plan, status (active, past due, cancelled)
- Stripe webhook event log for debugging payment failures

---

## Section 13 — Additional provider features that justify the price

Beyond what you described, the following features complete the value proposition at each tier.

### 13.1 Availability calendar (Basic Team and above)

A simple calendar view where providers mark themselves as unavailable. When a homeowner sends an enquiry, the provider's next available dates are shown in the conversation. Not a full scheduling system — just availability blocking to reduce the back-and-forth of "when are you free."

### 13.2 Lead management pipeline

A simple Kanban board in the CRM showing all open enquiries by stage: New Enquiry, Quote Sent, Quote Accepted, Job Active, Awaiting Completion, Completed. Drag cards between stages. Filter by trade category. This gives a sole trader an at-a-glance view of their workweek.

### 13.3 Scandio Report branding (Enterprise)

On the Enterprise plan, the Scandio Report delivered to homeowners carries the provider's logo alongside the Scandio logo. When a homeowner generates a report and is then matched with a provider, that provider's brand appears on the document they receive. This is a significant perceived value for larger operations.

### 13.4 Team member management (Basic Team and above)

Providers on Basic Team can add up to 5 team members with their own login credentials. Each team member sees the shared inbox and CRM but cannot access billing or subscription settings. Enterprise has unlimited seats with role-based permissions — owner, manager, field technician.

### 13.5 Job photo documentation

Within a job conversation, both parties can upload photos at any stage. The provider uses this to document the work — before photos, during, and after. These photos are attached to the job record and the CRM contact. After job completion, the provider can choose to add the after photos to their public work gallery. The homeowner can use uploaded photos to document an issue before the provider arrives.

### 13.6 Service area management

Providers can set and update their service areas from the dashboard — a suburb multi-select with map preview. Changes take effect in match results within 24 hours (after the enrichment cache refreshes). This lets providers expand or contract their coverage as capacity changes.

### 13.7 Response time badge

The match page currently shows a static Open/Closed badge. Add a response time indicator calculated from actual message data — "Typically replies within 2 hours." This updates dynamically as the provider's messaging behaviour changes. Fast-responding providers rank higher in match results. This creates a genuine incentive to be responsive that directly improves their lead conversion.

---

## Section 14 — Launch sequence and sprint plan

### Pre-launch (now to end April 2026)
- Authentication gate at match page with soft prompt
- Homeowner account creation and diagnosis linking
- Provider onboarding wizard (post-waitlist approval)
- Stripe subscription setup
- Basic provider dashboard (metrics only, no CRM)

### Sprint 1 — May to June 2026
- In-app messaging infrastructure (conversations and messages tables, Supabase Realtime)
- Homeowner and provider message UI
- Scandio-branded quote template (browser-rendered, PDF export)
- Basic invoice template
- Notification emails via SendGrid for new messages

### Sprint 2 — July to August 2026
- Job lifecycle (start on quote acceptance, completion with 72-hour window)
- Dispute flow (manual resolution, admin dashboard queue)
- Verified review system (prompt, structured rating, moderation hold)
- CRM contact records (auto-populated from Scandio jobs)
- Lead pipeline Kanban view

### Sprint 3 — September 2026 (paid launch)
- CRM CSV import
- Review response (Basic Team and above)
- Analytics dashboard (Basic Team and above)
- Profile completeness indicator
- Billing page and Stripe customer portal
- Plan enforcement across all feature gates

### Sprint 4 — October to December 2026
- Availability calendar
- Team member management
- Job photo documentation
- Custom quote template upload (Enterprise)
- WhatsApp notification integration
- Response time badge on match page

---

## Section 15 — Database migration summary

All new tables to create before Sprint 1 begins:

```
homeowners
provider_users
conversations
messages
jobs
reviews
documents
crm_contacts
disputes
notifications
```

All columns to add to existing tables:

```
diagnoses: user_id (fk homeowners)
providers: onboarding_completed_at, stripe_customer_id, stripe_subscription_id,
           subscription_plan, subscription_status, response_time_minutes
```

All new Supabase Storage buckets:

```
job-photos (private, accessible to conversation participants only)
provider-logos (public)
custom-templates (private, accessible to provider only)
documents (private, accessible to homeowner and provider on that job)
```

All new Supabase Realtime subscriptions:

```
messages (filtered by conversation_id)
notifications (filtered by user_id and user_type)
jobs (filtered by provider_id or homeowner_id)
```

---

## The honest answer on price justification

At R249 per month, the value proposition is: better leads than Gumtree, no commission, and a profile that builds trust over time. That is defensible from day one.

At R649 per month, the value proposition is: everything above plus a real CRM that replaces the WhatsApp-and-spreadsheet workflow, team management, and analytics that show whether the spend is working. A provider doing 10 jobs per month at R2,500 average job value is generating R25,000 in monthly revenue. R649 is 2.6% of that. The bar for justification is low if the leads are real.

At R1,249 per month, the value proposition requires either white label branding for companies with their own client base, or unlimited team seats for operations with more than 5 people, or both. The Enterprise plan targets companies large enough that R1,249 is petty cash relative to their operational costs. The white label report feature is the anchor — it is the thing that makes Enterprise feel like a business tool rather than a directory listing.

The verified review system is the feature that makes all three tiers more valuable over time. A provider who has been on Scandio for 12 months with 40 verified reviews is sitting on a trust asset they cannot replicate anywhere else. That compounding lock-in is what keeps churn low and justifies the subscription fee long after the novelty of the diagnosis feature wears off.