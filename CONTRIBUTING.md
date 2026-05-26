# Contributing to Menda

## Testing

### Test types and where they live

| Type | Location | When to write |
|---|---|---|
| Unit (pure functions) | `app/src/**/__tests__/<basename>.test.ts` | Any pure function extracted to `lib/` or `features/` |
| Contract (API routes) | `app/src/app/api/**/<route-dir>/route.test.ts` | Every route handler — 400/401/429/200 + edge case |
| Component (DOM) | `app/src/**/__tests__/components/*.test.tsx` or `*.dom.test.tsx` | Any React form or interactive component |
| Integration (Supabase) | `app/src/**/*.integration.test.ts` | RLS policies, auth flows, CRUD round-trips |
| E2E (Playwright) | `app/e2e/*.spec.ts` | Golden paths and multi-step user flows |

### Running tests locally

```bash
# Unit + contract + component tests (fast, no external services)
cd app
pnpm test

# With coverage report
pnpm run test:coverage

# Integration tests (requires local Supabase — see below)
pnpm run test:integration

# E2E tests (requires a built Next.js app and .env.test)
pnpm run test:e2e
```

### Running integration tests locally

Integration tests talk to a local Supabase stack. You need the Supabase CLI installed (`brew install supabase/tap/supabase`).

```bash
# Start the local stack (first time or after stopping)
cd app
supabase start

# Seed the test database
psql $LOCAL_SUPABASE_DB_URL < supabase/seed.test.sql

# Run integration tests
pnpm run test:integration

# Stop when done
supabase stop
```

Required environment variables for integration tests (set in `.env.test.local`):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>
```

### Running E2E tests locally

E2E tests use Playwright and require a running Next.js app against a test Supabase instance.

```bash
# Copy the example env file and fill in test credentials
cp app/.env.test.example app/.env.test

# Install Playwright browsers (first time only)
cd app && pnpm exec playwright install --with-deps chromium

# Build and start the app, then run E2E
pnpm run test:e2e
```

Set `MOCK_LLM=1` in `.env.test` to use pinned LLM fixtures instead of calling Gemini.

### Test helpers

Located in `app/src/__tests__/helpers/`:

| Helper | Purpose |
|---|---|
| `route-test.ts` | `makeRequest()`, `mockSupabaseClient()`, `mockResendClient()`, `mockGeminiClient()` |
| `setup-dom.ts` | MSW server setup + `@testing-library/jest-dom` matchers for component tests |

### LLM fixture tests

Parser tests for the Gemini classify and prose agents pin against captured model outputs stored in:

- `app/src/features/diagnosis/__tests__/fixtures/classify/*.json`
- `app/src/features/diagnosis/__tests__/fixtures/prose/*.json`

Each fixture has the shape `{ name, raw, expected }` — `raw` is the exact model response string, `expected` is what the parser should extract.

**Do not manually edit fixtures.** Refresh them with the fixture-refresh workflow (see below).

### Refreshing LLM fixtures

When the Gemini model drifts or prompts change, the fixtures may need updating. Run the refresh workflow from the GitHub Actions tab (`refresh-llm-fixtures` workflow) — it re-runs the pinned scenarios against the live model and opens a PR with the diff for human review.

For local refresh (requires `GEMINI_API_KEY`):

```bash
cd app
GEMINI_API_KEY=... pnpm scripts:refresh-llm-fixtures
```

Before merging a fixture refresh PR:
1. Inspect every changed fixture — the `expected` block must still represent a correct diagnosis.
2. Re-run `pnpm test src/features/diagnosis/__tests__/` locally against the new fixtures.
3. Confirm `pnpm test` and `pnpm run test:coverage` stay green.

### Coverage thresholds

Coverage thresholds are set in `app/vitest.config.ts` and are enforced in CI. The current thresholds are:

| Metric | Threshold |
|---|---|
| Lines | 19% |
| Branches | 65% |
| Functions | 47% |
| Statements | 19% |

Thresholds are ratcheted after each phase — never lowered. When you add new tests that meaningfully improve coverage, update the comment in `vitest.config.ts` and raise the threshold to `floor(new actual) - 1`.

### Branch protection (enable in GitHub settings)

To enforce CI gates before merge, set the following branch protection rules for `main`:

- Require status checks to pass: `test / test`, `test / lint`
- Require branches to be up to date before merging
- Do not allow bypassing the above settings

These must be enabled manually by a repository admin in GitHub Settings > Branches.

### Commit conventions

- `feat(scope): ...` — new user-facing feature
- `fix(scope): ...` — bug fix
- `test(phase-N): ...` — testing infrastructure phase
- `chore(scope): ...` — tooling, deps, docs with no user impact
- `refactor(scope): ...` — code reorganisation with no behaviour change

All commits must pass `pnpm lint` and `pnpm test` before merge.
