# Frontend design audit (non-admin surfaces)

**Scope:** All user-facing routes except `/admin/**`.  
**Stack observed:** Next.js App Router, Tailwind CSS v4 (`@import 'tailwindcss'`), shadcn/ui (Menda tokens on primitives), Framer Motion (marketing), Phosphor + Lucide icons, Söhne + Signifier (marketing-only serif policy — see §12.3), Supabase client flows.

This document captures inconsistencies, risks, and concrete directions to make the product more **cohesive**, **brandable**, and **responsive** to both viewport size and brand evolution.

---

## 1. Executive summary

The codebase already contains strong ingredients: a deliberate **Menda** palette in `globals.css`, typed **design tokens** in `lib/design-tokens.ts`, and polished **match** card UI with clear interaction notes. At the same time, **brand, typography, and chrome patterns diverge** between marketing, auth/legal shells, and the diagnosis/match flows. There are **parallel landing implementations** (`/` vs `/landing1` vs legacy `landing/`), **hard-coded legacy naming** (“Scandio”) across headers and copy, and **placeholder blocks** where hero and bento imagery should live.

**Highest leverage fixes:** (1) single source of truth for brand strings and accent color, (2) one marketing home + redirect strategy, (3) unify flow chrome (`FlowStepHeader` vs `FlowTopBar`), (4) replace empty placeholders with photography or UI chrome, (5) systematic responsive and accessibility pass on long client surfaces (diagnosis, match, chat).

---

## 2. Brand and narrative coherence

### 2.1 Menda vs Scandio split

- `lib/brand-system.ts` defines `BRAND_NAME = 'Menda'` and documents migration surfaces; root layout metadata template still uses that name.
- The live marketing home (`app/page/components/*`) and `LandingHeader` still render **“Scandio”** in the logo wordmark, CTAs (“Generate Free Scandio Report”), section titles (“Why Homeowners Use Scandio”), JSON-LD on `page.tsx`, Open Graph assets (`og-scandio.jpg`), and many flow strings (diagnosis, report share, map labels).

**Issue:** Users see **Menda colors and fonts** with **Scandio language and assets**, which reads as an unfinished rebrand and weakens trust.

**Recommendations:**

- Drive all visible strings from `BRAND_NAME` / `BRAND_LEGACY_NAME` with a single “public name” switch until SEO migration is ready.
- Plan **OG image, manifest, footer, header, and JSON-LD** updates in one coordinated release (see `mendaMigrationSurfaces` in `brand-system.ts`).
- `/landing1` already uses **Menda** in metadata and body copy in places—treat it as the reference voice for homeowner marketing, then align `/` or retire duplicate routes (Section 4).

### 2.2 Accent colour inconsistency

- Global primary token is **lime** (`#DCF763`, Menda primary).
- `FlowStepHeader` hard-codes **`#E8601A`** for progress dots and uses **`#16120E`** for ink, which differs from `design-tokens` / CSS variables.

**Issue:** The scan flow feels like a **different product** from the lime-forward marketing site.

**Recommendations:**

- Either adopt orange as a **secondary accent** documented in tokens, or align progress/active states with **primary** / **ring** from `globals.css`.
- Replace inline hex in `flow-header.tsx` with CSS variables or `mendaTokens` so dark mode (if added later) and theme tweaks stay sane.

### 2.3 Design preview route (`/design`)

- The page now uses the same **global fonts** as the rest of the app (no separate Circular stack).
- **Recommendation:** Treat `/design` as the **component kitchen sink** only: add a short banner that these are primitives for QA, not a separate visual language.

---

## 3. Information architecture and routes

### 3.1 Chat index behaviour

- `/chat` resolves `?id=` to `/diagnosis/:id` or redirects to `/`.

**Observation:** Fine for backwards compatibility; ensure any **“Continue in chat”** marketing links match the actual primary surface (`/diagnosis/...` vs legacy chat UI) so users do not perceive a dead end.

### 3.2 Multiple entry points to similar journeys

- Homeowner path: `/` → `/start` → `/processing/[id]` → `/diagnosis/[id]` → match/report flows.
- Alternate marketing: `/landing1` (large bespoke page).

**Issue:** Two “homes” compete for SEO and analytics; internal links may split traffic.

**Recommendations:**

- Pick **one canonical homeowner URL**; use the other as a **preview** (`noindex`) or merge sections into `/`.
- Add a short **routing map** in internal docs (you already have build plans under `public/application-review/`) so every CTA targets the same funnel.

### 3.3 Contractor surfaces

- `/contractors` (marketing + FAQ + pricing) and `/contractors/network`, `/contractors/[id]`, application edit flows coexist.

**Recommendation:** Visually unify **pro** navigation (header links, footer, terminology “Providers” vs “Contractors”) with homeowner headers for a single **dual-audience** system (see Section 5).

---

## 4. Marketing and static pages

### 4.1 Home (`/`)

**Strengths:** Clear value prop, Framer Motion hero, bento grid structure, FAQ island, sensible `max-w-7xl` rhythm.

**Gaps:**

- **Hero and bento** use `Placeholder` with **empty labels**—reads unfinished at first impression.
- **Inverted section** (`bg-foreground` / `text-background`) is bold but increases reliance on perfect contrast; verify WCAG for `text-background/80`.
- **CTA section** uses raw `#0D0D0D` instead of a token—harder to theme.

### 4.2 `/landing1`

**Strengths:** Rich sections, trade icons, stats, comparison tables, inline contact form, explicit design rules in file header; metadata already says Menda.

**Gaps:**

- **833-line client component**—maintenance and performance risk (every section re-renders unless split).
- **Hard-coded stats** (“replace with real values before launch”)—must be wired or hidden for credibility.
- Comment says “contact page deleted” but `/contact` still exists—**documentation drift**.

### 4.3 Legal, about, contact

- `contact/client.tsx` still references Scandio in body and copyright.
- About metadata (from grep) is Scandio-centric.

**Recommendation:** Same copy pipeline as home; ensure **footer copyright** uses the canonical brand.

### 4.4 Duplicate folder patterns

- `app/page/components/` and `app/page/_components/` both exist (overlapping names like `landing-page-client.tsx`).

**Issue:** Contributors may edit the **wrong** file; bundles may include dead code.

**Recommendation:** Consolidate or add a one-line README in `page/` explaining which tree is authoritative (not user-facing `frontend.md` scope for implementation—track as engineering cleanup).

---

## 5. Layout chrome and pattern library

Three different “top bars” appear across the product:

| Pattern            | Typical use              | Notes                                      |
|---------------------|--------------------------|--------------------------------------------|
| `LandingHeader`     | Marketing, 404, contact  | Sticky, wordmark text, mobile full-screen |
| `FlowStepHeader`    | Auth, some diagnosis UX | Fixed, orange dots, “Scandio” default      |
| `FlowTopBar` + `FlowFooter` | `/start`, match shell | Sticky, shadcn `Button` back control       |

**Issues:**

- Different **heights, paddings, and back control** styling (rounded grey hit area vs `size-10` secondary button).
- **Safe area** handling differs (`FlowStepHeader` uses `env(safe-area-inset-top)`; verify `FlowTopBar` on notched devices).

**Recommendations:**

- Define **one “App shell” spec**: height, z-index scale, back button, optional progress, optional trailing actions.
- Implement as a **single composable** with variants (`marketing` | `flowSticky` | `flowFixed`) rather than three ad-hoc components.
- Document **z-index** layers (header 110, chat overlays 200, etc.) in tokens to avoid stacking bugs.

---

## 6. Product flows (diagnosis, match, report)

### 6.1 Diagnosis (`diagnosis/client.tsx`)

- Large client surface with many user-facing strings (many include “Scandio”).
- Strong functional UX; visually tied to `FlowStepHeader` / inline layouts.

**Recommendations:**

- **Progressive disclosure:** long forms benefit from stepped sections or sticky sub-navigation on desktop.
- **Empty and error states:** align tone with `mendaCopyGuidelines` (warm, neighbourly, no hype).
- **Loading skeletons** that match final layout reduce layout shift (match already has loading patterns).

### 6.2 Match (`match/components/*`)

- `ProviderCard` is a highlight: carousel, chips, skeletons, clear CTA separation.
- `match/loading.tsx` is a centred spinner—acceptable but could mirror **map + list** skeleton for perceived performance.

**Recommendations:**

- Ensure **list + map** split layouts have predictable breakpoints (collapsing filters into sheets is already present—verify thumb reach and sheet height on small phones).
- **Verified** copy (“verified on Scandio”) should follow brand migration.

### 6.3 Report share (`report/[id]/components/*`)

- Share title/text still say Scandio.

**Recommendation:** Parameterised share strings from brand module; preview card graphics when OG images are updated.

### 6.4 Processing and open-on-phone

- Confirm **visual continuity** from `/start` through processing (spinner, messaging) so the handoff does not feel like a different site (colour + header alignment).

---

## 7. Auth

- `auth/client.tsx` uses `FlowStepHeader`; copy references Scandio.
- Google button and form layout are clean; magic-link state is clear.

**Recommendations:**

- **Social proof** optional line under headline (“Western Cape homeowners”) for trust without clutter.
- Ensure **focus order** and **aria-live** for magic-link confirmation (screen reader announcement).

---

## 8. Contractors directory and profiles

- Directory and profile pages mix **Phosphor** and **Lucide** on `/contractors` marketing.
- Heavy **placeholder** usage for “mockup” labels—similar credibility gap as homeowner home.

**Recommendations:**

- **One icon library** per surface (or document mixed usage rules).
- Replace placeholders with **screenshots** of the actual product UI or abstract illustrations in brand colours.
- **Pricing table:** ensure mobile horizontal scroll or stacked cards with clear comparison.

---

## 9. Responsiveness and layout

> **See also:** Section **12.4** for a consolidated breakpoint and streamlining strategy (spacing, type, and shadcn tie in there too).

**Generally good:** Widespread `sm:`, `md:`, `lg:` usage; `max-w-*` containers; mobile menu with `100dvh` and safe-area padding on CTA in `LandingHeader`.

**Watch areas:**

- **Typography scale:** some pages use explicit marketing sizes (`landing1` px-based rules) while others use Tailwind scale—harmonise for a consistent **type ramp** across breakpoints.
- **Tables and comparison grids** on `/landing1` and contractors pricing—test **320px** width and zoomed text (200%).
- **Touch targets:** `FlowStepHeader` uses `h-11 w-11` (44px)—good; audit smaller chips and map controls.
- **Long FAQ copy** on contractors page: consider **accordions** (as on `/landing1`) to reduce scroll fatigue on mobile.

---

## 10. Accessibility

- Marketing mobile nav uses `role="dialog"` and `aria-modal`—good direction; ensure **focus trap** and **return focus** to menu button on close (verify in browser).
- **Colour:** lime on white for primary buttons is on-brand; verify **non-text contrast** for borders and ghost buttons.
- **Motion:** Framer Motion on hero—respect `prefers-reduced-motion` (reduce or disable parallax / large translations).
- **Heading hierarchy:** audit each route for single `h1` and logical order (long client pages often regress).

---

## 11. Imagery, illustration, and empty states

- `Placeholder` is used extensively without labels—reads as **missing content**, not intentional minimalism.

**Recommendations:**

- **Hero:** product screenshot, device frame, or short loop video (with poster and reduced-motion fallback).
- **Bento:** use real UI crops, before/after, or iconography in **Menda** lime/ink palette—not grey boxes.
- Establish an **image ratio system** (e.g. 16:9 for cards, 9:16 for phone) aligned with `aspect-*` utilities already in use.

---

## 12. Spacing, shadcn primitives, typography, and responsiveness

This section answers: **Is a 2 / 4 / 8 / 16 / 24 / 36 px-style scale “normal”?** **How should shadcn be themed?** **How do we streamline type and breakpoints?**

### 12.1 Spacing — what the industry does (and how your scale fits)

**Common practice**

- Most product teams use a **modular scale** rooted in **4 px** (sometimes **8 px** for marketing layouts). That is the de facto “industry default” behind Material’s **4 dp** grid, many design tokens in Figma, and **Tailwind’s default spacing** (each unit is `0.25rem`; at a 16 px root, `1` = 4 px, `2` = 8 px, `4` = 16 px, `6` = 24 px, `9` = 36 px).
- **2 px** is not on the pure 4 px ladder, but it is universally used for **hairlines**: borders, dividers, 1 px strokes on retina (`0.5` in Tailwind = 2 px at 1×). So **2 px is normal** as the smallest *layout* step only when you need a tight gap or optical correction—not as the primary rhythm for section padding.

**Your list: 2, 4, 8, 16, 24, 36**

| Value | Role | Tailwind default token (16 px root) |
|------:|------|--------------------------------------|
| 2 px | Hairline gap, dense UI tweaks | `0.5` (= 0.125 rem → 2 px) |
| 4 px | Base tick, icon/text tight gap | `1` |
| 8 px | Default tight stack | `2` |
| 16 px | Standard inset, card padding | `4` |
| 24 px | Section breathing room, `gap-6` | `6` |
| 36 px | Larger rhythm (between sections) | `9` |

**Verdict:** Your intuition aligns with a **4 px–based system**. Adding **12 px** (`3`), **32 px** (`8`), **40 px** (`10`), **48 px** (`12`) fills gaps so you are not forced to jump 24 → 36 everywhere.

**Streamlining in this codebase**

1. **Single source of truth** — Define optional CSS variables in `:root` (e.g. `--space-hairline: 2px`, `--space-1: 4px`, …) and/or extend Tailwind v4 `@theme` `--spacing-*` so marketing pages stop inventing arbitrary `px-[17px]`.
2. **Prefer token utilities** — Use `gap-4`, `p-6`, `max-w-*` consistently; reserve raw `px` for one-off optical alignment (icons next to text).
3. **Component contracts** — Document “card padding = 16 or 24”, “section vertical = 14–20 (`py-14 md:py-20` already exists in `mendaTokens.spacing.section`)” so shadcn `Card` and custom cards match.

### 12.2 Styling shadcn so it matches custom components

**Goal:** Stay on **Tailwind + shadcn primitives** for controls; layer **Menda** only through **CSS variables** (`:root` / `@theme`) and shared utility classes—no parallel “custom button system” with different heights, radii, or hex literals.

**Where to change things (recommended order)**

1. **`src/app/globals.css`** — `:root` maps **Menda** to shadcn tokens (`--primary`, `--primary-hover`, `--border`, `--ring`, …). Add new brand stops here first, then consume them in UI.
2. **`src/components/ui/*`** — **Source of truth** for `Button`, `Input`, `Textarea`, `Label`, overlays. Prefer **`bg-primary`**, **`text-foreground`**, **`border-border`**, **`ring-ring`**, **`text-sm`** / **`text-base`** — not raw hex or arbitrary `text-[13px]`.
3. **`components.json`** — `tailwind.css` → `globals.css`, **cssVariables: true** — keep so Radix themes track tokens.
4. **`lib/design-tokens.ts` + `lib/ui.ts`** — Reusable fragments that **compose** with shadcn; same semantic colours as primitives.

**Controls consistency (buttons, inputs, fields)**

| Concern | Target pattern |
|--------|----------------|
| Heights | Default controls on **`h-9`** (`Button` default, `Input`). **`sm` → `h-8`**, **`lg` → `h-10`** consistently. |
| Text size | **Tailwind scale only:** `text-xs`, `text-sm`, `text-base`, … — no arbitrary `text-[13px]` except **documented** cases (e.g. `text-base md:text-sm` on inputs to avoid iOS zoom). |
| Radius | **`rounded-md`** on controls; cards **`rounded-lg`** with `Card`. |
| Focus | **`focus-visible:ring-2 ring-ring`** on inputs and buttons. |
| Primary hover | **`--primary-hover`** in `:root` so lime CTAs stay in sync. |

**Custom surfaces** should **import** `@/components/ui/*` where possible, or mirror the same **token + height + text-sm** building blocks.

**Regenerating shadcn components** — merge carefully; re-apply Menda hooks after CLI runs.

### 12.3 Typography — Tailwind scale only; Signifier marketing-only; no monospace brand

**Product UI** (diagnosis, match, auth, contractor tools, all forms)

- **Font:** Söhne only — **`font-sans`** (default on `body`). Do **not** use `font-serif` / Signifier here until an explicit product decision.
- **Sizes:** **Only** Tailwind steps (`text-xs` … `text-4xl`, `leading-*`). Avoid arbitrary `text-[Npx]` in app UI.
- **Weights:** `font-medium` / `font-semibold` / `font-bold` map to loaded Söhne masters via CSS `font-weight`.
- **Reference ramp:** `mendaTokens.typography.classes` — **Tailwind class strings only** (no parallel rem scale in tokens).

**Marketing-only serif (Signifier)**

- **`font-serif`** / Signifier for **marketing-style pages** (e.g. `/`, `/landing1`). **Decision still TBD** before using in logged-in product.
- On marketing, still use **Tailwind text utilities** for sizes (no px-based type ramp).

**No monospace in the brand system**

- **Do not** use a monospace webfont or Tailwind’s `font-mono` for product UI. Technical strings (IDs, hex swatches, metrics) use **`font-sans`**; add **`tabular-nums`** when column alignment matters. **`--font-mono` is not defined** in `globals.css`; legacy `font-mono` classes have been removed from the repo.

**Remaining cleanup**

- Migrate `landing1` / bespoke marketing **`text-[Npx]`** to the nearest Tailwind step over time.
- **`text-base md:text-sm`** on `Input` / `Textarea` remains the standard iOS-safe field pattern.

### 12.4 Responsiveness — streamline breakpoints and patterns

**Industry baseline**

- **Mobile-first** CSS (what Tailwind encourages): default = small screen, `sm:` `md:` `lg:` add complexity upward.
- Common defaults in Tailwind v4: **`sm` 40 rem (640 px)**, **`md` 48 rem (768 px)**, **`lg` 64 rem (1024 px)**, **`xl` 80 rem (1280 px)**. Teams rarely need more than **sm / md / lg** for layout switches.

**Streamlining steps for Menda**

1. **Freeze a convention** — e.g. “Layout columns flip at `lg:`; navigation drawer rules at `md:`; never use `xl:` unless for max-width containers.” Document it in this file and in `design-tokens.ts` comments.
2. **Containers** — Prefer `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` (already common) as the **only** marketing container recipe; match/map flows use `max-w-sm` for CTAs—document when each applies.
3. **Touch and safe area** — Minimum **44×44 px** hit targets on primary actions; respect `env(safe-area-inset-*)` on fixed footers and full-screen overlays (`LandingHeader` mobile sheet already pads bottom safe area—reuse that pattern).
4. **Tables and bento** — At `sm` or below, switch long comparison tables to **cards** or **horizontal scroll** with a visible scroll hint; avoid only `lg:` breakpoints for critical readability.
5. **Motion** — Respect `prefers-reduced-motion` for Framer-driven marketing blocks.

### 12.5 How this ties to the backlog

Add explicit tasks:

- **Spacing:** Add optional `--space-*` or Tailwind `@theme` spacing aliases for your preferred ladder; remove one-off arbitrary spacing in hot paths.
- **shadcn:** Continue token-sweep in `components/ui` ( **`Button`** now uses semantic primary / border / ring + Tailwind text sizes; **`Input`** / **`Textarea`** already token-led).
- **Type:** Delete duplicate ramps; align `design-tokens` with Tailwind utilities used in production.
- **Responsive:** Write a one-page “breakpoint contract” and refactor outliers (`landing1` px-only rules vs Tailwind).

---

## 13. Iconography

### 13.1 Recommendation for Söhne + Signifier

**Chosen direction: standardize on Lucide** (`components.json` already sets `"iconLibrary": "lucide"`).

- **Söhne (product UI)** is a rationalist neo-grotesk: clean geometry, even stroke rhythm. **Lucide** icons are built on a **24 px grid**, simple strokes, and minimal detail—they read as part of the same “precise UI” world as Söhne without competing for attention.
- **Signifier (marketing only)** is a classical serif: pairing matters less *which* icon library you pick than **staying consistent**. Using **the same Lucide set** on marketing pages keeps icon metaphors and sizing aligned with the app; serif headlines + Lucide UI icons is a common, credible pattern (editorial type + utilitarian icons).
- **Phosphor** is excellent too (weight variants, larger set), but **mixing Lucide + Phosphor** hurts cohesion more than either font does. If you ever prefer Phosphor’s weight options for marketing hero icons, migrate **wholesale** (including shadcn slot components), not page-by-page.

**Practical rules**

- One **default stroke** and **default size** (e.g. `size-4` / `size-5` next to `text-sm`/`text-base`). Avoid random `size-3` next to `text-lg` body.
- Prefer **`stroke-[1.5]`** (or Lucide’s default) consistently so icons don’t look heavier than Söhne’s mid weights.

### 13.2 Current state

- **Phosphor** (`@phosphor-icons/react` and `/dist/ssr`) and **Lucide** both appear in the codebase today.

**Issue:** Mixed families create **inconsistent stroke weight and corner language** next to the same text.

**Recommendation:** **New work → Lucide.** Migrate Phosphor-only surfaces over time, or pick Phosphor **only** if you commit to replacing Lucide everywhere shadcn expects it.

---

## 14. Performance and maintainability

- **Very large client components** (`chat-page-client`, `diagnosis/client`, `landing1/client`) increase bundle size and make refactors risky.

**Recommendations:**

- Split by **route sections** with `dynamic()` where appropriate (already used on `match/page.tsx`).
- Co-locate **server components** for static sections (pattern already used on `HomeMarketingPage`).
- Lazy-load **maps** and heavy widgets below the fold.

---

## 15. SEO and social preview (frontend-adjacent)

- Home JSON-LD and OG still say **Scandio**; `/landing1` title says **Menda**.

**Recommendation:** Align structured data with visible brand to avoid Google showing one name and the site showing another.

---

## 16. Prioritised improvement backlog

### P0 — Credibility and brand

1. Replace or fill **hero/bento placeholders** on `/` and key contractor blocks.  
2. Unify **public brand name** (strings, header wordmark, CTAs, share copy) with a controlled migration from Scandio → Menda.  
3. Align **FlowStepHeader** accent with global **primary** / documented secondary.

### P1 — Cohesion

4. Consolidate **top bar** patterns into one shell component with variants.  
5. Resolve **dual home** strategy (`/` vs `/landing1`) and trim duplicate `page/` trees.  
6. Single **icon** system (or documented hybrid).  
7. **Spacing + shadcn:** token-sweep `components/ui` and hot custom surfaces; optional `@theme` spacing ladder (Section 12).  
8. **Typography:** one UI ramp + one marketing ramp; align `design-tokens` with Tailwind (Section 12.3).  
9. **Responsive:** document sm/md/lg contract and refactor `landing1` px-only rules toward the shared system (Section 12.4).

### P2 — Polish and scale

10. **Reduced motion** and focus/aria polish on modals and sheets.  
11. Break up mega client files; add route-level loading skeletons that mirror layout.  
12. Enforce **semantic colour** usage (`border-border`, `bg-primary`) in remaining bespoke components.

---

## 17. What “much better” looks like

- **Brandable:** One name, one accent story, OG images and headers that match; optional white-label hooks (CSS variables already help).  
- **Responsive:** One type scale, tables that work on narrow screens, safe areas respected everywhere.  
- **Trustworthy:** Real imagery, accurate stats, legal and marketing copy in sync.  
- **Maintainable:** Fewer parallel implementations, tokens instead of magic hex, smaller client islands.

This audit is intentionally opinionated toward a **single coherent Menda experience** while acknowledging documented migration constraints in `brand-system.ts`.
