## Homeowner Onboarding And Pro Portal Plan

End-to-end build plan covering three connected pieces: the homeowner onboarding that captures a mobile number and consent, the funnel caps and account gate that sit between diagnosis and contacting a specialist, and the Pro portal (Home, Leads, Customers, Jobs, Quotes, Invoices, Team, Settings).

UI copy follows the Pro naming rule: titles say "Pros", body says "specialist(s)", the brand is "Mendr Pro". Routes and database tables keep the existing `providers` and `/contractors` names. Avoid the words "contractor" and "provider" in user-facing copy.

### Why This Order

The critical path is driven by one fact found in the code: on the web, Mendr does not currently hold the homeowner's phone number. The web contact flow opens `wa.me/{specialist number}`, `tel:`, or `mailto:` from the homeowner's own device, so nothing identifying is captured. A Mendr lead is only worth selling to a Pro once it carries the homeowner's number plus the structured diagnosis. So homeowner onboarding (capture the number, unverified for now) and the consent gate must land before the Pro Leads inbox has anything real to show. Everything in the Pro portal hangs off that.

### Decisions Locked In

- Diagnosis stays free. It is the acquisition lure, not a paywall. Caps exist for AI cost control and to nudge signup, not to charge homeowners.
- Contacting a specialist requires a logged-in account. Signup is frictionless: one-click Google, then capture the mobile number. The number is accepted unverified for now (lazy capture). SMS OTP verification is deferred until volume justifies the cost and friction, and ideally moves to WhatsApp OTP once the WhatsApp Business API is live.
- The specialist's contact number is hidden until consent. The match page shows the specialist and a Contact action, but the raw phone number is not rendered anywhere public until the homeowner has passed the consent gate. This closes the bypass where a homeowner could read the number off the public profile and skip lead capture.
- Consent is per-contact by default: a modal shown before the WhatsApp, Call, or Email action, scoped to the specific business being contacted. The modal carries a "Do not ask again for specialists I contact" checkbox that upgrades the homeowner to a global grant. Both are logged and revocable from settings. The lead and the shared identity are created at the moment of consent, before the homeowner sends any message, because that is the POPIA-relevant disclosure event.
- Initiation model: homeowner-initiated for now, with Pro follow-up allowed. The homeowner is routed to WhatsApp with a pre-filled message, but the Pro already has the identified lead and may reach out if the homeowner goes quiet. Blast-to-many ("contact several specialists at once") is deferred until the WhatsApp Business API is live and supply per trade is deep enough. Lead-win attribution is not inferred from WhatsApp; it is asked post-job from both sides via the existing `job_outcome_tokens` and rating email.
- Revocation stops Mendr showing the details going forward, removes them from that lead and customer record, and notifies the Pro to delete the contact. It cannot claw back what was already sent. The settings copy must say this honestly. The Pro is contractually bound (see POPIA) to honour deletion, which is what makes the promise enforceable.
- Quotes and invoices use one generated template plus branding fields, with two or three cosmetic presets layered on the same data model. No HTML upload.

### Open Sub-Decisions To Confirm

- Retention windows (see POPIA section): identified lead PII purged 12 months after last activity if no job resulted, invoiced-customer PII kept 5 years for tax. Confirm or tighten.
- Founding-Pro price point and what the launch bundle includes (a separate Founding Pro Offer doc already exists; reconcile with it).
- Whether to validate Pro willingness-to-pay after Leads (Phase 4) before building the full back-office (Phases 6 to 9). Recommended, see Build Order.

---

## Progress Checklist

Status as of the current build. Ticked items are implemented and verified (typecheck, lint, tests where applicable). Migrations marked applied are live on the database.

#### Phase 1, Homeowner Onboarding (complete, bar OTP)

- [x] Migration: `profiles.phone`, `profiles.phone_verified_at`, `lead_share_consent_settings` (applied)
- [x] SA phone util (normalise, validate, live-format) plus unit tests
- [x] Phone capture API (`GET`/`POST /api/account/phone`)
- [x] Onboarding flow `/onboarding`: phone step and address step, skippable, /start chrome
- [x] Reusable `AddressAutocomplete` matching the Settings address pattern
- [x] Post-Google-login redirect into onboarding when no phone yet
- [x] Google name populated into `first_name`/`surname` in the auth callback, plus backfill for existing rows
- [ ] SMS or WhatsApp OTP verification (deferred by design until volume)

#### Phase 2, Funnel Caps And The Contact Gate (core done, two pieces deferred)

- [x] Migration: `lead_contact_consents`, `diagnoses.refinement_count` (applied)
- [x] Caps rework in `quota.ts` (anonymous 3 per week, logged-in 3 per day)
- [x] Consent-settings API (`GET`/`PATCH` global mode)
- [x] Contact gate in the match page: sign-in, then captured number, then consent modal
- [x] `ContactConsentDialog` with the "do not ask again" upgrade to always-share
- [x] Contact write records the identified lead plus the consent record plus the number
- [x] Real consent copy replacing the Lorem ipsum under the WhatsApp button
- [x] Refinement fair-use cap: `POST /api/diagnose/refinement` increments and enforces 10 per diagnosis on the user-initiated Refine only; respects the quota kill switch
- [x] Identity gate: `/api/providers` strips name and all contact (phone, website, street address, photos) server-side for anyone not signed in with a captured number; cards carry `identityLocked`, show ratings and summary and suburb, and gate the profile and contact actions
- [ ] Flip `DISABLE_DIAGNOSIS_DAILY_QUOTA` to enable the slot caps and the refinement cap (your call)
- [ ] Residual: `/pro/[id]` direct access still reveals identity to a technical user who reads the `providerId` from the network. Closing it means tokenising provider ids or auth-gating the public profile, which trades off public and shared profile links. Deliberate follow-up.

#### Phase 3, Consent Records And Homeowner Settings (Settings UI done; POPIA obligations remain)

- [x] `lead_contact_consents` table (landed early in the Phase 2 migration)
- [x] Settings: consent-mode toggle (Settings > Privacy, "Sharing With Specialists")
- [x] Settings: "Specialists you have shared details with" list with revoke, plus honest revocation copy
- [x] Consent APIs: `GET /api/account/consents` (list) and `POST /api/account/consents/revoke`
- [x] Provable consent: `consent_text_version` stored on each grant (from the contact gate)
- [ ] POPIA remainder: Pro terms binding (needs the Pro portal), retention purge job, wire the new tables into data-subject export and delete, privacy-policy line

#### Phase 4, Pro Portal Home And Leads (workspace done; claim UI + enquiry detail remain)

- [x] `lead_states` table and `providers.merged_into` column (applied), plus `getClaimedProviderId` resolver
- [x] Pro nav and Mendr Pro naming (`Home`, `Leads`, `Account`)
- [x] Home dashboard (`/contractors/home`) with real stats and small-sample guards on rating and win rate
- [x] Leads inbox (`/contractors/leads`) on `provider_contact_events` + `lead_states`, inline status editing via `PATCH /api/pro/leads/[id]`, consent-gated contact
- [x] Enquiry detail (`/pro/leads/[id]`): full diagnosis, photos, consent-gated contact with WhatsApp/Call, private notes, status, Mark Won/Lost
- [x] Provider claiming flow (`/pro/claim`): search by name, submit a claim. Claims are pending and go through admin review (`provider_claims` table, `/admin/claims` queue with Approve/Reject); approval is what sets `claimed_by_user_id`. Manual ownership verification by the admin.
- [x] Unclaimed-lead acquisition lever: the claim search shows "N leads waiting" per business and sorts them first
- [ ] Create Quote action (deferred to Phase 6, Quotes)

#### Phases 5 to 10 (not started)

- [x] Phase 5, Customers CRM: `provider_customers` table, auto-seeded from consented identified leads (insert-only so Pro edits are kept) plus manual add; `/pro/customers` list and `/pro/customers/[id]` detail (editable info + lead history); `Customers` tab in the Pro nav
- [x] Phase 5b, Jobs (work orders): `jobs` table; `/pro/jobs` list + add, `/pro/jobs/[id]` detail (title, site address, scheduled date, status); a won lead auto-creates a job (idempotent); nav moved to a "More" popover (Account then More → Jobs) to make room for the back-office sections
- [x] Phase 6, Quotes: `quotes` + `quote_items` + `provider_branding` tables; `/pro/quotes` list, New Quote, and the `/pro/quotes/[id]` builder (line items, live totals, VAT-when-registered, deposit, validity, terms, status); Create Quote from a lead (pre-fills); public printable view `/quote/[id]` (shareable link, browser Save-as-PDF, stamps viewed). Deferred: server-side PDF generation (`@react-pdf/renderer`), a branding settings form (columns exist; renders defaults for now), and convert-to-invoice (lands with Phase 7)
- [x] Phase 7, Invoices: `invoices` + `invoice_items` + `credit_notes` + `provider_document_counters` tables, plus a gap-free `next_invoice_seq` RPC; `/pro/invoices` list, New Invoice, and the `/pro/invoices/[id]` editor (draft line items, live totals, VAT-when-registered, due date, deposit, terms). Issue assigns a permanent `INV-000N` number and locks the invoice (immutable; edits return 409 pointing at credit notes). Record Payment tracks partial/paid with running balance. Convert an accepted quote into a draft invoice (copies customer, items, totals). Public printable view `/invoice/[id]` ("Tax Invoice" when VAT-registered, banking details, balance due, browser Save-as-PDF); drafts are not publicly viewable. Deferred: credit-note UI (table exists), server-side PDF (`@react-pdf/renderer`), overdue auto-status
- [x] Phase 8, Team and roles: `provider_members` table (owner / admin / member, invite-by-email, status invited/active/removed) with the first claimer backfilled as owner; provider resolution (`getClaimedProviderId`) now also follows active membership, plus a `getProviderRole` helper. Invites link an already-registered Pro immediately (`get_user_id_by_email` RPC) and an on-signup trigger activates pending invites when that email registers. `/api/pro/members` (GET roster, POST invite) and `/api/pro/members/[id]` (PATCH role owner-only, DELETE remove with owner-immutable + admin-can't-remove-admin guards). Team page in the More nav mirrors the list patterns (invite dialog, inline role select, remove). Deferred: per-member lead/job visibility scoping (members currently see the full provider workspace), invite emails (link-on-login only for now)
- [x] Phase 9, Pro settings and analytics: `/pro/settings` surfaces the editable business profile (insurance cover, typical response time, pricing model, callout fee, preferred contact channel, realtime-alert toggle, owner/admin gated) plus a per-teammate notifications block (new enquiry, new review, weekly summary, preferred channel, quiet hours) backed by a new `provider_notification_preferences` table keyed by `(provider_id, user_id)`; `/api/pro/settings` (GET/PATCH, role-gated profile + own-row notification upsert). `/pro/analytics` shows real numbers from `provider_profile_views`, `provider_contact_events`, and `lead_states`: profile views and enquiries (all-time + last 30 days), views-to-enquiry conversion, win rate (won vs decided, hidden under 5 decided leads), and enquiries by trade. Both pages added to the More nav. Deferred: per-member notification delivery (the realtime alert still routes to the single provider email via `notify_realtime`), "scrolled past my card" impressions (needs a match-impression event first), leads-by-suburb (no suburb on contact events)
- [ ] Phase 10, Billing and payments (future)

#### Fixes And Groundwork Done Along The Way (not originally in the plan)

- [x] Account deletion fixed: `diagnoses.user_id` to SET NULL, dropped the `audit_logs.user_id` FK (append-only trigger conflict)
- [x] Avatar consistency: shows the Google photo via `avatar_url`, and a removed photo now persists
- [x] Removed the "Mike's Plumbing" demo data from Favourites
- [x] Linear backlog: MEN-43 (Resend/Supabase auth email hook), MEN-44 to MEN-49 (account-area audit and logged-out states)

#### Not Yet Verified In The Browser

- [ ] Full end-to-end manual test of the onboarding flow and the match contact gate
- [ ] Apply the migration files via the normal migration flow (they were applied directly via MCP)

---

## Current State, Grounded

What already exists and is reused by this plan.

#### Homeowner Side

- Diagnosis flow: `/start` builds the request, `/processing/[conversationId]` runs the pipeline via `/api/diagnose`, `/diagnosis` shows the result. The "Find Contractors" button at `src/app/diagnosis/client.tsx:1884` navigates to `/match/[conversationId]`. This is the diagnosis to match transition.
- Match and contact: `src/app/match/components/client.tsx`, `renderContactSlot` at line 935. No login required today. The contact buttons open `wa.me`, `tel:`, `mailto:` directly. The explainer text under the WhatsApp button at line 1028 is still Lorem ipsum.
- Diagnosis quota already exists: `src/app/api/diagnose/quota.ts`, currently 3 per day anonymous and 10 per day logged in, via the `increment_diagnosis_quota(p_user_id, p_anon_key, p_date)` RPC and a `scandio_anon` cookie. The `diagnosis_usage` table backs it (0 rows so far).
- IP rate limits: `src/lib/rate-limit-config.ts`. Buckets include `diagnose` (10 per 10 min) and `contactContractor` (20 per min), keyed by IP, backed by Upstash in production.
- Auth: Supabase, email and password plus OAuth plus email OTP. `src/lib/auth/supabase.ts`, `src/context/auth-context.tsx` (`useAuth`). Sign up at `src/app/auth/register`, callback at `src/app/auth/callback/route.ts` sets `profiles.profile_type` to `customer` or `pro`. No phone capture and no SMS OTP exist anywhere yet.
- Settings hub at `src/app/settings` with sub-pages Account, Addresses, Notifications, Privacy, Support. Addresses already does full CRUD on `profiles.locations` (jsonb). Privacy handles `user_data_consent` (analytics, training) and a data-export list. These are the patterns new pages mirror.
- Homeowner home dashboard at `src/app/home` is a partly built three-section layout (Activities, Most Recent, Announcements) reading `getHomeStats`, `getRecentDiagnoses`, `feature_announcements`.

#### Pro Side

- Portal shell at `src/app/contractors/(portal)`: a 10-step application wizard (`network/`), KYC, an application-status page (`account/`), reviews, service area. The nav (`layout.tsx`) is two links only and still says "Mendr Contractors".
- The `account` page only renders application status from `provider_applications`. The dashboard tile and activity-feed components exist as files but are not assembled into a working home.
- Lead plumbing exists: `provider_contact_events` (the lead spine, FK `conversation_id` to `diagnoses`, FK `provider_id` to `providers`, channel check phone/email/whatsapp, `homeowner_whatsapp`, `diagnosis_trade`), a working realtime lead-alert email (`src/lib/providers/notify-contractor-of-lead.ts`, sends suburb only, not the full address), and a monthly digest cron.
- `providers.claimed_by_user_id` and `claimed_at` link a logged-in user to their provider row. Everything in the portal scopes off this.
- `provider_profile_views` logs per-specialist views (the analytics spine). `job_outcomes` holds rating and won or lost with a `contractor_reply` field, currently empty.

#### Schema Gaps This Plan Fills

Net-new tables: lead consent records, lead pipeline state, customers, quotes and quote items, invoices and invoice items, Pro team membership and roles, Pro-facing notification preferences. Net-new columns: phone and phone-verified timestamp on `profiles`, optional `assigned_to` on leads.

---

## Phase 1, Homeowner Onboarding

Goal: after a homeowner creates an account, a short two-step onboarding captures a mobile number and at least one address, and records their consent preference. The number (unverified for now, verification added later) is the asset the whole Pro lead model depends on.

#### Data Model

- Add to `profiles`: `phone text`, `phone_verified_at timestamptz`. Keep the existing `locations jsonb` for addresses.
- New table `lead_share_consent_settings` (one row per homeowner) for the global toggle:
  - `user_id uuid primary key references auth.users`
  - `mode text check (mode in ('ask_each_time','always_share')) default 'ask_each_time'`
  - `updated_at timestamptz default now()`

#### Phone Capture (Lazy, Unverified For Now)

Friction on signup must be near zero. Signup is one-click Google. The mobile number is captured plain and stored unverified: write `phone` to `profiles` and leave `phone_verified_at` null. SMS OTP is deferred to avoid the per-message cost, deliverability risk, and friction on a pre-demand product. South African normalisation already exists in `notify-contractor-of-lead.ts` (`normalizeWhatsappNumber`, 0XXXXXXXXX to 27XXXXXXXXX); reuse it to store a clean number.

Keep the schema verification-ready so turning OTP on later is a small change, not a migration: `phone_verified_at` stays in place, and the later flow uses Supabase phone OTP (`updateUser({ phone })` then `verifyOtp`) or WhatsApp OTP once the WhatsApp Business API is live, which is the cheaper and on-brand channel for South Africa. The `src/components/ui/input-otp.tsx` component is already present for when that lands.

#### Pages And Components

- New route group `src/app/onboarding` with two steps, gated to logged-in homeowners whose onboarding is incomplete:
  - Step 1, Mobile number: a single input, stored unverified. Copy explains the number is how specialists reach them about a job.
  - Step 2, Address: reuse the Google Places autocomplete and the `profiles.locations` CRUD already built in `src/app/settings/addresses`. Saving one address completes onboarding.
  - The consent-preference choice is deferred to the first contact modal, so onboarding stays to two steps and the choice is made in context.
- Redirect logic: after first Google login, if `phone` is null, send the homeowner to `/onboarding`. A number is required before the contact gate (Phase 2) can create an identified lead, so the gate prompts for it if onboarding was skipped.

#### API

- `POST /api/account/phone` stores the number on `profiles`. Reuse `createSupabaseServerClient` and the account API patterns under `src/app/api/account`. A `phone/verify` endpoint is added later when OTP is enabled.

---

## Phase 2, Funnel Caps And The Contact Gate

Goal: tune the diagnosis caps to your numbers, and make contacting a specialist require account, a captured phone number, and consent, capturing the lead with identity.

#### Caps

Adjust `src/app/api/diagnose/quota.ts`:
- Anonymous: change from 3 per day to a weekly cap (default 3 per week). Implement by passing the ISO week-start date as the bucket key to the quota RPC for anonymous callers, keeping the per-key limit small. Extend `increment_diagnosis_quota` to accept a period or simply receive the week-start date in `p_date`.
- Logged in: change from 10 per day to 3 per day (default, configurable via env like the existing `DISABLE_DIAGNOSIS_DAILY_QUOTA`).
- Keep the wow moment intact: do not cap so tight that an anonymous user hits the wall before seeing one good diagnosis. The contact gate does the real conversion work.
- The 429 copy already says "Sign in for more". Keep that, and on the diagnosis result add a soft signup nudge.

#### Refinement Fair-Use Cap

The diagnosis slot only counts first messages (`quota.ts:43`, `isFirstMessage` when history is empty), so refinements are free by design. That is correct for honest clarification but leaves a loophole: a user can keep one conversation alive and morph it into a series of different problems, getting a fresh specialist list each time, uncounted. Note this matters mainly for AI cost now, not specialist access, because viewing the match page is free and the valuable action (contacting) is separately gated by account, verified phone, and consent.

Close it with a per-diagnosis refinement cap rather than by charging a slot on a topic change. Charging for a topic change is unfair when the model mis-tagged the trade and the user is correcting it.

- Cap refinements at 10 per diagnosis. Combined with the slot caps this yields a clean ceiling: anonymous 3 diagnoses per week times 10 equals 30 refinements per week, logged in 3 per day times 10 equals 30 per day. To exceed it the user must start a new conversation, which costs a slot.
- The counter lives on the diagnosis row, not on the anon cookie, so the cap is robust for logged-out users too. The anon cookie only gates new conversations.
- A refinement is specifically the user-initiated Refine action where the user changes photos or adds text. The model's own clarifying questions (the "let me confirm" quick options) do not count, nor do the warm-up or provider-hydration calls. Only the explicit Refine action counts toward the 10.

#### Counting Must Be Intent-Tagged, Not History-Based

A trace of the live code found two things that change the implementation.

- The web diagnosis page never sends a `history` array. It re-runs `runInitialDiagnosis` with accumulated context, posting `imageUrls`, `serviceCatalog`, `textQuery`, `previousDiagnosis` and similar (`src/app/diagnosis/client.tsx:766`). The quota's `isFirstMessage` check keys only on `body.history` (`quota.ts:43`), which was written for the chat-style WhatsApp caller, so it does not map to this page. As written the quota counts per `/api/diagnose` call and only exempts the `image_thought_only` warm-up. But one logical diagnosis fires several calls (warm-up, main, and a separate `providerHydration` call at `client.tsx:557`), and every Refine and every clarification answer is another full call. So with the quota enabled as-is, hydration calls, refinements, and clarification answers would each consume a slot, which is wrong in both directions.
- The quota is effectively disabled today: `diagnosis_usage` has 0 rows, so the RPC has never fired in production, meaning `DISABLE_DIAGNOSIS_DAILY_QUOTA` is set. There is currently no diagnosis cap at all, and the refinement loophole is moot until the cap is enabled. This scheme is greenfield to turn on, not a tweak to a live limit. Confirm the env flag when building.

The fix is to derive intent on the server from diagnosis state, not from a client label which is trivially spoofable (a user could send `interactionType: 'clarification'` to get unlimited free calls). Keep a client `interactionType` only as a UX hint; the counter decision is server-side:
- `initial`: that `conversationId` has no `delivered_at` yet in `diagnosis_funnel` (which already exists). Increments the diagnosis slot once (anonymous weekly, logged-in daily).
- `refinement`: a delivered diagnosis exists and the payload carries `previousDiagnosis` or changed images or text. Increments `refinement_count` on the diagnosis row, capped at 10. Consumes no slot.
- `clarification`: an active `requires_clarification` state plus a matching answer. Counts nothing.
- `hydration`, `warmup`: self-identifying by their existing flags (`providerHydration`, `analysisPhase === 'image_thought_only'`). Count nothing.

Add `refinement_count int default 0` to `diagnoses`. At the refinement cap return a gentle 429: "You have reached the refinement limit for this diagnosis. Start a new one to continue," noting that starting a new one uses a slot. A per-user daily AI-call ceiling was considered and rejected as too broad; the refinement cap plus the slot caps bound cost adequately.

#### The Contact Gate And Consent Modal

The specialist's raw phone number is never rendered to the homeowner before consent. The card shows a Contact action, not a tappable number, and `provider.phone` is withheld from the public match and `/pro/[id]` payloads until the gate is passed. This removes the read-the-number-and-skip-capture bypass.

At `renderContactSlot` (`src/app/match/components/client.tsx:935`), before any WhatsApp, Call, or Email action runs:

1. If not logged in: open the existing `src/components/homeowner-auth-dialog.tsx` (one-click Google) with a return path back to this specialist. After auth, continue the flow.
2. If logged in but `phone` is null: prompt for the mobile number (the Phase 1 capture step), then return.
3. Consent check:
   - If global mode is `always_share`, proceed and record consent for this specialist silently (still logged).
   - Otherwise show the consent modal: "Your name, mobile number, and enquiry details will be shared with {business} so they can help with this job, whether or not you send a message. Continue?" with a "Do not ask again for specialists I contact" checkbox that sets global mode to `always_share`. The "whether or not you send a message" wording is deliberate: the disclosure happens at consent, not at send.
4. On confirm: write the consent record (Phase 3), then write an identified `provider_contact_events` row carrying the number, reveal the specialist's number to the homeowner, then open the contact channel. The lead now exists with identity even if the homeowner never sends, and the Pro may follow up.

Replace the Lorem ipsum at line 1028 with the real consent and privacy sentence.

#### Contact Event Changes

`provider_contact_events` already has `homeowner_whatsapp`. Populate it from the verified `profiles.phone` on web contacts (today it is only set by the WhatsApp bot path). Add the columns introduced in Phase 4 (status, assignment) as that phase lands. Wire `/api/contact/contractor` to receive the homeowner user id so the lead can be linked to a customer.

---

## Phase 3, Consent Records And Homeowner Settings

Goal: a durable, auditable consent trail and the homeowner controls to manage and revoke it.

#### Data Model

New table `lead_contact_consents`:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid references auth.users` (the homeowner)
- `provider_id uuid references providers(id)`
- `diagnosis_id uuid references diagnoses(id)`
- `channel text` (the channel used at grant time)
- `granted_at timestamptz default now()`
- `revoked_at timestamptz`
- `scope text` describing what was shared (name, phone, enquiry)

This table is both the audit log and the switch that controls what the Pro portal is allowed to display. The Pro Leads and Customers views must check `revoked_at is null` before showing identity.

#### Settings

Add to `src/app/settings/privacy` (or a new `src/app/settings/communication` section, mirroring the existing toggle and list patterns):
- A consent-mode toggle reflecting `lead_share_consent_settings.mode` (Ask me each time, or Always share with specialists I contact).
- A "Specialists you have shared details with" list, one row per active consent, each with a Revoke action. Mirror the row pattern in `src/app/settings/addresses/client.tsx` (icon, label, action button).
- Honest copy on revoke: revoking stops Mendr sharing your details going forward and asks the specialist to delete them, but cannot recall a message already sent.

#### API

- `PATCH /api/account/consent-settings` upserts the global mode (mirror `notification-preferences` upsert).
- `GET /api/account/consents` lists active consents. `POST /api/account/consents/revoke` stamps `revoked_at` and enqueues the Pro notification.

#### POPIA Obligations (Beyond Consent)

Consent alone is not enough once Mendr brokers PII to a Pro. Five obligations:

1. Bind the Pro contractually. Update `src/app/contractors/terms` so that, on receiving homeowner details, the Pro agrees to use them only to respond to that enquiry, not to market or resell, to keep them secure, and to delete them on request or on consent withdrawal. This makes the Pro a separate responsible party and makes the revoke-and-delete promise enforceable. Gate the first reveal of any lead identity behind the Pro accepting these terms.
2. Retention policy, enforced by a scheduled purge. Pseudonymous leads (trade, suburb, diagnosis, no PII) live indefinitely. Identified lead PII is purged 12 months after last activity if no job resulted. Customer PII tied to an issued invoice is retained 5 years (SA tax law). Document the windows; numbers are confirmable.
3. Data-subject requests. Add the new tables (`lead_contact_consents`, `provider_customers`, `lead_states`, `jobs`, `quotes`, `invoices`) to the existing data-export list and the delete-account flow in `src/app/settings/privacy`. On homeowner deletion, anonymise their PII in Pro-held records (keep the lead pseudonymous so the Pro's history stays intact, strip name and number) except where an issued invoice must be retained for tax.
4. Provable consent. On each grant store `granted_at`, channel, provider, and the version of the consent text shown, so you can later prove exactly what was agreed.
5. State it in the privacy policy. One line: contacting a specialist shares your name, number, and enquiry with that specialist. Small addition to the existing privacy content.

Anonymous homeowners have no settings to return to, so for them consent would be transactional only. Since the contact gate now requires an account, this case mostly disappears: by the time anyone contacts a specialist they have an account and a managed consent record.

---

## Phase 4, Pro Portal Home And Leads

Goal: replace the two-link nav with a real workspace, and give Pros a working Home and Leads inbox built on identified leads.

#### Navigation And Naming

Replace `src/app/contractors/(portal)/layout.tsx` nav with a Pro nav (left rail on desktop, tab bar on mobile): Home, Leads, Customers, Jobs, Quotes, Invoices, Team (owner and admin only), Settings. Rename "Mendr Contractors" to "Mendr Pro". Scope everything to the signed-in user via `providers.claimed_by_user_id`.

#### Provider Claiming And Dedupe (Prerequisite)

Everything scopes off `claimed_by_user_id`, so the claim has to be clean. Two problems:
- Duplicate provider rows in the scraped data. The canonical key is `google_place_id` (already on `providers`). Add a `merged_into uuid` column. When duplicates share a place id or a high match score, point the duplicates' `merged_into` at the canonical row and repoint their `provider_contact_events` to the canonical id, so leads never split across duplicates.
- One business, one account. On claim, set `claimed_by_user_id` on the canonical row and enforce one active claim per canonical provider with a unique constraint. The application flow already computes `matched_provider_id` and `match_score` to attach the claim to the right row. Linking several locations under one business is a later feature, not v1.

#### Unclaimed Leads As An Acquisition Lever

Most of the 466 providers are unclaimed scraped listings. Leads (and at minimum lead counts) accrue to them with no Pro watching. This is one of the strongest acquisition mechanics available: an outreach message "You have N qualified leads waiting on Mendr, claim your free profile to see them" turns the lead inventory into the hook. Surface a pending-lead count per unclaimed provider for outreach, and on claim the Pro immediately sees a populated inbox rather than an empty one. This pairs with the Hormozi-style offer: free leads visible first, tiny fixed monthly to keep working them.

#### Home Dashboard

Assemble the existing tile and feed components into a real page at `account/` (or a new `home/` route in the portal). Mirror the three-section homeowner dashboard shape:
- Stat tiles from real sources: new enquiries this period (`provider_contact_events`), profile views (`provider_profile_views`), average rating (`mendr_rating` and `reviews`), win rate (`job_outcomes`), and once invoices exist, outstanding total.
- Recent enquiries, last five, with a "new since last visit" count.
- Side column: profile-strength nudge (`profile-completeness` helpers already exist), subscription chip (placeholder until billing), and the What's New feed from `feature_announcements`.
- Do not show "scrolled past my card" yet. That impression metric is not logged. Put it on the analytics roadmap (Phase 9) so the dashboard shows only real numbers.
- Small-N guardrail: each tile shows a number only above a minimum sample, otherwise it shows the raw count and "Not enough data yet". Suggested thresholds: win rate needs 5 or more closed outcomes, rating needs 3 or more reviews, conversion needs 20 or more views. Reuse the same thresholds anywhere a stat is published publicly so a one-out-of-two win rate is never surfaced.

#### Leads Inbox

A Notion-style table at `leads/`, scoped to the Pro's `provider_id`.
- Columns: status, trade, diagnosis headline, suburb, urgency, channel, age. Inline-editable status.
- Identity columns (name, number) render only when an active `lead_contact_consents` row exists and is not revoked.
- Filters (status, trade, area, date), search, "new since last visit", bulk actions.
- Source data: `provider_contact_events` joined to `diagnoses` for the headline, trade, urgency, and suburb (suburb via the existing `extractSuburb` shape, never the full address in the list).

#### Lead State

Do not mutate the event log. Add a sibling table `lead_states`:
- `contact_event_id uuid primary key references provider_contact_events(id) on delete cascade`
- `status text check (status in ('new','responded','quoted','won','lost')) default 'new'`
- `assigned_to uuid references auth.users` (nullable, used by Team in Phase 8)
- `notes text`
- `updated_at timestamptz default now()`

Introducing `assigned_to` here, even before Team ships, means the Leads and Customers schemas do not need reshaping later.

#### Enquiry Detail

A detail view per lead: full diagnosis (photos from `diagnoses.image_urls`, AI text, hazards, urgency), suburb, consent-gated contact details, status control, private notes, and the actions Create Quote and Mark Won or Lost (writes `job_outcomes`). An activity timeline can come from `provider_contact_events` and state changes.

#### API

- `GET /api/pro/leads` (list, filtered), `GET /api/pro/leads/[id]` (detail), `PATCH /api/pro/leads/[id]` (status, notes, assignment). All authorise via `claimed_by_user_id` and the membership table once Team lands.

---

## Phase 5, Customers CRM

Goal: one record per identified homeowner the Pro has dealt with, the spine that makes quoting and invoicing fast.

#### Data Model

New table `provider_customers`:
- `id uuid primary key default gen_random_uuid()`
- `provider_id uuid references providers(id)`
- `homeowner_user_id uuid references auth.users` (nullable, set when the lead came from a Mendr account)
- `name text`, `phone text`, `email text`, `address text` (captured at quote or invoice time)
- `created_at timestamptz default now()`
- Dedupe on `(provider_id, phone)` where phone is present, else on `(provider_id, homeowner_user_id)`.

#### Behaviour

- Auto-seed a customer row when a consented, identified lead arrives (from the Phase 2 contact write).
- Allow manual add and edit for walk-in or off-platform customers.
- A customer page shows their history with this Pro: linked leads, quotes, invoices, job outcomes.
- Identity here is governed by the same consent rule: a customer auto-seeded from a Mendr lead must respect revocation. A customer the Pro entered manually for their own invoicing is the Pro's own record, captured directly from their customer, and the Pro is the responsible party.

#### API And UI

`GET and POST /api/pro/customers`, `GET and PATCH /api/pro/customers/[id]`. UI mirrors the Leads table and the addresses list patterns.

---

## Phase 5b, Jobs (Work Orders)

Goal: the missing entity between a won lead and an invoice. A tradesperson's world is built around the job, and Team assignment (Phase 8) is really job assignment. `job_outcomes` is only a thin rating record, not a work order.

#### Data Model

New table `jobs`:
- `id uuid primary key default gen_random_uuid()`
- `provider_id uuid references providers(id)`
- `customer_id uuid references provider_customers(id)`
- `contact_event_id uuid references provider_contact_events(id)` (the originating lead, nullable)
- `quote_id uuid references quotes(id)` (nullable, when it came from an accepted quote)
- `title text`, `site_address text`
- `status text check (status in ('scheduled','in_progress','completed','cancelled')) default 'scheduled'`
- `scheduled_for timestamptz`, `assigned_to uuid references auth.users` (nullable)
- `created_at timestamptz default now()`, `completed_at timestamptz`

#### Behaviour

- A won lead (or an accepted quote) creates a job. The lead's `lead_states.status = 'won'` and the job are linked.
- The job carries scheduling, the site address, and the assigned team member. This is what "assign a job to a team member" attaches to.
- On completion, the job feeds `job_outcomes` (rating, outcome) and unlocks invoicing from the completed work.

#### API And UI

`GET and POST /api/pro/jobs`, `GET and PATCH /api/pro/jobs/[id]`. A simple list plus a calendar or scheduled-date view. Members see only jobs where `assigned_to` is them.

---

## Phase 6, Quotes

Goal: build and send a quote, pre-filled from the diagnosis, on one good template with branding and a few cosmetic presets.

#### Data Model

- New table `quotes`:
  - `id uuid primary key default gen_random_uuid()`
  - `provider_id uuid references providers(id)`
  - `customer_id uuid references provider_customers(id)`
  - `contact_event_id uuid references provider_contact_events(id)` (nullable, links to the originating lead)
  - `number text` (per-Pro sequence)
  - `status text check (status in ('draft','sent','accepted','declined','expired')) default 'draft'`
  - `subtotal numeric`, `vat_amount numeric`, `total numeric`, `deposit_percent numeric`, `valid_until date`, `terms text`
  - `template text default 'classic'` (cosmetic preset key)
  - `sent_at timestamptz`, `viewed_at timestamptz`, `accepted_at timestamptz`, `created_at timestamptz default now()`
- New table `quote_items`: `id`, `quote_id references quotes(id) on delete cascade`, `description text`, `qty numeric`, `unit_price numeric`, `line_total numeric`, `position int`.

#### Branding

Store Pro branding on `providers` or a small `provider_branding` table: logo URL, accent colour, business details, banking details, VAT-registered flag and VAT number. The three presets (Classic, Compact, Modern) are styling over the same fields, so adding presets is CSS, not schema.

#### Behaviour

- Pre-fill scope and trade from the diagnosis when a quote is created from a lead (Create Quote on the enquiry detail).
- Builder: line items, VAT at 15 percent toggled by the VAT-registered flag, deposit percent, validity, terms.
- Send as a tracked link plus a generated PDF. Track viewed and accepted. Convert to invoice on acceptance.

#### PDF And API

Generate the PDF server-side (a React-to-PDF or HTML-to-PDF approach consistent with the existing email-template stack under `src/lib/email`). `GET and POST /api/pro/quotes`, `GET and PATCH /api/pro/quotes/[id]`, `POST /api/pro/quotes/[id]/send`.

---

## Phase 7, Invoices

Goal: invoices, ideally converted from an accepted quote, with payment status. Mirrors Quotes.

#### Data Model

- New table `invoices`: same shape as `quotes` plus `due_date date`, `paid_at timestamptz`, `amount_paid numeric`, `balance numeric`, `status text check (status in ('draft','sent','paid','overdue','partial')) default 'draft'`, and `quote_id uuid references quotes(id)` (nullable).
- New table `invoice_items`: same shape as `quote_items`.

#### Behaviour And Compliance

- Create from an accepted quote or a completed job (copy items and totals) or standalone.
- Lock on issue. While `draft`, fully editable. The moment it is issued or sent, freeze line items, totals, and the number. No edits after issue, ever.
- Corrections go through a credit note, not an edit. Add a `credit_notes` table mirroring invoices with `references_invoice_id`. Void-and-reissue is the other allowed path.
- Sequential, gap-free numbering generated at issue time (not at draft creation) from a per-Pro counter (a `provider_document_counters` row or a per-provider Postgres sequence), so concurrent issues cannot collide or skip.
- When the Pro is VAT-registered, render a "Tax Invoice" with the SARS-mandatory fields: the words Tax Invoice, supplier name, address and VAT number, invoice number and date, customer details, line descriptions, value and VAT amount (or a statement that 15 percent VAT is included). When not VAT-registered, it is an "Invoice" with no VAT line.
- Apply the deposit already taken, show balance and due date. Mark paid, record partial payment.
- PDF generate and send, reusing the Quotes machinery.

#### API

`GET and POST /api/pro/invoices`, `GET /api/pro/invoices/[id]`, `PATCH /api/pro/invoices/[id]` (draft only), `POST /api/pro/invoices/[id]/issue`, `POST /api/pro/invoices/[id]/send`, `POST /api/pro/invoices/[id]/payments`, `POST /api/pro/invoices/[id]/credit-notes`.

---

## Phase 8, Team And Roles

Goal: a Pro owner can invite team members, assign leads and jobs, and control what each can see.

#### Data Model

New table `provider_members`:
- `id uuid primary key default gen_random_uuid()`
- `provider_id uuid references providers(id)`
- `user_id uuid references auth.users`
- `role text check (role in ('owner','admin','member')) default 'member'`
- `invited_email text`, `invited_at timestamptz`, `accepted_at timestamptz`, `status text check (status in ('invited','active','removed')) default 'invited'`

The first claimer of a provider (`claimed_by_user_id`) becomes the owner. Authorisation across all Pro APIs shifts from a raw `claimed_by_user_id` check to membership lookup.

#### Roles

- Owner and admin: billing, team, settings, all leads and jobs.
- Member: only leads and jobs where `lead_states.assigned_to` or the job assignment equals their user id.

#### Behaviour

- Invite by email. The invite creates or links a Supabase account scoped to this provider with `profile_type` pro.
- Assignment uses the `assigned_to` field already added in Phase 4 on `lead_states`, extended to jobs.

#### API And UI

`GET and POST /api/pro/members`, `PATCH and DELETE /api/pro/members/[id]`. Team page mirrors the settings list patterns, owner and admin only in the nav.

---

## Phase 9, Pro Settings And Analytics

Goal: a settings home for the Pro and an analytics view on real data.

#### Settings

- Profile fields already on `providers` (insurance_cover, typical_response_time, pricing_model, callout_fee, preferred_contact_channel) surfaced and editable, and on the public `/pro/[id]` profile.
- Service area editing already exists (`account/service-area`).
- New Pro-facing notification preferences. The existing `notification_preferences` table is homeowner-oriented, so add a `provider_notification_preferences` table keyed by `(provider_id, user_id)`: new enquiry, new review, weekly summary toggles, quiet hours, preferred channel. The realtime alert already respects `providers.notify_realtime`; extend it to read these.

#### Analytics

- Now real: profile views over time (`provider_profile_views`), views-to-contact conversion (views versus `provider_contact_events`), win rate and response time (`job_outcomes`, `contractor_reply_at`), leads by trade and suburb.
- New work needed for "scrolled past my card": add a lightweight match-impression event on the match list (one row per specialist shown per session) before this can be a real number. Until then, do not display it.

---

## Phase 10, Future, Billing And Payments

Per the Contractor Expansion doc steps 5 and 8, gated on external decisions, not built now.
- Billing and subscription: current plan, price, renewal, payment method, receipts, plan change, VAT and dunning. Needs a payment provider and the decision to start charging.
- Payments and escrow: deposit to Pro, balance escrowed, completion-triggered release via `job_outcomes`, refunds and disputes, payout history. Needs a licensed PSP or escrow partner and South African regulatory clearance. Reuse the existing KYC.

---

## Build Order Summary

1. Phase 1, homeowner onboarding (Google signup, lazy phone capture, address, consent preference).
2. Phase 2, caps rework and the contact gate with consent modal, number hidden until consent, and the Lorem ipsum fix.
3. Phase 3, consent records, POPIA obligations, and homeowner settings management and revocation.
4. Phase 4, provider claiming and dedupe, Pro nav, Home dashboard, Leads inbox, enquiry detail, lead state, unclaimed-lead lever.
5. Phase 5, Customers CRM, seeded from consented leads.
6. Phase 5b, Jobs (work orders).
7. Phase 6, Quotes.
8. Phase 7, Invoices (immutable on issue, credit notes, VAT compliance).
9. Phase 8, Team and roles.
10. Phase 9, Pro settings and analytics.
11. Phase 10, billing and payments, later.

Phases 1 to 3 are the privacy-critical and conversion-critical core and unlock everything on the Pro side. Phases 4 to 5b give Pros a real workspace.

#### Validation Checkpoint (Recommended)

After Phase 4 (Leads working, identified inbox, unclaimed-lead lever), pause and test Pro willingness-to-pay before building the back-office (Phases 6 to 9). The thing a Pro pays for is leads that turn into paid jobs; the invoicing, CRM, and team tools are what make them stay, not what makes them join. Prove the core offer converts, ideally with a founding-Pro price, then build the rest with real users guiding it. This is the Hormozi sequence: nail and prove the offer before scaling its surface area. The binding constraint is not tech cost (near zero, bootstrapped) but the supply-and-demand balance: a subscription only retains if each Pro gets enough leads to feel the ROI, so homeowner acquisition must lead or move in lockstep with Pro acquisition, never lag it. Onboarding many Pros before there is homeowner demand to feed them produces one lead each and mass churn.

## New Tables At A Glance

- `lead_share_consent_settings` (global consent mode per homeowner)
- `lead_contact_consents` (per-contact consent audit and display switch)
- `lead_states` (pipeline status, assignment, notes per lead)
- `provider_customers` (Pro CRM)
- `jobs` (work orders, scheduling, assignment)
- `quotes`, `quote_items`
- `invoices`, `invoice_items`, `credit_notes`
- `provider_document_counters` (gap-free per-Pro invoice numbering)
- `provider_members` (team and roles)
- `provider_notification_preferences` (Pro-facing)
- `provider_branding` (optional, or columns on `providers`)

New columns: `profiles.phone`, `profiles.phone_verified_at`, `diagnoses.refinement_count`, `providers.merged_into`.

Every new table must ship with Row Level Security enabled and explicit policies: a homeowner reads and writes only their own rows (`lead_share_consent_settings`, `lead_contact_consents`), and a Pro reads only rows for a provider they are claimed on or a member of (`lead_states`, `provider_customers`, `jobs`, `quotes`, `invoices`, `provider_members`). Service role bypasses for server writes. Do not create a table without its policies in the same migration.

## Security Cleanup To Schedule

The database advisor flags three tables with Row Level Security disabled: `ai_call_log`, `providers_backup_20260601`, `provider_cache_backup_20260601`. The two backups hold a full copy of provider data and are readable by anyone with the anon key. Drop them if no longer needed, or enable RLS, before expanding the Pro surface. Decide and apply deliberately, do not auto-enable RLS without policies.
