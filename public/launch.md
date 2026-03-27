# Launch Readiness Audit — Scandio Home Services

> Audited: 2026-03-25
> Stack: Next.js 16, React 19, TypeScript, Supabase, Tailwind CSS, Google Gemini, Google Places

---

## Prioritised Fix List (Ordered by Severity)

### 🔴 BLOCKERS — Must fix before any public launch

| # | Issue | File | Action |
|---|-------|------|--------|
| 1 | **API keys committed to repo** — `.env` contains live Gemini, Google Places, and Supabase keys | `.env` | Rotate ALL keys immediately. Rename to `.env.local`. Add `.env*` to `.gitignore`. Create `.env.example` with placeholders. |
| 2 | **Pro onboarding form never saves data** — form submits, fakes a delay, then silently discards everything | `src/app/pro/onboard/page.tsx:655` | Implement the Supabase insert + API route referenced in the TODO comment. |
| 3 | **Chat route redirects to `/scan/{id}` — page does not exist** — users following chat links get a 404 | `src/app/chat/page.tsx` | Fix redirect to `/diagnosis/{id}` (or whichever the intended route is) and confirm `/scan` is not needed elsewhere. |
| 4 | **`@ts-nocheck` on provider detail page** — TypeScript is completely disabled, hiding real runtime risks | `src/app/pro/[id]/page.tsx:1` | Remove the pragma and resolve the resulting type errors. At minimum, type the `provider` object rather than casting to `any`. |

---

### 🟡 MAJOR — Fix before launch for reliability/quality

| # | Issue | File | Action |
|---|-------|------|--------|
| 5 | **No `.env.example` file** — README references `cp .env.example .env` but the file doesn't exist | `README.md` | Create `.env.example` with every required variable listed as a placeholder. |
| 6 | **`any` casts in pro hooks** — ~15 instances across reviews, gallery, and providers hooks suppress type errors | `src/app/pro/hooks/reviews.ts`, `gallery.ts`, `providers.ts` | Create proper TypeScript types for Supabase query results. Eliminate `as any` casts. |
| 7 | **`auth-context.tsx` types events and sessions as `any`** | `src/context/auth-context.tsx:53` | Replace `_event: any, session: any` with `AuthChangeEvent` and `Session \| null` from `@supabase/supabase-js`. |
| 8 | **Server Supabase client throws hard if env vars are missing** — no graceful degradation unlike the browser client | `src/lib/supabase-server.ts:41–44` | Add a clear startup error or fallback consistent with the browser client approach. |

---

### 🟠 MODERATE — Should fix before launch

| # | Issue | File | Action |
|---|-------|------|--------|
| 9 | **No email service integrated** — no SendGrid, Resend, or equivalent; no `/api/send-email` route | — | Decide if email is needed at launch (onboarding confirmation, contact receipts). If yes, integrate now. |
| 10 | **WhatsApp route generates messages only — no actual send** — the API returns a message string but does not call the WhatsApp API | `src/app/api/whatsapp-message/route.ts` | Either integrate the WhatsApp Business API or clearly label this as a "compose" step in the UI so users know to send it themselves. |
| 11 | **No middleware for route protection** — all auth is client-side; server-rendered pro pages could flash unauthenticated content | — | Add `middleware.ts` with session-based redirects for protected routes (e.g. `/pro/onboard`, `/pro/[id]` edit views). |
| 12 | **`playwright` in devDependencies but zero test files** — signals incomplete test coverage | `package.json` | Either write E2E tests for the critical paths (diagnosis flow, provider search) or remove the dependency. |

---

### 🟢 LOW — Clean up before launch

| # | Issue | File | Action |
|---|-------|------|--------|
| 13 | **`dotenv` package is unnecessary** — Next.js loads `.env` files natively | `package.json` | Remove `dotenv` from dependencies. |
| 14 | **`tw-animate-css` overlaps with Tailwind's built-in animation utilities** | `package.json` | Remove unless a specific animation it provides is actively used. |
| 15 | **`shadcn` listed in `dependencies` not `devDependencies`** — it's a CLI tool, not a runtime dep | `package.json` | Move to `devDependencies`. |
| 16 | **Analytics is console.log only** — `src/lib/ai-logging.ts` outputs JSON to stdout; nothing is tracked in a real analytics platform | `src/lib/ai-logging.ts` | Integrate a real analytics sink (e.g. Mixpanel, PostHog, or even Supabase events table) if launch metrics matter. |

---

## Full Audit Detail

---

### 1. API Routes

All 13 routes have handlers. None are stubs. Summary:

| Route | Status | Notes |
|-------|--------|-------|
| `POST /api/diagnose` | ✅ Implemented | Streams Gemini responses. Complex post-processing logic for output enforcement — higher maintenance burden. Rate limit (429) handled correctly. |
| `POST /api/providers` | ✅ Implemented | Google Places text search + Supabase caching. Falls back through three API key env vars — `GOOGLE_PLACES_API_KEY` → `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` → `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. |
| `GET /api/directions` | ✅ Implemented | Google Directions API. Results cached in Supabase for 7 days. |
| `POST /api/geocode` | ✅ Implemented | Bidirectional (lat/lng ↔ address). Filters to Western Cape. |
| `POST /api/reviews` | ✅ Implemented | Inserts Scandio reviews. Validates half-star ratings. |
| `POST /api/reviews-count` | ✅ Implemented | Aggregates Scandio + Google review counts per provider. |
| `POST /api/upload-image` | ✅ Implemented | Uploads to Supabase `gallery` bucket. Path traversal protection present. |
| `POST /api/welcome-upload-image` | ✅ Implemented | Duplicate of upload-image for the welcome flow. |
| `POST /api/enrich/get` | ✅ Implemented | Returns cached enrichment data. |
| `POST /api/enrich/queue` | ✅ Implemented | Queues enrichment with semaphore concurrency cap of 10. |
| `POST /api/providers/restore-token` | ✅ Implemented | Tracks contact events and rotation tokens. |
| `POST /api/whatsapp-message` | ✅ Implemented | Generates message text via Gemini with fallback template. Does NOT send via WhatsApp API. |
| `POST /api/providers/[id]/sync-google-gallery` | ✅ Implemented | Syncs Google Place photos to provider gallery. |

---

### 2. Page Components

All 16 pages are implemented. Issues:

| Route | Status | Notes |
|-------|--------|-------|
| `/` | ✅ | Landing with services grid and testimonials. |
| `/landing` | ✅ | Marketing page with pro benefits. |
| `/welcome` | ✅ | Image upload + context entry. |
| `/chat` | ⚠️ | Redirects to `/scan/{id}` — route does not exist. **See Blocker #3.** |
| `/diagnosis` | ✅ | AI results display. |
| `/diagnosis/[id]` | ✅ | Dynamic diagnosis wrapper (server component). |
| `/match` | ✅ | Renders `MatchClient`. |
| `/match/[id]` | ✅ | Dynamic match page. |
| `/report` | ✅ | Provider report submission. |
| `/report/[id]` | ✅ | Report detail. |
| `/pro` | ✅ | Legacy pro listing. |
| `/pro/[id]` | ⚠️ | Has `@ts-nocheck`. Multiple `any` casts. **See Blocker #4.** |
| `/pro/join` | ✅ | Join network page. |
| `/pro/onboard` | ⚠️ | Form collects data but TODO at line 655 — never saves. **See Blocker #2.** |

---

### 3. Environment Variables

#### Defined (in `.env` — should be `.env.local`):

| Variable | Used For | Exposure Risk |
|----------|----------|---------------|
| `GEMINI_API_KEY` | AI diagnosis | 🔴 Server-only — safe if not in repo |
| `GOOGLE_PLACES_API_KEY` | Provider search, directions, geocode | 🔴 Server-only — safe if not in repo |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` | Maps embed | 🟡 Public — restrict to allowed domains in GCP console |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps embed (client) | 🟡 Public — restrict to allowed domains |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser auth | 🟢 Safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth | 🟢 Safe to expose (enforced by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB operations | 🔴 Must NEVER be public — server only |

#### Missing from `.env` but referenced in code:

None — all referenced variables are present. However:

- **No `.env.example`** file exists despite README referencing it.
- **No rate limit env vars** — limits are hard-coded in `rate-limit.ts`.
- **`NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`** is referenced as a fallback in the providers route — this exposes the Places key to the browser. Consider removing this fallback and keeping Places API server-side only.

---

### 4. External Service Integrations

| Service | Status | Notes |
|---------|--------|-------|
| **Google Gemini** | ✅ Wired | `src/lib/ai-client.ts`. Model: `gemini-2.5-flash`. Cached client. Throws immediately if `GEMINI_API_KEY` is missing — no graceful degradation. |
| **Google Places** | ✅ Wired | Used across providers, directions, geocode, and refresh routes. Properly server-side. |
| **Supabase (DB + Auth + Storage)** | ✅ Wired | Browser client uses PKCE flow with auto-refresh. Server client uses service role. Browser client has graceful fallback if env vars are missing; server client does not. |
| **WhatsApp Business API** | ❌ Not integrated | Only generates message text. No send capability. |
| **Stripe / Payments** | ❌ Not integrated | No payment endpoints. Likely a future feature — confirm scope for launch. |
| **Email (SendGrid / Resend)** | ❌ Not integrated | No email sending. Confirm if needed for launch (e.g. onboarding confirmation). |
| **Analytics** | ⚠️ Partial | `src/lib/ai-logging.ts` logs structured JSON to console only. No analytics platform connected. |

---

### 5. TypeScript Health

- **`strict: true`** is enabled in `tsconfig.json` ✅
- **`@ts-nocheck`** on `src/app/pro/[id]/page.tsx` — negates strict mode for that entire file ❌
- **~15 `as any` casts** across `src/app/pro/hooks/` (reviews.ts, gallery.ts, providers.ts) ⚠️
- **`auth-context.tsx:53`** — `onAuthStateChange` callback types event and session as `any` ⚠️
- Inline type definitions in `src/app/api/diagnose/route.ts` — should be extracted to a types file (low priority)

---

### 6. Authentication

- Flow: Supabase PKCE (secure, correct)
- Auto-refresh tokens: ✅
- Session persistence: ✅
- Graceful auth init timeout (5s): ✅
- Main diagnosis flow works without auth: ✅
- **No server-side route protection (middleware)** — pro pages rely on client-side guards only ⚠️
- **Pro onboarding cannot complete** — blocked by the TODO ❌

---

### 7. Dependencies

**Remove before launch:**

| Package | Reason |
|---------|--------|
| `dotenv` | Next.js loads `.env` natively — this is redundant |
| `tw-animate-css` | Overlaps with Tailwind's built-in animations |
| `playwright` (devDep) | No test files use it; either write tests or remove |

**Move to devDependencies:**

| Package | Reason |
|---------|--------|
| `shadcn` | CLI tool, not a runtime dependency |

---

### 8. `next.config.ts`

```ts
experimental: {
  optimizePackageImports: ['geist-icons', 'radix-ui'],
}
```

No issues. Config is minimal and correct. Consider adding:
- `images.remotePatterns` if `next/image` is used with Supabase storage URLs (avoids runtime errors on image optimisation)

---

### 9. TODO / FIXME Comments

Only one outstanding TODO in the codebase:

```
src/app/pro/onboard/page.tsx:655
// TODO: wire up to Supabase insert / API route
await new Promise((r) => setTimeout(r, 1200));
```

This is a **blocker** — see Blocker #2 above.

---

## Summary Counts

| Severity | Count |
|----------|-------|
| 🔴 Blockers | 4 |
| 🟡 Major | 4 |
| 🟠 Moderate | 4 |
| 🟢 Low | 4 |

The core diagnosis and provider discovery flows are solid and production-ready. The main risks are the exposed credentials, the incomplete pro onboarding, the broken chat route, and the suppressed TypeScript on the provider detail page. Address the four blockers and the launch is viable.
