# Skill: Large File Modularisation With Behaviour Parity

## Purpose
Refactor oversized files into smaller, focused modules while keeping runtime behaviour unchanged.

This skill is for files that have become hard to maintain (typically 600+ lines, mixed concerns, repeated logic, and multiple side effects). It prioritises readability, safe extraction, and verification.

## When to Use
- A single file handles many domains (UI rendering, data loading, parsing, business rules, API calls).
- New developers struggle to trace flows quickly.
- Small changes risk regressions because logic is tightly coupled.
- You need cleaner ownership boundaries for future features.

## Inputs
- Target file path.
- Existing architecture constraints (feature-first, route-first, API-first, etc).
- Preferred naming style (flat names vs prefixed names).
- Validation constraints (lint/build/test scripts, smoke checks).

## Non-Goals
- Rewriting business logic.
- Silent behaviour changes.
- Premature abstractions that increase indirection.

## Core Principles
1. Behaviour parity first, style second.
2. Extract pure logic before side effects.
3. Keep boundaries obvious: hooks for side effects/state, utils for pure transforms, components for rendering.
4. Keep naming concise in feature folders (avoid redundant prefixes when folder already provides context).
5. Validate after each meaningful extraction phase.

## Refactor Workflow
1. **Map responsibilities**
   - Identify state domains, effects, API calls, data transforms, and UI blocks.
   - Separate pure functions from effectful orchestration.

2. **Extract low-risk modules first**
   - `constants.ts`, `types.ts`, `utils.ts` (or `*_formatters.ts`, `*_parsers.ts`).
   - Move deterministic helpers with no runtime side effects.

3. **Extract stateless UI primitives**
   - Small components that only accept props and render output.
   - No fetches, no storage, no global effects.

4. **Extract feature sections**
   - Split large visual sections into top-level view components (e.g. tabs/sections/cards).
   - Keep data ownership in the parent temporarily.

5. **Extract side-effect hooks**
   - Move one domain at a time:
     - provider/profile loading
     - reviews flow
     - gallery/media flow
     - observers/map/geolocation
   - Preserve sequencing and cancellation guards.

6. **Reduce original file to shell**
   - Page/component should mostly compose hooks + view components.
   - Keep route-level concerns and top-level wiring only.

## Verification and Validation
Run in order after substantive changes:
1. `npm run lint`
2. Targeted refactor checks (project scripts or ad-hoc assertions)
3. Existing regression scripts that protect adjacent systems

Validation checklist:
- API payload/response shapes unchanged unless explicitly updated.
- Derived values and visible text remain consistent.
- Pagination/sorting/filtering logic unchanged.
- Side-effect timing and loading/error states unchanged.
- No missing imports, duplicate state, or stale closures.

## Recommended File Layout Patterns

### Compact (single feature page)
- `page.tsx`
- `hooks.ts` (or `data.ts`)
- `tabs.tsx`
- `ui.tsx`
- `utils.ts`
- `types.ts`
- `constants.ts`

### Expanded (multi-domain feature)
- `hooks/`
- `components/`
- `lib/`
- `types/`
- `constants/`

Choose compact first. Expand only when domains grow independently.

## Naming Guidance
- Avoid repetitive prefixes inside a feature folder.
  - Prefer `useProvider`, `useReviews`, `useGallery` inside `pro/`.
  - Prefer `StarRating` over `StarRatingDisplay` unless disambiguation is needed.
- Keep names short but specific.
- Group related concerns into fewer files when possible to reduce navigation overhead.

## Risk Controls
- Keep identity resolution logic intact (IDs, place IDs, route params).
- Keep moderation/approval flows intact (no optimistic display unless intended).
- Preserve external integration contracts (Supabase schema, API routes, model payloads).
- If an endpoint appears missing, flag before deep extraction.

## Deliverable Format
Each execution of this skill should produce:
1. A concise change summary.
2. File-by-file breakdown of extracted modules.
3. Validation output summary (lint/tests/scripts).
4. Any residual risks and suggested follow-up clean-ups.
