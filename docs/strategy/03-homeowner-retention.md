# Mendr — Homeowner Retention Strategy

*Last updated: 2026-05-22. Owner: Matthew Prowse.*

This document defines how Mendr stops being a "called-once-when-the-geyser-burst" app and becomes a homeowner's default app for their home. The target: the average homeowner has Mendr installed on their phone for years, opening it monthly, even when nothing is broken.

See `01-diagnostic-quality-and-feature-roadmap.md` for the diagnostic work. See `02-contractor-retention-and-pricing.md` for the contractor side.

---

## 1. The problem in one paragraph

Most home-services apps lose the homeowner the moment the contractor leaves. TaskRabbit, Snupit, Bark, Kandua, HomeAdvisor — they're all phone books that get opened in a crisis and forgotten the next day. The platforms that broke this pattern (Thumbtack's 2022–2026 pivot, Angi Key, Houzz, Frontdoor/AHS) all share three traits:

1. **A compounding home record** — every interaction adds value that compounds the longer you use the app
2. **Seasonal/notification-driven prompts** tied to real things happening to the home (weather, season, anniversary, schedule)
3. **A subscription or quasi-subscription anchor** that makes the app feel like infrastructure, not a phonebook

Mendr already has the diagnostic engine. The work ahead is to layer those three traits on top of it.

---

## 2. The Mendr-unique structural advantage

HomeBinder and Centriq have been trying to build "Notion for your house" since 2012. Neither has crossed into mainstream consumer behaviour. Why? **Both ask the homeowner to log records cold.** Users will not enter their geyser model number for the fun of it. The records have to fall out of an existing activity.

Mendr has the inverse property: **every diagnosis already produces the raw material of a home record.** A photo, a description, a trade classification, a contractor matched, a date, and (post-job) a rating outcome. The record is the *by-product*, not the *ask*. Each new diagnosis enriches the home's record without a single extra second of work from the homeowner.

This is the structural advantage. Most consumer home-record products spent years trying to acquire users and ask them to log data. Mendr can ship the home record by silently filing every diagnosis against the property, and after 5–10 diagnoses the record has irreplaceable value.

---

## 3. The three trait stack — what we build

### Trait 1 — The compounding home record

The single highest-leverage retention feature. Every diagnosis is automatically filed against the homeowner's property as a timestamped entry. Over time, the homeowner has a searchable history of everything that happened to their home — paint colour, geyser model, last pool service, every plumber's number, every alarm cert expiry.

| What lives in the home record | Source |
|---|---|
| Past diagnoses (photo + AI report + outcome) | Auto-filed from every Mendr session |
| Contractors used (with phone, email, and rating you gave them) | Auto-filed from match acceptance |
| Invoices and amounts paid | Will come via contractor-side payments in Phase 2 of contractor work |
| Equipment serial / model numbers | Pulled from photos by AI where visible; user can confirm |
| Compliance certificates (Electrical CoC, Gas, Electric fence, Plumbing) | User uploads; cron flags expiry |
| Paint colours, finishes | User can manually annotate; AI can extract from photos |
| Building plans, approvals (Cape Town heritage zones) | User-uploaded PDFs |
| Body corporate documents, levy schedules | Sectional-title users specifically |
| Property metadata (year built, type, suburb) | Auto-pulled from address geocoding |

**Critical mass is ~8–15 entries** (per the HomeBinder data). At that point the homeowner uses the record as a working reference, not a novelty. Below it, the record feels half-empty.

#### Three moments where the record pays back

1. **Insurance claim** — date-stamped diagnosis report + contractor invoice + before/after photos in one bundle, exportable as PDF. The single most powerful insurance-side asset.
2. **Property sale** — "transfer home record to new buyer" feature. Solves a real buyer pain (what's been done?), a real seller pain (proving maintenance), and a real Mendr pain (acquiring a new household at the highest-context moment imaginable). Mirror HomeBinder's B2B channel through bond originators, conveyancers, and estate agents.
3. **Contractor sharing** — send the next plumber last year's invoice, the geyser model, the brand of the energiser. Saves the call-out diagnosis time, makes the contractor faster, makes the homeowner look prepared.

### Trait 2 — SA-specific ambient utility (the daily-open hook)

EskomSePush proves a single fact: an SA homeowner WILL open an app daily if it tells them something they need to know about the physical environment of their home. ESP grew from 8.8M to 9.8M downloads in 2025 with ~6M active users — and its community now hosts conversations about plumbers, electricians, and crime. **ESP accidentally became a home-services app because it had ambient utility.** Mendr can do this deliberately.

| Ambient hook | What we show | Why it drives opens |
|---|---|---|
| **Load-shedding** | Current stage for the user's suburb + home-specific advice ("Your geyser model takes 90 min to reheat — switch off before stage starts") | The single most-checked thing in an SA home daily. ESP-anchored. |
| **Weather (storms, heat, cold front)** | Suburb-level SAWS forecast + pre-storm checklist ("Check your gutters before Wednesday") | Cape Town winters are predictable triggers. Berg winds and storms produce reliable damage spikes. |
| **Water restrictions / tariffs** | Current restriction level, leak detector prompts during dry months | Cape Town drought psyche is permanent. |
| **Crime / security** | Alarm test reminder, electric fence battery check schedule | SA homeowners check security systems often. |
| **Insurance compliance** | Cert expiry countdown (gas, electrical, electric fence) | Buildings policies often require these — non-compliance can void cover. |

This is the trait that makes the app worth keeping installed. The home record is the value; ambient utility is the daily-open trigger that lets you experience that value.

### Trait 3 — Subscription anchor with concrete entitlements

Angi Key ($30/year, money-back guarantee on first job, +14% repeat-customer rate). Thumbtack Home ($49/year, $10k guarantee + 20% off bookings). Frontdoor / AHS (warranty subscription is the entire product). All three give a tangible reason to keep paying and a tangible reason to open the app to "get my money's worth".

For Mendr, see Section 7 — a `Mendr Home` subscription tier with specific entitlements priced against Vitality / DStv Premium expectations. The current product is free for homeowners; this changes once the home record reaches critical mass.

---

## 4. The feature stack — ranked by retention impact

Synthesised from research on Thumbtack, Angi, Houzz, AHS, HomeBinder, Ring, EskomSePush, plus SA-specific opportunities. MVP / v2 / v3 phasing.

| # | Feature | Phase | Why it sticks |
|---|---|---|---|
| 1 | **Home record auto-builder** — silently file every diagnosis against the property | MVP | Highest leverage. Zero additional user work. Compounds with every job. The HomeBinder-killer. |
| 2 | **Load-shedding-aware home banner with home-specific advice** | MVP | The single biggest reason an SA homeowner will open Mendr daily. ESP-style ambient utility. |
| 3 | **WhatsApp share-out for diagnosis reports** | MVP | One tap to send the AI report to a plumber, insurer, or landlord. WhatsApp is the default SA comms channel — bolting onto it is mandatory. |
| 4 | **Past diagnoses tab on `/account`** | MVP | Already shipping. Make this the primary entry to the home record. |
| 5 | **Saved contractors tab on `/account`** | MVP | Already shipping. "Your trusted tradespeople" — auto-populated from past matches. |
| 6 | **Post-job rating + outcome capture** | MVP | Already shipping (May 22, 2026). Closes the diagnosis loop and feeds the record. |
| 7 | **Seasonal maintenance calendar** (pre-loaded with WC-relevant tasks) | MVP-light, v2-rich | Pre-winter geyser check. Pre-storm gutter clean. Spring pool service. Alarm battery test. Proactive engagement without spam. |
| 8 | **Anniversary reminders** ("12 months since your last roof inspection") | v2 | Low-frequency, low-spam, highly relevant. Borrows directly from Thumbtack's home care calendar. |
| 9 | **Storm / weather alerts** (suburb-level SAWS) | v2 | Tied to real-world events. Pre-storm checklist drives action. |
| 10 | **Compliance vault** (Electrical CoC, Gas, Electric Fence, Plumbing) + expiry countdown | v2 | SA legally required at property transfer. Highest-context storage moment. |
| 11 | **Insurance integration / proof-of-maintenance** (Discovery, OUTsurance, Santam, MiWay partner) | v2 | Vitality model proves SA consumers respond to "be rewarded for proven behaviour". Maintenance via Mendr → premium discount or cashback. |
| 12 | **Renter / landlord report-out mode** (integrate WeConnectU, RedRabbit, PayProp) | v2 | Opens up the large WC rental market. B2B2C wedge: Mendr becomes the consumer-facing reporting layer for property managers. |
| 13 | **Annual home health score** | v2 | Generated from logged jobs + outstanding maintenance + age of last service. Shareable in property listings. Status / identity hook. |
| 14 | **Contractor "remember + re-book"** | v2 | "Your plumber from August: Sipho — book again?" Higher LTV per contractor. Reduces friction to repeat use. |
| 15 | **Mendr Home subscription** with concrete entitlements (R99/mo: priority matching, annual home health audit, R-amount happiness guarantee, unlimited refinements, PDF export) | v3 | Mirrors Angi Key / Thumbtack Home. Anchors against Vitality / DStv Premium. Creates the "I'm paying for this so I'll use it" loop. |
| 16 | **Home record transfer-on-sale** | v3 | Acquires new household at the highest-context moment imaginable. B2B distribution via bond originators and conveyancers. |
| 17 | **Body corporate / sectional title module** ("Is this BC's responsibility or yours?") | v3 | ~40% of WC dwellings are in BCs/HOAs. Currently unserved. |
| 18 | **DIY mode with Builders Warehouse SKU link-out** | v3 | Strong SA DIY culture. Low-value jobs branch to a guided DIY with SKU list. Revenue share with Builders/Cashbuild possible. |
| 19 | **Neighbourhood incident feed, opt-in** | v3 | "3 burst geysers in Pinelands this week." Modelled on ESP community threads. Watch the surveillance line; opt-in only. |
| 20 | **Multilingual surfaces** (Afrikaans / isiXhosa for diagnosis reports, alerts, calendar) | v3 | Reach expansion. Voice transcription already integrated. |

---

## 5. Notification + push strategy

Notification budget: **no more than 3–4 push notifications a month** outside of an active job, plus event-driven ones (load-shedding stage change, storm warning, anniversary).

| Trigger | Cadence | Open rate (estimated) | Uninstall risk | Verdict |
|---|---|---|---|---|
| Seasonal maintenance | Quarterly | Medium-high | Low | Ship MVP |
| Anniversary ("12 months since…") | Per home, low frequency | Medium | Low | Ship v2 |
| Job follow-up ("How did the contractor do?") | After each job | High | Low | Already shipping |
| Local weather / storm | Event-driven (2-4 / year per home) | High | Low if accurate | Ship v2 |
| Insurance-driven ("policy includes annual check") | Annual per cert | Very high | Very low | Ship v2/v3 with partner |
| Community ("3 neighbours booked plumbers") | Weekly opt-in | Medium | Medium if surveillance-feeling | Cautious, opt-in only |
| Streak / "home health score risk" | Sparingly | Low-medium | Medium-high if too frequent | Use sparingly. NOT Duolingo-style daily |
| Load-shedding stage change with home advice | Event-driven | High | Low | Ship MVP — SA killer feature |

Rule of thumb from cross-platform research: **notifications referencing something the user said they cared about** (a saved contractor, a logged appliance, a compliance cert expiry) outperform generic prompts by 5–10× and have far lower uninstall risk. So: prefer "Your gas cert expires in 30 days" over "Spring is a great time to inspect your gas appliances".

---

## 6. The rental market — a B2B2C wedge

SA's rental market is huge. PayProp and WeConnectU between them manage ~750k formally-tenanted units. Renters have a different stickiness profile:

- Open the app **only when something breaks** AND they need to escalate to a landlord/agent
- The retention play is "report a fault to your landlord in 30 seconds, with AI diagnosis attached"
- Mendr becomes the fastest reporting interface; the landlord sees a clean structured report

The B2B2C wedge: **integrate with WeConnectU, RedRabbit, and PayProp ticket inboxes. Mendr becomes the consumer-facing fault-reporting layer for the entire SA rental industry.** This is a single channel partnership that could acquire tens of thousands of renters at near-zero CAC, while creating distribution to landlords who own multiple properties — each of which is a Mendr home record.

The retention here is different from owner-occupiers: renters care about their home less but care about fast escalation more. The home record matters less; the speed-and-clarity-of-report matters more. Build both with the same engine.

---

## 7. The Mendr Home subscription (v3)

The free homeowner product stays free. But at v3 a subscription tier exists for committed users.

**Mendr Home — R99 / month or R990 / year (VAT incl.)**

Entitlements:

- **Priority matching** — contractors see your match first; faster response
- **Unlimited diagnoses + unlimited refinements** (free tier caps at, say, 3/month after volume threshold)
- **Annual home health audit** — an AI-generated walkthrough of your home record with maintenance recommendations
- **PDF export of any report** — useful for insurance, sale, contractor sharing
- **R5,000 happiness guarantee** on jobs matched through Mendr — if a contractor matched via Mendr does shoddy work, Mendr covers up to R5,000 (capped, terms apply, structurally similar to Angi Key)
- **Home record export** at any time (own your data — this is also the lock-in: most people never export, but the option creates trust)

Positioning: "Mendr Home: the membership that takes care of your home so you don't have to remember to." Anchor against Vitality (R200+/month feels like a lot for non-essential benefits) and DStv Premium (R500+/month accepted for entertainment). R99/month for proven maintenance protection is a tested SA price point.

This is not the primary revenue driver — contractor subscriptions (see doc 02) are. But it's a profitable second revenue line at scale, and importantly, **it gives committed homeowners a reason to open the app monthly to extract value they're paying for.** That alone is worth the build.

---

## 8. Implementation sequence

### Q3 2026 — MVP retention spine

1. Home record auto-builder (silent file every diagnosis against property)
2. Load-shedding home banner with home-specific advice
3. WhatsApp share-out for diagnosis reports
4. Seasonal maintenance calendar (lightweight)
5. Past diagnoses + Saved contractors tabs (already shipping)
6. Post-job rating + outcome capture (already shipping)

**Outcome:** average homeowner opens Mendr ≥1x per month outside of active jobs.

### Q4 2026 — v2 stickiness expansion

1. Anniversary reminders
2. Compliance vault with cert expiry tracking
3. Storm / weather alerts
4. Insurance partnership pilot (start conversations with Naked + Discovery + OUTsurance now)
5. Renter / landlord report-out mode (WeConnectU integration first)
6. Annual home health score
7. Contractor remember + re-book

**Outcome:** homeowner opens Mendr ≥2x per month. Insurance partnership in pilot.

### Q1–Q2 2027 — v3 lock-in + monetisation

1. Mendr Home subscription launch
2. Home record transfer-on-sale (with B2B distribution via conveyancers)
3. Body corporate module
4. DIY mode with Builders Warehouse partnership
5. Multilingual surfaces (Afrikaans first)

**Outcome:** 5–10% of active homeowners on Mendr Home subscription. ≥3 monthly opens for active homeowners. Defensible retention story.

---

## 9. The honest answer about "what if they only need us once?"

Some homeowners genuinely use a home-services app once. They have a single big issue, get it fixed, and never need another contractor for years. Building for those users in the wrong way means spamming them with maintenance prompts and burning the trust we built on the first interaction.

The retention strategy must respect this. The hierarchy:

1. **First, be excellent on the initial diagnosis** — that's the relationship-creating moment. If Mendr nails it, the user keeps the app even if they don't open it for 18 months.
2. **Second, be available when they DO have a problem** — the saved contractors tab, the past diagnoses list, the "I had this fixed before" recall. If they remember Mendr exists when something breaks 14 months later, the retention has paid off.
3. **Third, opportunistically pull them back in** — load-shedding advice, seasonal reminders, anniversary check-ins. Not pushy. Just present.
4. **Fourth, monetise the engaged ones** — the 10–20% who actively engage will pay for Mendr Home if the entitlements are real.

This is more honest than "force everyone to open the app monthly". It also matches the actual lifecycle of homeownership — some homes are problem-rich, most are not, all benefit from a record that's there when needed.

---

## 10. The one-line summary

**Build the home record silently from every diagnosis. Use load-shedding and weather as the daily-open hooks. Add seasonal reminders, insurance integration, and a subscription tier for committed users. By month 12, the homeowner has a record they cannot get anywhere else — and an app they trust to remember things about their home that they don't.**

---

*Sources: homeowner retention research conducted via sub-agent May 2026. Full source citations preserved in session transcript.*
