# Skill: Folder and File Naming Normalisation

## Purpose
Define consistent, concise, British-English naming and folder conventions for a Next.js and React codebase, with a Vercel preference for clarity at route boundaries and co-located feature logic.

Use this skill when folder depth, repetitive names, or mixed conventions make the project harder to scan, onboard, and maintain.

## Outcomes
- Predictable file locations.
- Short, discoverable names.
- Reduced folder sprawl.
- Consistent naming across routes, features, and shared modules.

## Guiding Principles
1. Optimise for fast navigation by new developers.
2. Prefer co-location near route/features before introducing shared layers.
3. Keep names descriptive but short; avoid repeating folder context in filenames.
4. Use British English in docs and prose (`normalisation`, `behaviour`, `optimise`, `prioritise`).
5. Expand structure only when scale or ownership boundaries require it.

## Recommended Next.js Structure (Vercel-like)

### Route-first app layout
- Keep route entry points in `app/` (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`).
- Keep route files thin; move substantial logic into nearby feature modules.
- Avoid leading underscores in folder names. Prefer clear names like `components/`, `hooks/`, `lib/`, `types/`, `constants/`.

### Feature modules
- For a small feature, prefer a compact layout:
  - `page.tsx`
  - `hooks.ts`
  - `ui.tsx`
  - `utils.ts`
  - `types.ts`
  - `constants.ts`
- For larger, independently evolving domains, expand deliberately to:
  - `components/`
  - `hooks/`
  - `lib/`
  - `types/`
  - `constants/`

### Shared code
- Use `src/features/<feature>/` for reusable domain logic across routes.
- Use `src/lib/` for cross-domain utilities and integrations.
- Use `src/components/` for shared UI primitives/design-system pieces.
- Keep `public/` for static assets and non-runtime documentation like team skills.

## File Naming Conventions

### General
- Use lowercase kebab-case for file names (`match-client.tsx`, `review-formatters.ts`).
- Keep names concise; remove redundant prefixes already implied by folder names.
- Prefer noun-based names for components/utilities and verb-based names for actions.

### Components
- Co-located component files: kebab-case (`star-rating.tsx`, `pagination.tsx`, `category-slider.tsx`).
- Exported React symbols: PascalCase (`StarRating`, `ReviewsFooter`).
- Avoid suffix noise unless needed for disambiguation (`Display`, `Component`, `View`, `Tab`, `Footer`, `Row`).
- Prefer short, intent-first names in feature folders:
  - `about.tsx`, `gallery.tsx`, `reviews.tsx` (instead of `pro-about-tab.tsx`, etc).

### Hooks
- Hook files should use the `use-` prefix when they export a React hook (`use-provider.ts`, `use-reviews.ts`).
- In compact layouts, use grouped files (`hooks.ts`) with named exports (`useProvider`, `useReviews`).
- Avoid repetitive names like `use-pro-provider` inside `pro/`; prefer `use-provider` or grouped exports.
- Do not use `use-` for non-hook utility files (`gallery.ts`, `hours.ts`, `format.ts`).

### Utilities, constants, and types
- Utilities: `utils.ts` for compact features, otherwise focused names (`hours.ts`, `gallery.ts`).
- Constants: `constants.ts` or focused files when domains diverge.
- Types: `types.ts` or domain-specific type files when size warrants separation.
- Do not rename non-route files to `page.ts`; reserve `page.tsx` for Next.js route entry files only.
- Prefer `constants.ts` for a route/feature unless there is a strong reason to split further.

### API handlers and scripts
- Next.js handlers: route files remain `route.ts` at route paths.
- Support code near handlers should use short role-based names (`ranking.ts`, `cache.ts`, `persistence.ts`).
- Scripts use kebab-case with clear intent (`test-match-flow.ts`).

## Prefix and Suffix Guidance
- Do not repeat the parent folder context in every filename.
  - In `pro/`, prefer `gallery.ts` over `pro-gallery.ts`.
  - In `reviews/`, prefer `pagination.tsx` over `reviews-pagination-footer.tsx` when context is clear.
  - Prefer `category-slider.tsx` over `category-slider-row.tsx` when the file already sits in the right context.
- Use suffixes only to resolve collisions or improve clarity.
- Keep abbreviations minimal and conventional.

## British English Rules
- Documentation and prose must use British spelling.
- Code identifiers should stay semantically clear and consistent with existing APIs.
- If external API contracts use US spelling, preserve contract keys and adapt only internal prose/comments where safe.

## Migration Workflow for Safe Renames
1. Baseline current naming pain points (length, repetition, depth).
2. Rename in small batches by domain (components, hooks, utilities).
3. Update imports immediately after each batch.
4. Run validation after each batch to catch unresolved references early.
5. Keep behaviour unchanged; this is a naming/structure normalisation pass, not a feature rewrite.

## Validation Checklist
- `npm run lint`
- Optional `npm run build` for structural confidence on larger rename sets.
- Targeted smoke checks on affected routes/pages.
- Confirm there are no stale references to old filenames.
- Confirm both docs and filenames reflect British English where intended.

## Deliverable Format
Each execution of this skill should include:
1. List of renamed folders/files.
2. Import/reference updates made.
3. Validation results.
4. Residual naming debt for future clean-up.
