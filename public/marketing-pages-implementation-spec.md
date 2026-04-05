# Marketing pages — implementation spec (documentation only)

This document records the full set of changes that **would** apply to the homeowner and provider marketing experiences. **No marketing page source files are modified as part of this documentation-only approach**; this file is the single place where those intended changes live.

**Homeowner marketing (live route `/`, not `/landing`):** [`app/src/app/page.tsx`](../src/app/page.tsx), [`app/src/app/page/_components/home-marketing-page.tsx`](../src/app/page/_components/home-marketing-page.tsx), [`app/src/app/page/_components/home-marketing-server-sections.tsx`](../src/app/page/_components/home-marketing-server-sections.tsx), [`app/src/app/page/_components/home-marketing-hero-client.tsx`](../src/app/page/_components/home-marketing-hero-client.tsx), [`app/src/app/page/_components/home-marketing-how-it-works-client.tsx`](../src/app/page/_components/home-marketing-how-it-works-client.tsx). The route [`app/src/app/landing/page.tsx`](../src/app/landing/page.tsx) only redirects to `/`.

**Provider marketing:** [`app/src/app/pro/join/page.tsx`](../src/app/pro/join/page.tsx), [`app/src/app/pro/join/pro-join-page-client.tsx`](../src/app/pro/join/pro-join-page-client.tsx).

---

## Out of scope (by design)

- No edits to the files above (no removals, no TODO comments in code, no new sections in JSX).
- The full **Future Marketing Roadmap** tables live in the appendix below; creating a separate `future-marketing.md` in `public/` is optional and duplicates that appendix if desired.

---

## PART 1 — Homeowner marketing

### Problem section to remove

Remove the section between the hero and How It Works: the dark block implemented as `HomeMarketingProblemSection` (three paragraphs). Do not replace it. After removal, order: hero → (trades marquee only if present) → How It Works.

**Copy removed (exact):**

1. Most homeowners do not know what is actually wrong.
2. That uncertainty leads to unclear quotes, repeated explanations, and wasted call-outs.
3. Scandio gives you a clearer starting point before the first call.

### SEO TODO comments (paste into code only when implementing)

Add as comments only; do not alter existing copy, headings, or text.

Above the metadata `title` in `generateMetadata` (`page.tsx`):

```tsx
/* TODO SEO: Consider updating page title to include high-volume local keywords — "Home Maintenance Diagnosis Cape Town | Free Scandio Report | Western Cape" */
```

Above the metadata `description` (or near top of metadata export):

```tsx
/* TODO SEO: Add meta description — "Diagnose home maintenance faults in under 60 seconds. Free Scandio Report with root causes, cost estimates and vetted contractor matches. No account needed. Western Cape." (155 chars) */
```

Above the H1 in `HomeMarketingHeroClient`:

```tsx
{/* TODO SEO: H1 currently contains no searchable keywords. Consider wrapping display headline in a non-H1 element and making H1 "Free Home Fault Diagnosis — Western Cape" for search visibility while keeping visual headline dominant */}
```

Above the image `Placeholder` in `HomeMarketingHeroClient`:

```tsx
{/* TODO SEO: Add descriptive alt text to all images — e.g. alt="Homeowner uploading photo of home fault to Scandio diagnosis app on mobile" */}
```

Near the top of the page, before the first section (`home-marketing-page.tsx`, inside `<main>`):

```tsx
{/* TODO SEO: Add JSON-LD SoftwareApplication schema — name: Scandio, applicationCategory: HomeAndGarden, offers: free, areaServed: Western Cape ZA */}
```

Near the bottom before the footer:

```tsx
{/* TODO SEO: Add canonical link tag — <link rel="canonical" href="https://scandio.app/landing"> */}
```

```tsx
{/* TODO SEO: Add OG image meta tag and Twitter card meta tags before launch. OG image should be 1200x630px saved at /public/og-scandio.jpg */}
```

Inside How It Works, near step descriptions:

```tsx
{/* TODO SEO: Step descriptions currently contain no location keywords. Consider naturally including "Cape Town" or "Western Cape" in at least one step to support local search */}
```

Near the features / why homeowners section:

```tsx
{/* TODO SEO: Body copy contains no references to specific trades (plumber, electrician, roofer) or local terms (Cape Town, Western Cape, geyser, burst pipe). Work these in naturally across at least three sections before launch */}
```

In the footer, above existing nav links:

```tsx
{/* TODO SEO: Add links to future trade-specific landing pages e.g. /diagnose/plumbing-cape-town, /diagnose/electrical-cape-town to build topical depth for long-tail search */}
```

```tsx
{/* TODO SEO: Add Google Analytics 4 and Meta Pixel before launch. Without these, Meta retargeting campaigns and conversion tracking are not possible */}
```

```tsx
{/* TODO: Privacy Policy and Terms of Service pages must be real pages before launch, not # links. Required for Google site quality evaluation and POPIA compliance */}
```

**Note:** The live `page.tsx` may already include JSON-LD, canonical, and OG/Twitter; TODOs are reminders for review.

### Top-of-file roadmap block — homeowner (`landing/page.tsx` or `page.tsx` when implementing)

Use `/* ... */` at module top (not `{/* */}` before imports). Content:

```
=============================================================
TODO — HOMEOWNER MARKETING PAGE (/landing)
=============================================================

COPY CHANGES (do not touch until SEO strategy is confirmed)
- Hero subheadline currently hedges with "likely happening" and "clearer understanding" — weaken trust signals. Consider more confident language post-launch once diagnosis accuracy data is available.
- Problem section is currently absent — three-statement dark section ("You called a contractor. They charged R800 just to assess it." etc.) to be added between hero and How It Works.
- How It Works step descriptions reference "the model" (Step 1) — replace with plain human language.
- "Starting-point report" undersells the product — revise to "diagnosis" post-launch.
- Final CTA "Find Out What Is Likely Wrong" — remove "likely" once brand confidence is established.

SECTIONS TO ADD (future sprints)
- Stats bar (60s · R0 · 100+ contractors) between hero and How It Works
- Trades marquee (16 categories) between hero and problem section if not already present
- Cost estimate showcase section demonstrating sample output (e.g. "Burst geyser: R1,200–R2,400")
- Social proof / trust section (diagnosis count, provider network size, credibility statement)
- Blog / content hub section with links to trade-specific articles for long-tail SEO

LINKED PAGES TO BUILD
- /diagnose/plumbing-cape-town
- /diagnose/electrical-cape-town
- /diagnose/roofing-cape-town
- /diagnose/geyser-repair-cape-town
- /blog (long-form SEO content hub)
- /privacy-policy (required before launch)
- /terms-of-service (required before launch)
=============================================================
```

---

## PART 2 — Provider marketing (`/pro/join`)

### Problem section to remove

Remove the dark section between the hero and How It Works (three paragraphs). Do not replace. Hero flows directly into How It Works.

**Copy removed (exact):**

1. Most providers waste time on enquiries with poor context.
2. Scandio improves enquiry quality by moving diagnosis clarity earlier in the workflow.
3. Better homeowner context means better provider efficiency.

### Pricing section (when implementing)

Place **between** Why Providers Join (`#value`) and FAQ (`#faq`). Section `id="pricing"`.

**Heading:** Pricing

**Subheading (exact):**

> Scandio is free to join during our founding phase. Paid tiers are estimated to launch in Q4 2026, once we have consistent lead flow across the Western Cape and can demonstrate clear return on investment for every provider on the network. Joining now locks you in as a founding member at the best available rate. Pricing shown is indicative only and subject to change — all members will be notified well in advance.

**Grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

**Card 1 — Founding Member:** Badge above card `Join Now`. Timing `Now — Beta`. Name `Founding Member`. Price `Free`. Note `No credit card required`. Featured: `bg-foreground text-background`. Features: Full profile listing; Appears in search results; Receive Scandio Reports; Review collection; Work gallery; Priority placement at launch. CTA `Get Started Free` → `#apply`. Below CTA: `Locks in at R249/mo when paid tiers launch`.

**Card 2 — Solo:** Timing `Est. Q4 2026`. Name `Solo`. Price `R249/mo`. Note `For individual contractors`. Features: Standard profile listing; Appears in search results; Receive Scandio Reports; Review collection. No CTA; link `Join as founding member →` → `#apply`.

**Card 3 — Basic Team:** Timing `Est. Q4 2026`. Name `Basic Team`. Price `R649/mo`. Note `For teams of 3 to 5`. Features: Everything in Solo; Up to 5 team member profiles; Priority placement in match results (sub: *First in results for diagnoses matching your trade and area*); Advanced analytics; Direct WhatsApp contact from profile. Link `Join as founding member →` → `#apply`.

**Card 4 — Enterprise:** Timing `Est. Q4 2026`. Name `Enterprise`. Price `R1,249/mo`. Note `For large operations and franchises`. Features: Everything in Basic Team; Unlimited team seats; White label Scandio Reports (sub: *Your logo and colours alongside Scandio on every report you receive*); Highest priority placement; Dedicated account support. Link `Join as founding member →` → `#apply`.

**Trust line (centred, small muted):** All members notified at least 30 days before any pricing changes. No surprises, ever.

**Comparison table:** Rows = features; columns = Founding Member, Solo, Basic Team, Enterprise. Use `CheckCircle2` for included; muted dash for excluded. Sticky header; horizontal scroll on mobile; alternating rows. Category headers span full width: Profile, Leads, Team, Analytics, Communication, Reviews — with rows per the original prompt (Full profile with bio…; Standard profile…; Work photo gallery; White label report branding; Appears in homeowner search results; Receive Scandio diagnosis reports; Priority placement in match results; Lead priority routing; Single user profile; Up to 5 team member profiles; Unlimited team seats; Basic profile view stats; Advanced analytics and lead data; Direct WhatsApp contact from profile; Dedicated account support; Review collection; Verified badge — with per-plan ✓/—/(launch only)/(highest) as specified in the full Cursor prompt).

**`#apply`:** Add `id="apply"` on hero (or apply CTA region) when implementing so pricing CTAs resolve.

### SEO TODO comments — provider

Above metadata export (`pro/join/page.tsx`):

```tsx
/* TODO SEO: Page title is likely still "Scandio: Home Maintenance Assistant" — change to "Join the Scandio Contractor Network — Western Cape | No Commission" */
```

```tsx
/* TODO SEO: Add meta description — "Join Scandio's Western Cape contractor network. Receive pre-diagnosed leads from homeowners with structured fault reports. Free to join. Zero commission ever." (154 chars) */
```

Above H1 in client page:

```tsx
{/* TODO SEO: H1 "Less Time Quoting. More Time Doing The Work." contains no searchable keywords. Consider adding a visually hidden or secondary H1 "Home Services Contractor Network — Western Cape" for search while keeping display headline */}
```

Near FAQ:

```tsx
{/* TODO SEO: FAQ answers are collapsed by default. Google cannot reliably index collapsed accordion content. Consider showing answers expanded on desktop for SEO, accordion on mobile only */}
```

Near footer:

```tsx
{/* TODO SEO: Add JSON-LD Organization schema with service area Western Cape before launch */}
```

```tsx
{/* TODO: Add Google Analytics 4 and Meta Pixel before launch */}
```

```tsx
{/* TODO: Privacy Policy and Terms of Service must be real pages, not # links, before launch */}
```

### Top-of-file roadmap block — provider

```
=============================================================
TODO — PROVIDER MARKETING PAGE (/pro/join)
=============================================================

COPY CHANGES (do not touch until confirmed)
- Hero subheadline uses "inputs", "enquiries", "conversion" — business school register, not contractor language. Simplify post-launch.
- Problem section is currently absent — three-statement format to mirror homeowner page ("You drove 40 minutes for an assessment. They decided not to proceed." etc.)
- How It Works Step 1 "match quality stable" is internal language — humanise.
- "Sustainable Growth" and "Built For Long-Term Quality" feature cards are abstract — replace with specific claims once data is available.
- FAQ answers are collapsed — bad for SEO. Expand on desktop in a future sprint.

SECTIONS TO ADD (future sprints)
- Stats bar (Founding network WC · 0% commission · Pre-diagnosed leads only) between hero and How It Works
- Provider profile preview mockup showing what a completed profile looks like
- Vetting explanation section (what the review process involves, why exclusivity matters)
- What to expect section (three bullet points: pre-diagnosed leads, no commission, equal visibility)
- Testimonials / provider quotes once founding network is live and feedback is available

LINKED PAGES TO BUILD
- /pro/dashboard (provider CRM and lead management)
- /pro/profile/[id] (public provider profile page)
- /privacy-policy (required before launch)
- /terms-of-service (required before launch)
- /contact (public-facing contact form — confirm this exists)
=============================================================
```

---

## Appendix — Future Marketing Roadmap (`future-marketing.md` body)

Intended verbatim content for `app/public/future-marketing.md` when that file is created:

# Scandio — Future Marketing Roadmap

This file tracks all planned additions, improvements, and linked pages for the two Scandio marketing pages. Each item is rated on two dimensions:

- **Urgency** — how soon this needs to happen relative to launch (Critical = before launch, High = within 30 days of launch, Medium = within 90 days, Low = next quarter or later)
- **SEO Impact** — how significantly this affects organic search visibility (Critical, High, Medium, Low)

---

## Homeowner Marketing Page (`/landing`)

### Sections to Add

| Item | Description | Urgency | SEO Impact |
|---|---|---|---|
| JSON-LD schema | SoftwareApplication structured data for rich Google results | Critical | Critical |
| Meta description | 155-char description with Western Cape and fault diagnosis keywords | Critical | Critical |
| OG image + Twitter card | 1200x630px social share image and meta tags | Critical | High |
| Canonical link tag | Prevent duplicate content between / and /landing | Critical | High |
| Stats bar | 60s · R0 · 100+ contractors — between hero and problem section | High | Low |
| Trades marquee | 16 trade categories scrolling strip — signals breadth to Google | High | Medium |
| Cost estimate showcase | Sample diagnosis output showing fault type and cost range | High | Medium |
| Problem section | Three-statement dark section before How It Works | High | Medium |
| Social proof section | Diagnosis count, provider network size, trust statement | Medium | Medium |
| Google Analytics 4 | Required for Meta campaign tracking and conversion optimisation | Critical | Low |
| Meta Pixel | Required for retargeting campaigns planned from Jun 2026 | Critical | Low |
| Blog / content hub | Long-form articles on common WC home faults for long-tail SEO | Medium | Critical |
| WhatsApp contact button | Floating or footer link to business WhatsApp — highest-converting SA channel | High | Low |

### Linked Pages to Build

| Page | Description | Urgency | SEO Impact |
|---|---|---|---|
| `/privacy-policy` | Required for POPIA compliance and Google site quality rating | Critical | High |
| `/terms-of-service` | Required for Google site quality rating and app store listings | Critical | High |
| `/contact` | Public-facing contact form (confirm exists at this route) | Critical | Medium |
| `/diagnose/plumbing-cape-town` | Trade-specific landing page for highest-volume local search term | High | Critical |
| `/diagnose/electrical-cape-town` | Trade-specific landing page | High | Critical |
| `/diagnose/roofing-cape-town` | Trade-specific landing page | High | High |
| `/diagnose/geyser-repair-cape-town` | Highest single-intent search term for WC homeowners | High | Critical |
| `/diagnose/burst-pipe-cape-town` | Emergency intent — high conversion potential | Medium | High |
| `/diagnose/damp-waterproofing-cape-town` | High-volume seasonal search term | Medium | High |
| `/blog` | Content hub root — publish first article before launch | Medium | Critical |
| `/blog/what-to-do-when-geyser-bursts` | Highest-traffic article topic for WC homeowners | Medium | Critical |
| `/blog/how-to-read-a-plumbing-quote` | Positions Scandio as homeowner advocate | Medium | High |
| `/blog/roof-leak-causes-cape-town` | Seasonal relevance, high search volume in winter | Low | High |
| `/sitemap.xml` | Auto-generated XML sitemap — submit to Google Search Console | Critical | Critical |
| `/robots.txt` | Confirm correct configuration before launch | Critical | High |

### Copywriting Changes (do not apply until confirmed)

| Item | Current | Suggested direction | Urgency | SEO Impact |
|---|---|---|---|---|
| H1 tag | "Something Broken At Home? Diagnose It Before Calling Anyone." | Separate display heading from H1 — H1 should contain "Free Home Fault Diagnosis — Western Cape" | High | Critical |
| Hero subheadline | Hedged language with "likely" and "clearer understanding" | More confident framing once accuracy data is available | Low | Low |
| Body copy keyword density | No location terms or trade terms in body copy | Naturally work in Cape Town, Western Cape, plumber, electrician, geyser across three sections | High | Critical |
| Image alt text | Placeholder descriptions not in alt attributes | Descriptive alt text on every image with keywords | Critical | High |
| How It Works Step 1 | References "the model" | Plain human language — "Scandio" not "the model" | Medium | Low |
| Final CTA | "Find Out What Is Likely Wrong" | Remove "likely" — too hedged | Low | Low |

---

## Provider Marketing Page (`/pro/join`)

### Sections to Add

| Item | Description | Urgency | SEO Impact |
|---|---|---|---|
| JSON-LD schema | Organization schema with service area Western Cape | Critical | High |
| Meta description | 154-char description with contractor network and Western Cape keywords | Critical | Critical |
| OG image + Twitter card | 1200x630px social share image for WhatsApp and social sharing | Critical | High |
| Stats bar | Founding network WC · 0% commission · Pre-diagnosed leads — between hero and How It Works | High | Low |
| Provider profile preview | Mockup showing what a completed Scandio provider profile looks like | High | Low |
| Vetting explanation | What the application review involves and why network exclusivity matters | High | Medium |
| What to expect | Three bullet points on pre-diagnosed leads, no commission, equal visibility | High | Medium |
| Testimonials | Provider quotes and outcomes once founding network is established | Medium | Medium |
| WhatsApp contact | Floating or footer WhatsApp link — primary contact channel for tradespeople in SA | High | Low |
| Google Analytics 4 | Required for campaign tracking | Critical | Low |
| Meta Pixel | Required for contractor retargeting ads | Critical | Low |

### Linked Pages to Build

| Page | Description | Urgency | SEO Impact |
|---|---|---|---|
| `/privacy-policy` | Required before accepting personal data via application form | Critical | High |
| `/terms-of-service` | Required before charging providers | Critical | High |
| `/contact` | Public contact form for provider enquiries | Critical | Medium |
| `/pro/dashboard` | Provider CRM — lead management, analytics, profile editing | High | Low |
| `/pro/profile/[id]` | Public provider profile page | High | High |
| `/pro/how-it-works` | Deeper explanation of the diagnostic workflow for providers | Medium | Medium |
| `/blog/how-scandio-works-for-contractors` | SEO article targeting "home services leads Cape Town" | Medium | High |
| `/blog/zero-commission-contractor-network` | Targets providers searching for Kandua alternatives | Medium | High |

### Copywriting Changes (do not apply until confirmed)

| Item | Current | Suggested direction | Urgency | SEO Impact |
|---|---|---|---|---|
| Page title | Likely "Scandio: Home Maintenance Assistant" | "Join the Scandio Contractor Network — Western Cape — No Commission" | Critical | Critical |
| H1 tag | "Less Time Quoting. More Time Doing The Work." | Separate display heading from H1 — H1 should contain searchable contractor keywords | High | Critical |
| Hero subheadline | "Better inputs produce better enquiries and better conversion" | Plain contractor language — remove business school register | Medium | Low |
| Problem section | Three-statement dark section currently absent | Add matching homeowner page format once approved | High | Medium |
| FAQ format | Answers collapsed by default | Expand on desktop for Google indexability, accordion on mobile only | High | High |
| "Sustainable Growth" card | Abstract claim | Replace with specific data point once available | Low | Low |
| "Built For Long-Term Quality" card | Abstract claim | Replace with specific provider outcome or remove | Low | Low |

---

## Shared — Both Pages

| Item | Description | Urgency | SEO Impact |
|---|---|---|---|
| Google Search Console | Submit both pages and sitemap before launch | Critical | Critical |
| Core Web Vitals | PageSpeed Insights score above 85 on mobile before launch | Critical | High |
| robots.txt | Confirm /admin is blocked from indexing | Critical | High |
| Hreflang | Not required yet — flag when Afrikaans or Zulu content is planned | Low | Medium |
| Internal linking strategy | Each marketing page should link to at least 3 other internal pages | High | High |
| 404 page | Custom branded 404 with link back to /landing and /welcome | Medium | Medium |
| Breadcrumb schema | Add to trade-specific pages once built | Medium | Medium |

---

## Files that would change when implementing (reference only)

| File | Intended change |
|------|-----------------|
| `app/src/app/page.tsx` | Metadata TODO comments |
| `app/src/app/page/_components/home-marketing-page.tsx` | Remove problem section; layout TODOs |
| `app/src/app/page/_components/home-marketing-server-sections.tsx` | Remove `HomeMarketingProblemSection`; value/footer TODOs |
| `app/src/app/page/_components/home-marketing-hero-client.tsx` | Hero TODOs |
| `app/src/app/page/_components/home-marketing-how-it-works-client.tsx` | Step TODO |
| `app/src/app/landing/page.tsx` | Optional roadmap block (redirect file) |
| `app/src/app/pro/join/page.tsx` | Roadmap block; metadata TODOs |
| `app/src/app/pro/join/pro-join-page-client.tsx` | Remove problem section; `id="apply"`; pricing + table; TODOs |
| `app/public/future-marketing.md` | New file with roadmap markdown |

**Current policy:** none of the above are applied automatically; this spec is documentation.
