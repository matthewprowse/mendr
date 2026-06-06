## Branch Testing And Database Reproducibility Runbook

This is the path to running the database test suite against a real Supabase branch,
plus the fix for the underlying blocker (the database cannot currently be rebuilt
from the repo migrations).

#### The Two Blockers Found

1. A Supabase branch builds a fresh database by replaying `supabase/migrations`.
   Those migrations reference base tables (providers, profiles, diagnoses, reviews,
   and around thirty others) whose creation migrations were never committed to the
   repo. So a branch fails to build (status MIGRATIONS_FAILED), and so does any
   fresh clone or local stack. The database is not reproducible from source.
2. The connected Supabase MCP can only reach production and does not expose a
   branch database password, so the tests cannot be pointed at a branch from here.

#### Fix Part One, Make The Database Reproducible

Generate a baseline schema migration from production with the Supabase CLI, which
needs the database password (available in the dashboard, Project Settings,
Database, Connection string). This is the correct tool, it dumps the exact schema
including the base tables that are missing from the repo.

```
# from the app directory, with the CLI installed and logged in
supabase link --project-ref muzbjrtlklluitmhkcja
supabase db dump --schema-only -f supabase/migrations/00000000000000_baseline.sql
```

Timestamp it before the earliest existing migration (the all-zero prefix above
sorts first) so the existing migrations replay on top of it. After this, a branch
will build, because the replay is baseline then the existing migrations.

Verify locally without Docker, the PGlite harness already proves the Pro slice of
this replay (`pnpm test:db`); once the baseline lands, the same approach extends to
the whole schema.

#### Fix Part Two, Run The Suite Against A Branch

Once branches build, create one and grab its connection string from the dashboard
(the branch is its own project with its own database password).

```
SUPABASE_DB_URL='postgresql://postgres:[BRANCH_PASSWORD]@db.[BRANCH_REF].supabase.co:5432/postgres' \
  pnpm test:integration
```

`pnpm test:integration` runs `src/__tests__/integration/*.branch.test.ts`. It is
skipped automatically when `SUPABASE_DB_URL` is unset, so it never breaks the
normal run. The harness (`src/__tests__/helpers/pg-db.ts`) applies the same schema
SQL and migrations the PGlite suite uses, then runs RLS isolation, the cross-tenant
WITH CHECK denial, and gap-free invoice numbering against the real server.

#### What I Need From You To Finish This Myself

One credential the MCP will not give me, either of:

- A branch (or a throwaway test project) Postgres connection string, so I can run
  `pnpm test:integration` against it live and confirm green.
- The production database password, so I can run `supabase db dump` to produce the
  baseline migration that makes branches build in the first place.

Paste either and I will complete it end to end. Until then, the equivalent
guarantees are already covered for free by the PGlite suite (`pnpm test:db`, forty
tests against the real production schema, no Docker, no billing).

#### Update, Baseline Generated (no Docker)

The Supabase CLI insists on Docker for `db dump`. We bypassed it: installed the
Postgres 17/18 client (`brew install libpq`) and ran `pg_dump` directly against
the pooler connection. The complete public schema is committed at
`supabase/baseline_schema.sql` (52 tables, 20 functions, 45 RLS policies, 106
indexes, 5 triggers, 2 views). Two psql-isms were cleaned for migration use: the
pg_dump 18 `\restrict` lines were removed and `CREATE SCHEMA public` was guarded
with `IF NOT EXISTS`.

Verified by replaying the whole file in PGlite: it applies 100 percent clean
except one statement, the `extensions.gin_trgm_ops` trigram index, which depends
on the `pg_trgm` extension that is pre-installed on every Supabase project and so
works on a real branch (bare PGlite just lacks it). So the baseline is sound.

Activate it (the squash) on an up-to-date `main` checkout, this is deliberately
not auto-applied because it rewrites migration history and must be coordinated
with the parallel migration work:

```
cd app
mkdir -p supabase/migrations_pre_baseline
git mv supabase/migrations/*.sql supabase/migrations_pre_baseline/
git mv supabase/baseline_schema.sql supabase/migrations/00000000000000_baseline.sql
git commit -m "chore(db): squash migration history into a reproducible baseline"
```

After that, a new branch builds from the baseline alone, and `pnpm test:integration`
(with a branch `SUPABASE_DB_URL`) runs the RLS suite against it. Without the squash,
do not drop the baseline into `supabase/migrations/` alongside the existing files,
a branch would replay both and collide on duplicate policies.

#### Cost Note

The branch I created to diagnose this (`mendr-tests`) was deleted, so nothing is
billing. Re-creating one for testing costs about thirty cents a day while it is
alive, delete it when the run is done.

#### Security Note

The production database password was shared in chat to run the dump. Rotate it
(Dashboard, Database, Reset database password). The committed baseline is schema
only, it contains no data and no secrets.
