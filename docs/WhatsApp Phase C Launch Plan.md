# WhatsApp Phase C — Launch Plan

*Drafted June 2026; implementation pass completed 10 June 2026. Companion to the Phase A/B work in `src/lib/whatsapp/`. Goal: real homeowners on real WhatsApp by day one (July 2026).*

## Context

Phases A (conversation engine + simulator) and B (lead notifications) were built. This plan closed Phase C: the Meta Cloud API channel, phone↔account linking, templates, compliance, voice notes, and interactive messages. Checked items are implemented and tested; unchecked items are listed in **Your action plan** at the bottom.

**Channel decision: launch via a BSP (Twilio or 360dialog), migrate to direct Cloud API later.** The adapter is built against the Meta Cloud API payload/send shapes, which 360dialog proxies unchanged (`WHATSAPP_GRAPH_BASE_URL` points at their gateway). A Twilio adapter can be added behind the same `WhatsappChannel` interface without touching the bot.

---

## Track 0 — Meta admin (zero code — see Your action plan)

- [ ] Meta Business Manager verification (launch-critical path; days–weeks)
- [ ] Choose BSP (360dialog: flat fee, no markup · Twilio: markup, better tooling)
- [ ] WABA + dedicated phone number (must not be tied to an existing WhatsApp app)
- [ ] Display name approval ("Mendr")
- [ ] Submit the four templates below for approval

## Workstream 1 — Channel adapter + webhook ✅

- [x] Provider-agnostic `WhatsappChannel` interface — `src/lib/whatsapp/channel/types.ts`
- [x] Meta Cloud API adapter (signature verify, payload parse, send, media fetch) — `channel/meta-cloud.ts`
- [x] Webhook route: GET handshake + POST with HMAC verification — `src/app/api/whatsapp/webhook/route.ts`
- [x] Idempotent processing: per-message-id claim in Redis (in-memory fallback in dev) — `dedupe.ts`
- [x] ACK 200 fast; diagnosis runs after the response via `after()` so Meta never times out
- [x] Per-IP rate-limit bucket `whatsappWebhook`
- [x] Junk payloads never throw (tested)

## Workstream 2 — Outbound send ✅

- [x] Outbox with retry/backoff on 429/5xx/network — `outbox.ts`
- [x] 4096-char hard guard on text sends (adapter level)
- [x] Dead-letter table `whatsapp_outbox_failures` for exhausted sends + failed status callbacks
- [x] Delivery status callbacks parsed; failures logged and persisted

## Workstream 3 — Media ✅

- [x] Media id → CDN URL → bytes fetch with bearer token
- [x] Images converted to the data-URI contract `bot-handler` already accepts (≤4/turn, ≤8 MB)
- [x] Documents/videos get a polite "send a photo" reply

## Workstream 4 — Phone ↔ account linking ✅

- [x] `resolveUserId` stub replaced: real lookup on `profiles.phone` + `phone_verified_at`
- [x] In-chat magic link for unknown numbers (possession-verified, two taps; falls back to /register) — `linking.ts`, `/api/whatsapp/link`
- [x] Web-first OTP via `link_account_otp` template — `/api/whatsapp/otp` (POST send, PUT verify)
- [x] Tokens stored hashed (sha256), TTL'd, attempt-capped; migration `20260609120000_whatsapp_phase_c.sql`
- [x] Verified-phone uniqueness enforced (partial unique index)
- [ ] Register page must honour the `next` query param so the post-signup redirect completes the link (small frontend task — verify current behaviour)

## Workstream 5 — Templates + 24h window ✅ (code) / ⬜ (approval)

- [x] Template registry with env-overridable names — `templates.ts`
- [x] `resume_diagnosis` nudge sent by cron for sessions stalled 24–72h (once per stall via `resume_prompted_at`)
- [x] `lead_alert_contractor` fired at the pro on lead creation (WhatsApp, alongside the Phase B email)
- [x] `job_followup` scheduled 5 days after contact — converts `contact_initiated` into reviews + outcome data
- [x] `link_account_otp` for web-side verification
- [ ] Template copy submitted and approved in the WABA (see Your action plan for suggested wording)

## Workstream 6 — Opt-out + compliance ✅

- [x] STOP persists to `whatsapp_opt_outs`; proactive sends suppressed, user-initiated replies still answered
- [x] START lifts suppression with a confirmation
- [x] STOP copy now tells users about START
- [ ] Privacy notice line + policy link at registration (copy decision — one line in the gate message)

## Workstream 7 — Voice notes ✅

- [x] Inbound audio → CDN fetch → Gemini transcription (SA-language aware prompt) — `voice.ts`
- [x] "Here is what I heard…" confirmation precedes the answer
- [x] Graceful "could not make that out" fallback

## Workstream 8 — Interactive messages ✅

- [x] `OutboundMessage` extended with `options` / `interactiveBody` / `listButtonLabel` (simulator unaffected — it renders `text`)
- [x] Adapter renders ≤3 options as reply buttons, ≤10 as a list, falls back to text
- [x] Wired into: clarification chips, contractor offer (Yes/No), topic-change offer, address selection, contractor pages
- [x] Numeric button ids round-trip as option indices through the existing layer-1 parser
- [x] Kill switch: `WHATSAPP_INTERACTIVE_ENABLED=false`

## Workstream 9 — Ops ◐

- [x] Structured logging on channel events, sends, dead-letters
- [x] Cron route `/api/cron/whatsapp` (CRON_SECRET-gated): follow-ups, resume nudges, session cleanup (>30d)
- [ ] Vercel cron entry (or external scheduler) pointing at `/api/cron/whatsapp` hourly
- [ ] Alerting on dead-letter volume / webhook signature failures (Sentry alert rules)
- [ ] Runbook: quality-rating drop, template pause, BSP outage → degrade to web links

---

## Improvements to Phase A/B (from the review)

- [x] 1. `resolveUserId` real lookup (WS4)
- [x] 2. Resume flow made explicit via template + `resume_prompted_at` bookkeeping
- [x] 3. Message length guard at the channel boundary (4096)
- [x] 4. Intent classifier → `gemini-2.0-flash-lite` (~¼ cost) + 10-min response cache
- [x] 5. `contact_initiated` dead end → `job_followup` scheduling (the data-moat feature)
- [x] 6. Contractor MORE paging (text "MORE" + native "More options" row)
- [x] 7. Session hygiene: cleanup cron + `last_message_at` index
- [ ] 8. Golden-conversation snapshot tests per flow (17 new unit tests added for adapter/outbox/linking; the full conversation-snapshot suite is still the highest-value testing fast-follow)
- [x] 9. Guest-mode decision documented: real unknown numbers always hit the registration gate, now with a magic link (one-free-diagnosis experiment deferred to post-launch)
- [x] 10. Non-English greeting (Afrikaans/isiXhosa/isiZulu) → graceful English-for-now reply at idle

## New files

`src/lib/whatsapp/channel/{types,meta-cloud}.ts` · `outbox.ts` · `opt-out.ts` · `templates.ts` · `linking.ts` · `voice.ts` · `dedupe.ts` · `src/app/api/whatsapp/{webhook,link,otp}/route.ts` · `src/app/api/cron/whatsapp/route.ts` · `supabase/migrations/20260609120000_whatsapp_phase_c.sql` · tests in `src/lib/whatsapp/__tests__/{meta-cloud,outbox-linking}.test.ts`

---

# Your action plan (things only you can do)

**This week — the approval clock is the schedule risk, not code:**

1. **Start Meta Business verification today** (business.facebook.com → Security Centre). You need company registration docs and domain verification on mendr.co.za. Days–weeks; everything else waits on it.
2. **Pick the BSP.** Recommendation: 360dialog for launch (flat ~€49/mo, no per-message markup, direct Cloud API payload pass-through — the adapter works unchanged). Twilio if you value their console/support more than margin.
3. **Buy/assign the WhatsApp number.** A fresh number not registered to any WhatsApp app. Set display name "Mendr".
4. **Submit the four templates** (Utility category; adjust to taste, keep the {{n}} order):
   - `resume_diagnosis`: "You were busy diagnosing {{1}} with Mendr. Want to pick up where you left off? Just reply and we will continue."
   - `lead_alert_contractor`: "New Mendr lead: {{1}} near {{2}}. View the diagnosis and respond here: {{3}}"
   - `job_followup`: "Did {{1}} sort out your {{2}}? Reply YES or NO — your answer helps neighbours pick the right pro."
   - `link_account_otp` (Authentication category): "Your Mendr verification code is {{1}}. It expires in 10 minutes."

**At integration time (after BSP onboarding):**

5. Set env vars in Vercel: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (any random string you choose), and for 360dialog `WHATSAPP_GRAPH_BASE_URL`.
6. Point the webhook at `https://<your-domain>/api/whatsapp/webhook` and subscribe to `messages`; Meta/BSP will call GET with your verify token.
7. Apply the migration (`supabase db push` or the dashboard) — it adds the five Phase C tables/columns.
8. Add an hourly cron hitting `/api/cron/whatsapp` with `Authorization: Bearer $CRON_SECRET` (Vercel cron or BSP scheduler).
9. Check the register page respects `?next=` so the magic-link → signup → auto-link loop closes.
10. **Test end-to-end with your own phone** before announcing: photo → diagnosis → buttons → contractor → STOP/START → voice note.

**Fast-follows to schedule (code, not blocking day one):**

11. Golden-conversation snapshot test suite for the state machine (improvement 8).
12. Sentry alert rules on dead-letter inserts and signature failures.
13. Admin view over `whatsapp_outbox_failures` with a replay button.
14. The one-free-diagnosis-before-registration conversion experiment.
