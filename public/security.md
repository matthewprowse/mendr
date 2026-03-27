# Security & Rate Limiting Audit

**Scope:** All API routes in `src/app/api/`, the rate limiting utility, file upload handling, authentication posture, and input validation across the full application.

**Bottom line:** A rate limiting utility (`src/lib/rate-limit.ts`) exists and is well-written, but it is wired up to **zero** routes. Every endpoint — including the Gemini streaming diagnosis, Google Places search, and image uploads — is completely open. A single abusive caller or scripted attack can drain your Google and Gemini quotas with no friction at all.

---

## Master Rate Limit Configuration

All limits live in one place. Adjust here only — do not hardcode limits inside individual route files.

```ts
// src/lib/rate-limit-config.ts
// ─────────────────────────────────────────────────────────────────────────────
// MASTER RATE LIMIT CONFIGURATION
//
// windowMs  — sliding window duration in milliseconds
// max       — maximum requests allowed per IP within that window
//
// Tuning guide:
//   - Raise `max` if legitimate users are being throttled (check logs first)
//   - Lower `max` if you see quota spikes on Google/Gemini dashboards
//   - Adjust `windowMs` to make the window broader or narrower
//   - All values should be reviewed when the app moves from beta to general availability
// ─────────────────────────────────────────────────────────────────────────────

export const RATE_LIMITS = {

    // ── AI endpoints ───────────────────────────────────────────────────────────
    // Gemini streaming call — most expensive operation in the app.
    // Each call generates a full vision-AI diagnosis and streams the response.
    // 10 per 10 minutes = ~1 diagnosis per minute sustained, enough for
    // legitimate homeowners, tight enough to blunt scripted abuse.
    diagnose: {
        windowMs: 10 * 60 * 1000, // 10 minutes
        max: 10,
    },

    // Gemini call to generate a WhatsApp message summary.
    // Lighter than diagnosis but still billable. 20/10 min is generous.
    whatsappMessage: {
        windowMs: 10 * 60 * 1000, // 10 minutes
        max: 20,
    },

    // ── Google API endpoints ───────────────────────────────────────────────────
    // Google Places Text Search. Each call may spawn additional pagination
    // and per-provider detail fetches. Keep this tight.
    providers: {
        windowMs: 60 * 1000, // 1 minute
        max: 15,
    },

    // Google Geocoding API. Used once per address lookup, no heavy caching.
    geocode: {
        windowMs: 60 * 1000, // 1 minute
        max: 20,
    },

    // Google Directions API. Has a 7-day cache so most hits are free.
    // Higher limit is fine — most will cache-hit before the API is called.
    directions: {
        windowMs: 60 * 1000, // 1 minute
        max: 40,
    },

    // Triggers the full enrichment pipeline: scrape + Gemini + image classify.
    // Expensive. Callers are expected to send a batch of place IDs, not call repeatedly.
    enrichQueue: {
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 5,
    },

    // Google gallery sync per provider profile page. Calls Google Places API.
    syncGallery: {
        windowMs: 60 * 1000, // 1 minute
        max: 10,
    },

    // ── Storage / upload endpoints ─────────────────────────────────────────────
    // Image upload. Each upload costs Supabase storage bandwidth.
    // Legitimate use: 1 photo per diagnosis session.
    uploadImage: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20,
    },

    // ── Database read/write endpoints ──────────────────────────────────────────
    // Enrichment cache read. Pure Supabase read, no external API.
    enrichGet: {
        windowMs: 60 * 1000, // 1 minute
        max: 60,
    },

    // Review submission. Spam risk — pending approval doesn't mean safe.
    // 5 reviews per hour per IP is more than sufficient for any real user.
    reviews: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5,
    },

    // Review count read. Low cost, higher limit.
    reviewsCount: {
        windowMs: 60 * 1000, // 1 minute
        max: 60,
    },

    // Token restoration on provider contact. Has its own 45-second dedup internally.
    // Rate limit adds an outer bound.
    restoreToken: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 30,
    },

} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;
```

---

## IP Extraction Helper

Rate limiting only works when you have a reliable caller identity. Add this alongside the config:

```ts
// src/lib/rate-limit-config.ts (add below RATE_LIMITS)

import type { NextRequest } from 'next/server';

/**
 * Extract the caller's IP address from a Next.js App Router request.
 *
 * On Vercel, the real IP is in x-forwarded-for (set by the edge network).
 * In local dev, this will often be undefined — rate limiting degrades
 * gracefully (all unknown IPs share the 'unknown' bucket, which is fine for dev).
 *
 * DO NOT trust x-forwarded-for in environments where it can be spoofed
 * (i.e. direct server access without a reverse proxy). On Vercel, this is safe.
 */
export function getCallerIp(req: NextRequest): string | null {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers.get('x-real-ip') ?? null;
}
```

---

## How to Apply a Rate Limit in Any Route

The pattern is identical for every endpoint. Copy-paste this block at the top of the route handler, changing only the bucket name:

```ts
import { applyRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS, getCallerIp } from '@/lib/rate-limit-config';

export async function POST(req: NextRequest) {
    // ── Rate limit ─────────────────────────────────────────────────────────────
    const rl = applyRateLimit({
        ip: getCallerIp(req),
        bucket: 'diagnose',                    // ← change per route
        config: RATE_LIMITS.diagnose,          // ← change per route
    });
    if (!rl.ok) {
        return NextResponse.json(
            { error: 'Too many requests. Please wait before trying again.' },
            {
                status: 429,
                headers: {
                    'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
                    'X-RateLimit-Limit': String(RATE_LIMITS.diagnose.max),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
                },
            }
        );
    }
    // ... rest of handler
}
```

---

## Critical Limitation: In-Memory Store Does Not Work on Vercel

**This is the most important thing to understand before deploying.**

`src/lib/rate-limit.ts` stores its counter map in `globalThis`. This works correctly in local development (single long-running Node process). On Vercel, each API route invocation runs in an isolated serverless function — `globalThis` is not shared between invocations, and state is reset on every cold start.

**In practice:** The current rate limiter will appear to work locally but will enforce nothing in production. Every request on Vercel will see a fresh `globalThis` with an empty store.

### Path to production-ready rate limiting

**Option A — Vercel KV (simplest for this stack)**

Vercel KV is a Redis-compatible key-value store that persists across function invocations.

```ts
// src/lib/rate-limit.ts (production replacement)
import { kv } from '@vercel/kv';

export async function applyRateLimit(params: {
    ip: string | null | undefined;
    bucket: string;
    config: { windowMs: number; max: number };
}): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
    const key = `rl:${params.bucket}:${params.ip ?? 'unknown'}`;
    const now = Date.now();
    const resetAt = now + params.config.windowMs;

    const count = await kv.incr(key);
    if (count === 1) {
        // First request in this window — set expiry
        await kv.pexpire(key, params.config.windowMs);
    }

    const ok = count <= params.config.max;
    const ttl = await kv.pttl(key);
    return {
        ok,
        remaining: Math.max(0, params.config.max - count),
        resetAt: now + ttl,
    };
}
```

Enable: `vercel env add KV_URL`, `vercel env add KV_REST_API_URL`, `vercel env add KV_REST_API_TOKEN`.

**Option B — Upstash Redis**

Upstash has a generous free tier and a purpose-built `@upstash/ratelimit` library:

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.UPSTASH_URL!, token: process.env.UPSTASH_TOKEN! });

// One limiter per bucket, created once and cached
const limiters: Record<string, Ratelimit> = {};

function getLimiter(bucket: string, config: { windowMs: number; max: number }): Ratelimit {
    if (!limiters[bucket]) {
        limiters[bucket] = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(config.max, `${config.windowMs}ms`),
            prefix: `rl:${bucket}`,
        });
    }
    return limiters[bucket];
}
```

**Option C — Supabase (already in the stack, zero new dependencies)**

Use the existing `provider_rotation_tokens` pattern as a template: store a `(bucket, ip, window_key, count)` row in a `rate_limits` table with a unique constraint on `(bucket, ip, window_key)`. Upsert on each request, check count against max.

Slightly higher latency than Redis (~10–20ms per check) but requires no new infrastructure:

```sql
-- supabase/tables.sql addition
create table if not exists rate_limits (
    bucket      text        not null,
    ip          text        not null,
    window_key  text        not null,   -- e.g. '2026-03-26T14:00' for 1-min windows
    count       int         not null default 1,
    reset_at    timestamptz not null,
    primary key (bucket, ip, window_key)
);
```

**Recommendation:** For beta, use the current in-memory implementation locally and add `export const maxDuration = 60` to the diagnose route to limit blast radius. Before public launch, add Upstash (free tier covers ~500k requests/month) or Vercel KV.

---

## Route-by-Route Findings

### 🔴 `/api/diagnose` — CRITICAL, no protection

**Risk:** Gemini streaming call. Each request costs real API quota. A scripted attacker can send thousands of requests and exhaust your monthly Gemini budget.

**Current state:** No rate limit. No authentication. No request size cap on the base64 image payload.

**Additional issues:**
- `history` array is passed directly to Gemini with no length cap. A caller can send 1,000 history turns, inflating token usage and cost per call.
- `attachments` array has no length cap. Sending 50 images in one call is technically allowed.
- The `textQuery` field has no maximum length validation.

**What to add:**
```ts
// At the top of the handler:
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'diagnose', config: RATE_LIMITS.diagnose });
if (!rl.ok) return /* 429 response */;

// Input guards:
if (body.history?.length > 20) return NextResponse.json({ error: 'History too long' }, { status: 400 });
if (body.attachments?.length > 3) return NextResponse.json({ error: 'Too many attachments' }, { status: 400 });
if (typeof body.textQuery === 'string' && body.textQuery.length > 2000) {
    return NextResponse.json({ error: 'Text query too long' }, { status: 400 });
}
```

---

### 🔴 `/api/providers` — CRITICAL, no protection

**Risk:** Each request can trigger up to 3 Google Places Text Search pages plus per-provider Google Detail calls for reviews. A single request can generate 20+ downstream Google API calls. At scale this directly affects billing.

**Current state:** No rate limit. No authentication. Default radius is 50km — callers can request the maximum radius without restriction.

**Additional issues:**
- `radius` is passed directly with no maximum enforcement. A caller can set `radius: 999999999`.
- `pageToken` + `searchQuery` pagination can be automated to sweep through all providers in a region.

**What to add:**
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'providers', config: RATE_LIMITS.providers });
if (!rl.ok) return /* 429 */;

// Cap radius to 50km (50,000 metres)
const radius = Math.min(Number(body.radius) || 50_000, 50_000);
```

---

### 🔴 `/api/whatsapp-message` — HIGH, no protection

**Risk:** Gemini API call. Lighter than diagnosis but still billable per request.

**Current state:** No rate limit. No authentication. All fields are optional — an empty POST body still triggers a Gemini call via the fallback builder.

**What to add:**
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'whatsappMessage', config: RATE_LIMITS.whatsappMessage });
if (!rl.ok) return /* 429 */;
```

---

### 🔴 `/api/enrich/queue` — HIGH, no protection

**Risk:** Triggers the full enrichment pipeline per provider: website scrape + batch image classification (Gemini) + combined enrichment call (Gemini). Accepts up to 30 place IDs per call. A single request can generate 60+ Gemini calls.

**Current state:** No rate limit. Internal semaphore (max 10 concurrent jobs) limits concurrency but not request frequency. The 30-second per-job timeout means a caller can submit repeated requests and keep the enrichment workers saturated.

**What to add:**
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'enrichQueue', config: RATE_LIMITS.enrichQueue });
if (!rl.ok) return /* 429 */;
```

---

### 🟡 `/api/geocode` — MEDIUM, no protection

**Risk:** Google Geocoding API. No caching on this route — every request hits Google. Less expensive than Places but still billable.

**Current state:** No rate limit. No authentication.

**What to add:**
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'geocode', config: RATE_LIMITS.geocode });
if (!rl.ok) return /* 429 */;
```

**Additional improvement:** Add the same 7-day Supabase caching that `directions` uses. Geocoding the same address repeatedly is the common case (a user opening the app multiple times from the same home).

---

### 🟡 `/api/directions` — MEDIUM, no protection

**Risk:** Google Directions API. Has a 7-day Supabase cache so most requests are free. But a unique origin/destination pair always hits Google.

**Current state:** No rate limit. No authentication.

**What to add:**
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'directions', config: RATE_LIMITS.directions });
if (!rl.ok) return /* 429 */;
```

---

### 🟡 `/api/upload-image` and `/api/welcome-upload-image` — MEDIUM, no protection

**Risk:** Unrestricted file uploads to Supabase storage. No file size limit, no MIME type validation, no upload frequency limit.

**Current state:** No rate limit. File name is sanitised but file content is not validated.

**Issues:**
1. **No file size limit.** A caller can upload a 500MB file. Supabase storage charges for bandwidth.
2. **No MIME type validation.** The route checks `file.type` from the `FormData` object, but `Content-Type` in a multipart upload is caller-controlled. A malicious caller can set `Content-Type: image/jpeg` on a PDF or executable.
3. **No upload frequency limit.** A caller can automate repeated uploads with new `conversationId` values (which are not validated as real conversation IDs from the database).

**What to add:**
```ts
// Rate limit
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'uploadImage', config: RATE_LIMITS.uploadImage });
if (!rl.ok) return /* 429 */;

// File size cap — 10MB maximum
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const bytes = await file.arrayBuffer();
if (bytes.byteLength > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large. Maximum 10 MB.' }, { status: 413 });
}

// MIME type validation via magic bytes — do not trust Content-Type header
const uint8 = new Uint8Array(bytes);
const isJpeg = uint8[0] === 0xFF && uint8[1] === 0xD8 && uint8[2] === 0xFF;
const isPng  = uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47;
const isWebp = String.fromCharCode(...uint8.slice(8, 12)) === 'WEBP';
const isHeic = String.fromCharCode(...uint8.slice(4, 8)) === 'ftyp';

if (!isJpeg && !isPng && !isWebp && !isHeic) {
    return NextResponse.json({ error: 'Unsupported file type. Please upload a JPEG, PNG, or WebP image.' }, { status: 415 });
}
```

---

### 🟡 `/api/reviews` — MEDIUM, no protection

**Risk:** Review spam. Even though reviews require approval before publication, each submission is a Supabase insert. A scripted caller can flood the moderation queue.

**Current state:** No rate limit. UUID validation exists for `providerId`. No limit on review body length.

**Additional issues:**
- `reviewerName` has no maximum length.
- `reviewBody` has no maximum length — a caller can submit a 100,000-character review body.
- No check that `providerId` actually exists before inserting (the insert will fail if the FK is violated, but the error path is not clean).

**What to add:**
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'reviews', config: RATE_LIMITS.reviews });
if (!rl.ok) return /* 429 */;

// Length caps
if (body.reviewerName.length > 100) return NextResponse.json({ error: 'Name too long' }, { status: 400 });
if (body.reviewBody.length > 5000) return NextResponse.json({ error: 'Review too long' }, { status: 400 });
if (body.reviewTitle && body.reviewTitle.length > 200) return NextResponse.json({ error: 'Title too long' }, { status: 400 });
```

---

### 🟢 `/api/enrich/get` — LOW risk

**Risk:** Pure Supabase read. No external API calls, no cost-generating operations.

**Current state:** No rate limit, but the blast radius is minimal.

**What to add:** Still worth rate-limiting to prevent database saturation.
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'enrichGet', config: RATE_LIMITS.enrichGet });
if (!rl.ok) return /* 429 */;
```

---

### 🟢 `/api/reviews-count` — LOW risk

**Risk:** Two Supabase count queries per request. Low cost.

**What to add:**
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'reviewsCount', config: RATE_LIMITS.reviewsCount });
if (!rl.ok) return /* 429 */;
```

---

### 🟢 `/api/providers/restore-token` — LOW risk, partial protection exists

**Risk:** Supabase writes only. The 45-second deduplication window already prevents the worst abuse (repeated token restores for the same provider/channel/week).

**Current state:** Good deduplication logic already in place. No outer rate limit.

**What to add:** An outer rate limit catches coordinated abuse across multiple providers:
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'restoreToken', config: RATE_LIMITS.restoreToken });
if (!rl.ok) return /* 429 */;
```

---

### 🟡 `/api/providers/[id]/sync-google-gallery` — MEDIUM, no protection

**Risk:** Calls Google Places API and downloads images. No guard against repeated calls for the same provider.

**Current state:** Internal guard: only syncs if no Google-sourced images exist. But the check happens after the Places API call in some paths.

**What to add:**
```ts
const rl = applyRateLimit({ ip: getCallerIp(req), bucket: 'syncGallery', config: RATE_LIMITS.syncGallery });
if (!rl.ok) return /* 429 */;
```

---

## Additional Security Issues

### SSRF via image URL in `/api/diagnose`

The diagnose route fetches images by URL when `image` is a Supabase storage URL rather than a base64 data URI. There is no validation that the URL is a Supabase URL — any URL can be passed.

A caller can submit `image: "http://169.254.169.254/latest/meta-data/"` (AWS metadata endpoint) or `image: "http://internal-service.local/admin"` to probe internal infrastructure.

**Fix:**
```ts
// Before fetching the image URL:
const ALLOWED_IMAGE_ORIGINS = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    'https://storage.googleapis.com',
].filter(Boolean);

function isAllowedImageUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ALLOWED_IMAGE_ORIGINS.some(
            (origin) => origin && parsed.origin === new URL(origin).origin
        );
    } catch {
        return false;
    }
}

if (typeof body.image === 'string' && body.image.startsWith('http')) {
    if (!isAllowedImageUrl(body.image)) {
        return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
    }
}
```

---

### No security headers on API responses

Next.js does not add security headers by default. Currently no route sets `X-Content-Type-Options`, `X-Frame-Options`, or `Content-Security-Policy`. These matter most for pages but are good practice on API responses too.

Add to `next.config.ts`:

```ts
const securityHeaders = [
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const nextConfig = {
    async headers() {
        return [{ source: '/(.*)', headers: securityHeaders }];
    },
};
```

---

### Geocoding route has no caching

Unlike `directions`, the geocode route makes a fresh Google API call on every request with no caching layer. Repeated reverse geocoding from the same coordinates (a user reopening the match page) hits Google every time.

Add the same Supabase cache pattern used by directions: round coordinates to 3 decimal places, build a cache key, check before calling Google, write back after.

---

### `conversationId` in upload routes is not validated against the database

Both upload routes accept a `conversationId` string and use it to construct a storage path without checking that it corresponds to a real conversation row. This means files can be uploaded into arbitrary path prefixes (`welcome_scans/{any-string}/...`) in Supabase storage.

**Fix:** Validate the conversation exists before uploading:
```ts
const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .maybeSingle();

if (convErr || !conv) {
    return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
}
```

---

## Summary Table

| Route | Method | Risk | Rate Limit | Status |
|---|---|---|---|---|
| `/api/diagnose` | POST | 🔴 Critical | 10 / 10 min | ✅ Done + SSRF guard + input caps |
| `/api/providers` | POST | 🔴 Critical | 15 / 1 min | ✅ Done + radius cap |
| `/api/whatsapp-message` | POST | 🔴 High | 20 / 10 min | ✅ Done |
| `/api/enrich/queue` | POST | 🔴 High | 5 / 5 min | ✅ Done |
| `/api/upload-image` | POST | 🟡 Medium | 20 / 1 hour | ✅ Done + 10MB cap + magic-byte MIME + UUID conversationId |
| `/api/welcome-upload-image` | POST | 🟡 Medium | 20 / 1 hour | ✅ Done + 10MB cap + magic-byte MIME + UUID conversationId |
| `/api/geocode` | POST | 🟡 Medium | 20 / 1 min | ✅ Done |
| `/api/directions` | GET | 🟡 Medium | 40 / 1 min | ✅ Done |
| `/api/providers/[id]/sync-google-gallery` | POST | 🟡 Medium | 10 / 1 min | ✅ Done |
| `/api/reviews` | POST | 🟡 Medium | 5 / 1 hour | ✅ Done + length caps |
| `/api/enrich/get` | POST | 🟢 Low | 60 / 1 min | ✅ Done |
| `/api/reviews-count` | POST | 🟢 Low | 60 / 1 min | ✅ Done |
| `/api/providers/restore-token` | POST | 🟢 Low | 30 / 1 hour | ✅ Done |

---

## Implementation Checklist

### Immediate (before any public traffic) — ✅ Complete

- [x] Create `src/lib/rate-limit-config.ts` with the `RATE_LIMITS` object, `getCallerIp()`, and `checkRateLimit()` helper
- [x] Apply rate limit to `/api/diagnose` + add history/attachment/textQuery length caps
- [x] Apply rate limit to `/api/providers` + cap `radius` at 50,000 metres
- [x] Apply rate limit to `/api/whatsapp-message`
- [x] Apply rate limit to `/api/enrich/queue`
- [x] Add SSRF origin allowlist to `/api/diagnose` image URL fetch

### This week — ✅ Complete

- [x] Apply rate limits to `geocode`, `directions`, `upload-image`, `welcome-upload-image`, `reviews`, `sync-google-gallery`, `enrich/get`, `reviews-count`, `restore-token`
- [x] Add length caps to `reviews` route (name ≤ 100, body ≤ 5,000, title ≤ 200)
- [x] Add file size cap (10 MB) and magic-byte MIME validation to both upload routes
- [x] Add UUID format validation for `conversationId` in both upload routes
- [x] Add security headers to `next.config.ts` (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`)

### Before public launch

- [ ] Replace in-memory rate limit store with Vercel KV or Upstash Redis (in-memory store does not persist across Vercel serverless invocations)
- [ ] Add `Retry-After` header to all 429 responses — already implemented in `checkRateLimit()`
- [ ] Set up Google API quota alerts on the Google Cloud Console dashboard
- [ ] Set up Gemini API spending alerts in Google AI Studio
- [ ] Add geocoding Supabase cache (same 7-day pattern as `directions`)
- [ ] Add `conversationId` DB existence check to both upload routes (currently validated as UUID format only)
- [ ] Review Supabase Row Level Security policies — all reads/writes currently use the service role key, bypassing RLS
