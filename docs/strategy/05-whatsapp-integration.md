# Mendr — WhatsApp Integration Strategy

*Last updated: 2026-05-23. Owner: Matthew Prowse.*

This document defines how Mendr uses the WhatsApp Business API to extend both the homeowner diagnosis flow and the contractor operational workflow into WhatsApp. The strategic premise: in South Africa, WhatsApp is the default communication surface for both consumers and tradespeople. A platform that does not exist inside WhatsApp is a platform that competes against WhatsApp.

See `04-contractor-feature-spec.md` for the contractor feature inventory that this integration powers.

---

## 1. Why WhatsApp matters specifically in South Africa

- ~28 million WhatsApp users in South Africa (~46% of population)
- Default channel for SME-to-customer communication. Most independent SA contractors run their entire business on WhatsApp: quotes, invoices as photos, voice-note instructions, calendar coordination
- The single highest-trust messaging surface in the country (above SMS, far above email for SME contexts)
- Critical for renter / agent / landlord workflows where escalation speed matters

Building a Mendr surface that lives outside WhatsApp means the contractor has to remember to open another app. Building one that lives **inside** WhatsApp — or that mirrors into it — keeps Mendr present in the comms channel both sides already use daily. This is the same insight Ramp, Stitch, Yoco and Capitec have around their respective core channels.

The strategic position: **WhatsApp is a channel into the Mendr platform, not a replacement for it.** Transactional and quick interactions happen in WhatsApp; management, complex workflows, and the home record live on the web app. Both surfaces share the same backend, the same job records, the same customer database.

---

## 2. Use case map

### Homeowner WhatsApp use cases

| # | Use case | Direction | MVP / v2 / v3 |
|---|---|---|---|
| 1 | Send a photo + voice note → receive AI diagnosis report | Inbound + reply | MVP |
| 2 | Receive contractor recommendations in-chat with tap-to-call | Outbound reply | MVP |
| 3 | Receive appointment confirmations + reminders | Outbound notification | MVP |
| 4 | Receive on-my-way notifications from contractor | Outbound notification | MVP |
| 5 | Receive invoices from contractor as PDF | Outbound delivery | MVP |
| 6 | Pay invoice via tap-link in WhatsApp | Outbound + return webhook | MVP |
| 7 | Receive "How did the contractor do?" review request | Outbound notification | MVP (already live) |
| 8 | Receive seasonal maintenance reminders | Outbound notification | v2 |
| 9 | Receive load-shedding alerts with home-specific advice | Outbound notification | v2 |
| 10 | Submit landlord / agent fault report (renter flow) | Inbound, routed to landlord | v2 |
| 11 | Refine a previous diagnosis with new photos | Inbound, multi-turn | v2 |

### Contractor WhatsApp use cases

| # | Use case | Direction | MVP / v2 / v3 |
|---|---|---|---|
| 1 | Receive real-time matched-lead notifications | Outbound notification | MVP |
| 2 | Accept / decline a lead via tap-reply | Inbound reply | MVP |
| 3 | Receive customer messages routed from web flow | Outbound notification | MVP |
| 4 | View today's schedule via command (`/today`) | Inbound + reply | v2 |
| 5 | Generate a quote via natural language (`/quote ...`) | Inbound + reply with PDF | v2 |
| 6 | Generate an invoice via natural language (`/invoice ...`) | Inbound + reply with PDF | v2 |
| 7 | Mark a job complete from the field (`/done job-1234`) | Inbound command | v2 |
| 8 | Mark an invoice paid (`/paid invoice-5678 cash`) | Inbound command | v2 |
| 9 | Quick customer lookup (`/customer Mrs Naidoo`) | Inbound + reply | v2 |
| 10 | Receive aged-debtors digest weekly | Outbound notification | v2 |
| 11 | Receive low-confidence diagnoses for human review | Outbound notification | v3 |

### Mendr-platform-side use cases

| # | Use case | Direction |
|---|---|---|
| 1 | Bidirectional mirror of contractor↔customer chat into the Mendr job record | Both |
| 2 | All inbound messages stored against the user (homeowner or contractor) account | Inbound |
| 3 | All outbound messages logged with template id, cost, status | Outbound |

---

## 3. The WhatsApp Business API — facts that shape the design

This section captures the platform realities so the architecture decisions later are grounded.

### Conversation model
WhatsApp Cloud API (Meta's official direct integration) charges per **conversation**, not per message. A conversation is a 24-hour rolling window keyed by phone number. Within a conversation, send as many messages as you want for one charge.

There are four conversation categories:

| Category | When it fires | SA approx cost (2026, USD) | Cost in ZAR |
|---|---|---|---|
| **Service** | User sent first message in the last 24h; business replies | Free (within window) | Free |
| **Utility** | Outbound about a transaction the user initiated (e.g. invoice, appointment reminder) | $0.0080 / conv | ~R0.15 |
| **Authentication** | OTP / login codes | $0.0078 / conv | ~R0.14 |
| **Marketing** | Promotional outbound | $0.0359 / conv | ~R0.65 |

The 24-hour service window opens whenever the user messages you. Inside the window you reply free. Outside the window you must use an **approved Message Template** (paid as utility/marketing).

### Templates and Meta approval
Outbound notifications outside the service window require Meta-approved Message Templates. Each template:

- Takes 24–72 hours for Meta to review
- Cannot be sent in its raw form — must use variables like `{{1}}`, `{{2}}`
- Has a category (utility / marketing / authentication) that affects cost
- Can have buttons (quick reply, call-to-action URL, phone)
- Can include media (image, document, video)

Mendr will need roughly 15-20 templates at launch:

- New lead notification (utility)
- Quote ready (utility)
- Quote viewed by customer (utility)
- Invoice sent (utility)
- Invoice viewed (utility)
- Payment received (utility)
- Payment overdue +3 / +7 / +14 / +21 (utility)
- Appointment confirmed (utility)
- Appointment reminder day-before (utility)
- On-my-way (utility)
- Job complete + review request (utility)
- Seasonal maintenance reminder (utility)
- Load-shedding alert (utility)
- Diagnosis ready (utility)
- Re-engagement / referral (marketing) — opt-in only
- Refund / credit note (utility)

Templates support buttons. The "Accept / Decline" reply on lead notifications is a quick-reply button, which becomes a webhook event.

### Media handling
- Images: up to 5MB (JPEG, PNG)
- Documents (PDFs): up to 100MB
- Audio: up to 16MB
- Video: up to 16MB

Mendr will be sending PDFs (quotes, invoices, diagnosis reports) and receiving images and audio (voice notes from homeowners describing faults).

### Phone number registration
- A WABA (WhatsApp Business Account) must be registered with Meta via Facebook Business Manager
- The phone number used cannot be in personal WhatsApp use; once registered for Cloud API it permanently moves there
- A single business can have multiple numbers (e.g. one for homeowners, one for contractors)
- Display name + business profile must pass Meta review

### POPIA and consent
POPIA classifies WhatsApp messages as direct marketing for opt-in/opt-out purposes when they are promotional. **Utility messages (transactional)** about an actual interaction the user initiated are not "direct marketing" — they are transactional and do not require special opt-in. But Mendr should:

- Capture explicit opt-in at signup ("I agree to receive WhatsApp messages from Mendr about my home services activity")
- Honour "STOP" replies — opt out within the next message
- Maintain an audit log of consent

---

## 4. Architecture

### Provider choice — Meta Cloud API direct vs BSP

A Business Solution Provider (BSP) sits between Mendr and Meta and offers extra services (template management UI, conversation routing, analytics). Trade-off:

| Path | Pros | Cons | Recommendation |
|---|---|---|---|
| **Meta Cloud API direct** | Lowest cost (Meta rates only). Maximum control. No middleman risk | Self-manage template approval. Build conversation UI from scratch. Higher engineering cost | **Recommended for v2+** |
| **Twilio** (US BSP, international) | Great SDKs and docs. Fast time to launch. Mature webhook infrastructure | Higher per-message cost (markup of ~30-50% over Meta). USD billing | Recommended for MVP if engineering bandwidth is tight |
| **Clickatell** (SA BSP) | SA-based support. ZAR billing. Local context awareness | Less mature API than Twilio. Smaller dev community | Backup option |
| **Infobip** (Croatian BSP, large SA presence) | Strong SA presence. Good template management | Enterprise-pricing oriented. Onboarding heavier | Skip for MVP |

**Recommendation:** Start with **Twilio** for MVP (fastest to launch, mature webhooks, good SDK for Next.js). Migrate to **Meta Cloud API direct** at v2 once volume justifies it (typically once monthly conversation costs cross ~$300/month, the Twilio markup matters).

### Component architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         WhatsApp                                │
│  (homeowner phone)              (contractor phone)              │
└─────────────────────────────────────────────────────────────────┘
              ↓                              ↓
              ↓                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Twilio / Meta Cloud API                      │
│                  (delivery + receive webhook)                   │
└─────────────────────────────────────────────────────────────────┘
              ↓                              ↑
              ↓ inbound webhook              ↑ outbound API
              ↓                              ↑
┌─────────────────────────────────────────────────────────────────┐
│                  /api/whatsapp/webhook                          │
│  - Verify signature                                              │
│  - Route by sender phone number → homeowner | contractor | new  │
│  - Route by message type → text | media | reaction | reply       │
│  - Route by intent → diagnosis | quote | invoice | command       │
└─────────────────────────────────────────────────────────────────┘
              ↓                              ↑
              ↓                              ↑
┌─────────────────────────────────────────────────────────────────┐
│                  WhatsApp router (lib/whatsapp/)                │
│  - intent.ts (detect: diagnose, quote, invoice, status, lookup)│
│  - homeowner.ts (handle diagnosis sub-flow)                     │
│  - contractor.ts (handle command sub-flows)                     │
│  - session.ts (conversation state, multi-turn flows)            │
│  - templates.ts (template id registry + variable mapping)       │
│  - send.ts (outbound dispatcher)                                │
└─────────────────────────────────────────────────────────────────┘
              ↓                              ↓
              ↓                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Existing Mendr pipeline (Gemini diagnose, providers, etc)      │
│  Quote / invoice generators (Phase 2 contractor work)           │
└─────────────────────────────────────────────────────────────────┘
              ↓
              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase (Postgres + Storage)              │
│  - whatsapp_messages (inbound + outbound log)                   │
│  - whatsapp_sessions (multi-turn conversation state)            │
│  - whatsapp_templates (registry, costs, approval status)        │
│  - diagnoses, jobs, quotes, invoices, customers (existing)      │
└─────────────────────────────────────────────────────────────────┘
```

### Database additions

```sql
-- New tables required for WhatsApp integration. Apply via Supabase MCP.

-- Inbound + outbound message log. Append-only.
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel_phone_number text NOT NULL, -- our WhatsApp number that handled this
  counterparty_phone_number text NOT NULL, -- the user's number
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contractor_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES diagnoses(id) ON DELETE SET NULL,
  template_id text,
  conversation_category text CHECK (conversation_category IN ('service', 'utility', 'authentication', 'marketing')),
  message_type text CHECK (message_type IN ('text', 'image', 'document', 'audio', 'video', 'button_reply', 'list_reply')),
  body text,
  media_url text,
  media_mime_type text,
  whatsapp_message_id text UNIQUE,
  status text CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  cost_usd numeric(10, 6),
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_messages_counterparty_idx ON public.whatsapp_messages(counterparty_phone_number, created_at DESC);
CREATE INDEX whatsapp_messages_user_idx ON public.whatsapp_messages(user_id, created_at DESC);
CREATE INDEX whatsapp_messages_contractor_idx ON public.whatsapp_messages(contractor_id, created_at DESC);

-- Multi-turn conversation state. Cleared after timeout or completion.
CREATE TABLE public.whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_phone_number text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES providers(id) ON DELETE CASCADE,
  current_intent text, -- 'diagnose' | 'quote' | 'invoice' | etc.
  state jsonb, -- intent-specific working state
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Template registry. Synced with Meta's approved templates.
CREATE TABLE public.whatsapp_templates (
  id text PRIMARY KEY, -- e.g. 'lead_new_v1'
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('utility', 'authentication', 'marketing')),
  language_code text NOT NULL DEFAULT 'en',
  body text NOT NULL,
  meta_template_id text, -- the id Meta assigns
  meta_approval_status text CHECK (meta_approval_status IN ('pending', 'approved', 'rejected', 'paused')),
  variable_count int NOT NULL DEFAULT 0,
  button_count int NOT NULL DEFAULT 0,
  estimated_cost_zar numeric(10, 4),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Webhook security
- Verify Twilio signature (or Meta `X-Hub-Signature-256`) on every inbound request
- Rate-limit per phone number (existing `checkRateLimit` infrastructure — add `whatsappInbound` bucket)
- POPIA: log all consent + opt-out events with timestamp

---

## 5. The homeowner diagnosis flow on WhatsApp

### Happy path

```
Homeowner (first contact):
"Hi, I have a leaking geyser, can you help?"
            ↓
Mendr replies:
"Welcome to Mendr — I diagnose home faults from a photo.
Please send a photo of the issue and tell me what suburb you're in.
By continuing, you agree to our terms and privacy policy: mendr.co.za/terms
Reply STOP at any time to opt out."
            ↓
Homeowner:
[Photo of geyser dripping from overflow pipe]
"Claremont. The pipe under it has been dripping for 2 days."
            ↓
Mendr replies (after Gemini pipeline):
"Looks like a stuck pressure relief valve on your geyser. I've drafted a full
diagnosis below.

▶ Diagnosis: Stuck Pressure Relief Valve
▶ Trade: Plumbing
▶ Typical cost: R1,500 – R6,000

[PDF attached: full Mendr report]

You can verify this yourself: with the geyser breaker off, the dripping should
stop within 2-3 hours. If it doesn't, the valve has failed.

Tap below to see 3 vetted plumbers near you in Claremont:
[Button: See Plumbers]   [Button: Refine Diagnosis]"
            ↓
Homeowner taps "See Plumbers":
"Here are 3 vetted plumbers near you in Claremont:

1. Sipho's Plumbing ★4.8 (47 reviews)
   📞 tap to call
   
2. ProFix Plumbing ★4.6 (32 reviews)
   📞 tap to call

3. Sandton Plumbing ★4.9 (18 reviews)
   📞 tap to call

Open full match results: mendr.co.za/match/[id]"
```

### Multi-turn refinement

If the model's `structural_confidence < 70` or it produces a `photo_request`:

```
Mendr:
"I can see damp around your geyser but it's hard to tell if the leak is from the
valve or the tank itself. Could you send a closer photo of the tank's underside
+ a photo of the drip tray (if any)?"
            ↓
Homeowner: [sends 2 more photos]
            ↓
Mendr: [refined diagnosis with the 4 images total, weighted with new images first]
```

### State management

The `whatsapp_sessions` table holds the current conversation state. For a diagnosis in progress:

```json
{
  "current_intent": "diagnose",
  "state": {
    "diagnosis_id": "uuid",
    "step": "awaiting_more_photos",
    "image_count": 1,
    "location": "Claremont",
    "description": "geyser leaking 2 days"
  }
}
```

When the second batch of photos arrives, the existing diagnosis_id is hydrated and refinement runs. The diagnosis_id links the WhatsApp session to the user's account record — they can also view the report on the web at `/report/[id]`.

### Account linking
WhatsApp identifies users by phone number. Mendr links phone → user_id via:

- Existing user with this phone in their profile → match
- No existing user → create a guest diagnosis with phone in `whatsapp_messages.counterparty_phone_number`, send a link to convert to a full account ("Save this report to your home? mendr.co.za/auth?phone=...")
- Existing user but no phone on record → ask once, link, save

---

## 6. The contractor flow on WhatsApp

### Real-time lead notification

```
Mendr (utility template — outbound):
"🔧 New Mendr lead — Plumbing in Claremont

Diagnosis: Stuck Pressure Relief Valve
Confidence: High
Distance: 2.4km from your service area centre

Reply YES to accept, NO to pass."

[Button: YES Accept]   [Button: NO Pass]
```

Contractor taps YES:

```
Mendr replies (now in service window):
"✅ Lead accepted. I've added it to your job inbox.

Customer: Sarah M (will not be shown until contact)
Location: Claremont 7708
Diagnosis: Stuck Pressure Relief Valve
Photos: 3 attached below

Ready to quote? Type /quote with the line items, or open the job in the app:
mendr.co.za/jobs/[id]"

[Photo 1]
[Photo 2]
[Photo 3]
```

### Natural-language quote generation

```
Contractor types in WhatsApp:
"/quote pressure valve replacement R450, labour 2hrs R600, call-out R250"

Mendr replies:
"📋 Draft quote for Sarah M:

  Pressure valve replacement      R450.00
  Labour (2 hrs @ R300/hr)        R600.00
  Call-out fee                    R250.00
  ─────────────────────────────
  Subtotal                       R1,300.00
  VAT @ 15%                        R195.00
  ─────────────────────────────
  TOTAL                          R1,495.00

[Button: Send to Sarah]   [Button: Edit]   [Button: Cancel]"

Contractor taps "Send to Sarah":
Mendr sends to Sarah's WhatsApp (utility template):
"📋 Quote from Sipho's Plumbing — R1,495 total
Tap to view PDF: [link]
Tap to accept and book: [link]"

Mendr replies to contractor:
"✅ Quote sent to Sarah. I'll let you know when she views it."
```

### Natural-language invoicing

```
Contractor:
"/invoice job-1234 mark as complete + invoice"

Mendr:
"📋 Invoice ready for job #1234 (Sarah M):

  Pressure valve replacement      R450.00
  Labour (2 hrs)                  R600.00
  Call-out fee                    R250.00
  VAT @ 15%                       R195.00
  ─────────────────────────────
  TOTAL                          R1,495.00

[Button: Send to Sarah]   [Button: Edit]   [Button: Cancel]"

Contractor taps Send. Sarah receives invoice PDF + payment links (Yoco, PayFast, Ozow EFT).

When Sarah pays, Mendr notifies the contractor:
"💰 Payment received from Sarah M for invoice #INV-2026-0042.
R1,495 settled via Yoco. Job closed."
```

### Quick commands

| Command | Effect |
|---|---|
| `/today` | List today's scheduled jobs |
| `/job 1234` | Status of a specific job |
| `/customer Sarah` | Lookup customer record |
| `/done 1234` | Mark job 1234 complete |
| `/paid INV-0042 cash` | Mark invoice paid in cash |
| `/leads` | List unaccepted leads |
| `/overdue` | List overdue invoices |
| `/quote ...` | Generate quote (natural language) |
| `/invoice ...` | Generate invoice |
| `/help` | List commands |

### Intent detection

Not every contractor message starts with `/`. Some will type naturally ("send the invoice to Sarah for R1500"). The intent router uses Gemini for a cheap classification call to detect intent from free-text input, falling back to a clarification ("Did you mean to send an invoice? Reply YES to confirm").

For commands like `/quote` and `/invoice`, parse the rest of the message as line items via a structured Gemini call — this is the same prompt engineering as the diagnosis pipeline but with a different schema.

---

## 7. Notification strategy — what we send, when, and to whom

### Inviolable rules

- **No marketing pushes outside the explicitly-opted-in re-engagement template.** Utility only by default.
- **3-4 max outbound conversations per month per user** outside of active jobs (the homeowner anti-spam rule from `03-homeowner-retention.md`).
- **Honour STOP within one message turnaround.** A user who replied STOP gets a confirmation and is suppressed permanently for that category.
- **Per-job notifications are uncapped within the job lifecycle** — appointment, on-my-way, complete, review request are all expected and welcomed.

### The notification matrix

| Trigger | Recipient | Template category | Cost (~ZAR/conv) | Approx volume/month |
|---|---|---|---|---|
| New matched lead | Contractor | Utility | R0.15 | ~10 / active contractor |
| Quote viewed by customer | Contractor | Utility | R0.15 | ~5 / active contractor |
| Invoice sent | Customer | Utility | R0.15 | ~3 / active customer |
| Payment received | Contractor | Utility | R0.15 | ~3 / active contractor |
| Overdue +3/+7/+14/+21 | Customer | Utility | R0.15 × 4 max | ~2 / overdue invoice |
| Appointment reminder | Customer | Utility | R0.15 | ~3 / customer |
| On-my-way | Customer | Utility | R0.15 | ~3 / customer |
| Job complete + review request | Customer | Utility | R0.15 | ~3 / customer |
| Seasonal maintenance reminder | Homeowner | Utility | R0.15 | ~4 / year |
| Load-shedding alert (suburb-specific) | Homeowner | Utility | R0.15 | ~2 / month per active home |
| Diagnosis ready (after web upload) | Homeowner | Utility | R0.15 | ~1 / diagnosis |
| Re-engagement | Homeowner | Marketing | R0.65 | ≤ 1 / quarter, opt-in only |

### Estimated monthly WhatsApp cost at scale

Assuming Year 1 end state of 500 contractors (75 paying) + ~2,000 active homeowners:

| Cohort | Conversations / mo | Cost / mo (ZAR) |
|---|---|---|
| 75 paid contractors × ~20 utility convs each | 1,500 | R225 |
| 425 free-tier contractors × ~3 utility convs each (lead notifications) | 1,275 | R191 |
| 2,000 homeowners × ~3 utility convs each | 6,000 | R900 |
| 2,000 homeowners × 1 marketing conv per quarter | ~667 / mo | R433 |
| **Total Year 1 monthly WhatsApp cost** | **~9,400 convs** | **~R1,750** |

Negligible against the R47K MRR target. Costs scale linearly; at Year 2's 1,500 contractors + 8,000 homeowners scale, WhatsApp costs around ~R7,500/mo against R200K+ MRR.

---

## 8. Implementation phasing

### Phase A — WhatsApp foundation (MVP, weeks 1-4)

Goal: outbound notifications work, inbound diagnosis works end-to-end.

1. WhatsApp Business Account registration with Meta (week 1; allow 5-10 days for verification)
2. Twilio account, WABA number registration (parallel)
3. Database migrations: `whatsapp_messages`, `whatsapp_sessions`, `whatsapp_templates`
4. Webhook endpoint at `/api/whatsapp/webhook` with Twilio signature verification
5. Outbound dispatcher: `lib/whatsapp/send.ts`
6. Template registry: 6 initial utility templates submitted to Meta for approval (lead_new, appointment_reminder, on_my_way, job_complete_review, invoice_sent, payment_received)
7. Inbound router: phone-number → user/contractor lookup
8. Homeowner diagnosis flow: photo + text → Gemini → reply with summary + PDF + tap-link to web report
9. Contractor lead acceptance flow: outbound template + button reply → job created

### Phase B — Contractor command surface (v2, weeks 5-10)

Goal: contractors can run their business from WhatsApp.

10. Multi-turn session state engine
11. Intent detection (Gemini classifier for free-text input)
12. `/today`, `/leads`, `/customer`, `/job`, `/done`, `/paid`, `/overdue` commands
13. `/quote ...` with structured line-item parsing
14. `/invoice ...` with structured line-item parsing
15. PDF generation pipeline for quotes and invoices (Puppeteer / react-pdf)
16. Customer-facing WhatsApp delivery (quote sent → customer template with tap-link)
17. Payment-status webhooks from Yoco/PayFast → contractor notification template

### Phase C — Homeowner retention surfaces (v2, weeks 8-12)

Goal: WhatsApp is part of the homeowner stickiness toolkit.

18. Seasonal maintenance reminder templates + cron
19. Load-shedding alert templates + EskomSePush API integration + suburb-level dispatch
20. Refinement-via-WhatsApp (multi-turn flow re-using existing refine endpoint)
21. Landlord report-out mode: renter submits via WhatsApp → escalates to landlord's email + WhatsApp

### Phase D — Optimisation (v3, weeks 13+)

22. Move from Twilio to Meta Cloud API direct (cost optimisation)
23. Advanced commands: voice-only quote generation, multi-attachment invoicing
24. Multi-language: Afrikaans + isiXhosa template variants
25. WhatsApp Pay integration (when Meta launches in SA — currently in beta in India/Brazil)
26. Conversation-level analytics: cost-per-acquired-customer via WhatsApp, retention impact

---

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Meta rejects template | High | Medium | Stick to utility/transactional language. Submit early. Have 2 backup variants per template |
| WABA verification delays | Medium | High | Apply 4-6 weeks before MVP launch. Engage Twilio support for expedite |
| Phone number suspended for policy violation | Low | Severe | Strict opt-in capture. Honour STOP immediately. Audit log for every send |
| Twilio cost markup hurts unit economics at scale | Medium | Medium | Migrate to Meta Cloud API direct at v2 |
| Intent detection misfires on natural-language contractor input | High | Low | Always confirm before taking destructive action ("I'll create an invoice for R1,495 — reply YES to send") |
| WhatsApp outage during peak time | Low | High | Fall back to email for invoice/quote delivery. Notify contractor via in-app dashboard |
| POPIA compliance gaps | Medium | High | Capture explicit opt-in at signup. Treat reply STOP as opt-out within one message. Log all consent events |
| Customer expects instant reply, contractor unavailable | High | Medium | Auto-reply "I'll be back to you within X hours" + auto-create job in contractor's inbox. Push notification to contractor app |
| Voice notes contain accents Gemini struggles with | Medium | Low | Use Google Speech (already integrated) with auto-detect language. Fall back to text request if confidence low |

---

## 10. Decisions to make before building

1. **One WhatsApp number or two?** One number (intent-routed by sender's account type) keeps operations simpler and cost lower. Two numbers (separate homeowner + contractor) is clearer for end-users but doubles WABA management. **Recommendation:** start with one, evaluate splitting if confusion arises.

2. **Twilio (faster start) or Meta Cloud API direct (cheaper at scale)?** Twilio for MVP — the time savings outweigh the ~30-50% markup. Migrate at v2 once volume warrants. **Recommendation:** Twilio MVP, Meta direct v2.

3. **Build PDF generation in-house or use a service?** Quotes and invoices need PDF rendering. Options: Puppeteer (Chromium-based, heavy), react-pdf (lighter, more control), Bannerbear / DocSpring (SaaS). **Recommendation:** react-pdf for MVP, evaluate Bannerbear if scaling rendering becomes a bottleneck.

4. **Voice-note quoting (contractor records "R500 valve, R600 labour, send to Sarah")?** Powerful but more error-prone than text. **Recommendation:** v3, after the text-based command flow is proven.

5. **Should homeowners be able to refine a diagnosis via WhatsApp by replying with more photos?** Yes — natural and high-value. **Recommendation:** ship in Phase C of WhatsApp v2 (currently planned).

6. **Should we surface a WhatsApp-only diagnosis option on the homepage ("WhatsApp +27 87 ... to start")?** Yes — major distribution unlock, reduces web friction for less tech-savvy users. **Recommendation:** prominent CTA on `/start` once webhook is live.

---

## 11. The one-line summary

**Treat WhatsApp as the channel into Mendr's platform — not as a separate product. Inbound diagnosis flows replace the homeowner web flow for ~30-40% of users. Outbound notifications are how Mendr stays present in the contractor's day. Commands let a contractor run their business from a place they were already going to be. The web app is for management and the home record; WhatsApp is for transactions and presence.**

---

*See `04-contractor-feature-spec.md` for the feature inventory this powers. See `02-contractor-retention-and-pricing.md` for the strategic context.*
