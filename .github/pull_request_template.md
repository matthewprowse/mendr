## Summary
<!-- What does this PR do and why? -->

## Checklist
- [ ] `pnpm typecheck` passes (0 errors)
- [ ] `pnpm lint` passes (0 errors)
- [ ] `pnpm test` passes (all suites green)
- [ ] `pnpm build` succeeds
- [ ] No new `any` types introduced
- [ ] No new `console.*` calls in production code (use `logger.*`)
- [ ] Tests added for any new business logic
- [ ] DB migrations included if schema changed
- [ ] Any migration touching RLS, triggers, constraints, or sequences ships a `.db.test.ts` in this PR (audit Phase E3)
- [ ] Test naming taxonomy honoured: `.test.ts(x)` unit/contract · `.dom.test.tsx` jsdom · `.db.test.ts` PGlite · `.branch.test.ts` real Postgres · `e2e/*.spec.ts` Playwright
