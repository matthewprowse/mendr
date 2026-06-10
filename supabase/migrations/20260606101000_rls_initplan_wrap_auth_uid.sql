-- Backend Security & Launch Readiness: M14 (auth_rls_initplan).
--
-- Wrap auth.uid()/auth.role()/auth.jwt() in a scalar subquery in every public
-- RLS policy so Postgres evaluates the function once per query (initplan)
-- instead of once per row. (select auth.uid()) is semantically identical to
-- auth.uid(), so this is a pure performance change — no authorization semantics
-- are altered. Idempotent: already-wrapped policies are skipped.

DO $$
DECLARE
    r       record;
    v_using text;
    v_check text;
    v_cmd   text;
    v_sql   text;
BEGIN
    FOR r IN
        SELECT pol.polname AS name,
               c.relname   AS tbl,
               pol.polcmd  AS cmd,
               pg_get_expr(pol.polqual, pol.polrelid)      AS qual,
               pg_get_expr(pol.polwithcheck, pol.polrelid) AS wc,
               CASE WHEN 0 = ANY (pol.polroles) THEN 'public'
                    ELSE (SELECT string_agg(quote_ident(rolname), ', ')
                          FROM pg_roles WHERE oid = ANY (pol.polroles)) END AS roles
        FROM pg_policy pol
        JOIN pg_class c     ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND (
            (pg_get_expr(pol.polqual, pol.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
                AND pg_get_expr(pol.polqual, pol.polrelid) !~ '\(\s*SELECT auth\.')
            OR (pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
                AND pg_get_expr(pol.polwithcheck, pol.polrelid) !~ '\(\s*SELECT auth\.')
          )
    LOOP
        v_using := regexp_replace(r.qual, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
        v_check := regexp_replace(r.wc,   'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
        v_cmd := CASE r.cmd
            WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
            WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' END;

        EXECUTE format('DROP POLICY %I ON public.%I', r.name, r.tbl);

        v_sql := format('CREATE POLICY %I ON public.%I FOR %s TO %s',
                        r.name, r.tbl, v_cmd, r.roles);
        IF v_using IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_using); END IF;
        IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
        EXECUTE v_sql;
    END LOOP;
END $$;
