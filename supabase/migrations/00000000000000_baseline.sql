--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'sent',
    'paid',
    'void'
);


--
-- Name: job_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.job_status AS ENUM (
    'lead',
    'quoted',
    'active',
    'completed',
    'cancelled'
);


--
-- Name: log_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.log_category AS ENUM (
    'AUTH',
    'DIAGNOSTIC',
    'TRANSACTIONAL',
    'SYSTEM',
    'MARKETING'
);


--
-- Name: plan_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.plan_tier AS ENUM (
    'solo_starter',
    'team_lite',
    'pro_team',
    'enterprise'
);


--
-- Name: quote_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quote_status AS ENUM (
    'draft',
    'sent',
    'accepted',
    'declined'
);


--
-- Name: verification_document_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.verification_document_status AS ENUM (
    'pending',
    'verified',
    'rejected'
);


--
-- Name: verification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.verification_status AS ENUM (
    'unverified',
    'verified',
    'gold'
);


--
-- Name: audit_logs_deny_update_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_logs_deny_update_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only; updates and deletes are not allowed';
END;
$$;


--
-- Name: canonical_primary_trade(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.canonical_primary_trade(diag jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
    SELECT t.label
    FROM (VALUES
        ('Electrical'),('Plumbing'),('Security'),('Building & Construction'),
        ('Carpentry & Woodwork'),('Flooring & Tiling'),('Garden & Landscaping'),
        ('General Handyman'),('Locksmith Services'),('Painting'),('Pool Maintenance'),
        ('Rubble & Waste Removal'),('Welding'),('Appliance Repair'),('Air Conditioning'),
        ('Glazing, Glass & Aluminium'),('Borehole, Water & Pumps'),('Pest Control'),
        ('Waterproofing'),('Solar & Backup Power'),('Roofing'),('Paving & Driveways'),
        ('Gas Installation & Repair')
    ) AS t(label)
    WHERE lower(t.label) = lower(NULLIF(trim(diag ->> 'trade'), ''))
    LIMIT 1;
$$;


--
-- Name: conversation_visible_to_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conversation_visible_to_user(c_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = c_id
    AND (
      c.user_id = auth.uid()
      OR (auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.conversation_id = c.id AND j.provider_id = auth.uid()
      ))
      OR (c.user_id IS NULL AND auth.uid() IS NULL)
    )
  );
$$;


--
-- Name: diagnoses_archive_before_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.diagnoses_archive_before_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.diagnosis_history (diagnosis_id, snapshot, changed_at)
    VALUES (
        OLD.id,
        jsonb_build_object(
            'title', OLD.title,
            'image_url', OLD.image_url,
            'diagnosis', OLD.diagnosis,
            'customer_lat', OLD.customer_lat,
            'customer_lng', OLD.customer_lng,
            'customer_address', OLD.customer_address,
            'user_id', OLD.user_id,
            'updated_at', OLD.updated_at
        ),
        now()
    );
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: diagnoses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnoses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text DEFAULT 'New Diagnosis'::text,
    image_url text,
    customer_lat double precision,
    customer_lng double precision,
    customer_address text,
    device text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    diagnosis jsonb,
    providers jsonb,
    user_id uuid,
    diagnosis_confirmed boolean DEFAULT false,
    initial_image_description text,
    pinned boolean DEFAULT false,
    trade_detail text,
    urgency_key text,
    requires_clarification boolean GENERATED ALWAYS AS (((diagnosis ->> 'requires_clarification'::text))::boolean) STORED,
    clarification_question_count integer GENERATED ALWAYS AS (jsonb_array_length(COALESCE((diagnosis -> 'clarification_questions'::text), '[]'::jsonb))) STORED,
    is_direct_match boolean DEFAULT false NOT NULL,
    image_urls jsonb,
    image_refinement_log jsonb DEFAULT '[]'::jsonb NOT NULL,
    clarification_round integer DEFAULT 0 NOT NULL,
    hypothesis_state jsonb,
    diagnosis_critique jsonb,
    primary_trade text,
    refinement_count integer DEFAULT 0 NOT NULL,
    anon_key text
);

ALTER TABLE ONLY public.diagnoses FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN diagnoses.trade_detail; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diagnoses.trade_detail IS 'Optional mirror of diagnosis JSON trade_detail for reporting.';


--
-- Name: COLUMN diagnoses.requires_clarification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diagnoses.requires_clarification IS 'Derived from diagnosis JSONB. True when the AI returned requires_clarification=true (confidence < 85 or ambiguous image). Used for analytics and filtering.';


--
-- Name: COLUMN diagnoses.clarification_question_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diagnoses.clarification_question_count IS 'Number of clarification_questions chips returned by the AI. 0 when not applicable. Used to monitor prompt quality.';


--
-- Name: COLUMN diagnoses.diagnosis_critique; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diagnoses.diagnosis_critique IS 'Agent 3 (self-critique) output, written fire-and-forget after diagnose/refine completes. Shape: features/diagnosis/types.ts DiagnosisCritique. Phase 2 of Diagnosis Architecture Hardening Plan.';


--
-- Name: COLUMN diagnoses.refinement_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diagnoses.refinement_count IS 'Count of user-initiated Refine actions (changed photos/added text). Capped at 10. AI clarifications and warm-up/hydration calls do not count.';


--
-- Name: COLUMN diagnoses.anon_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diagnoses.anon_key IS 'scandio_anon cookie value that owns this row while user_id is null. Lets an anonymous owner read/update their own diagnosis without authenticating; superseded by user_id once the row is claimed by a signed-in user.';


--
-- Name: diagnosis_is_committed(public.diagnoses); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.diagnosis_is_committed(d public.diagnoses) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
    SELECT d.diagnosis IS NOT NULL
        AND COALESCE((d.diagnosis ->> 'rejected')::boolean, false) = false
        AND COALESCE((d.diagnosis ->> 'unserviced')::boolean, false) = false;
$$;


--
-- Name: diagnosis_is_first_pass(public.diagnoses); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.diagnosis_is_first_pass(d public.diagnoses) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
    SELECT public.diagnosis_is_committed(d)
        AND COALESCE(d.clarification_round, 0) = 0
        AND COALESCE(d.requires_clarification, false) = false
        AND COALESCE(
            jsonb_typeof(d.image_refinement_log) = 'array'
                AND jsonb_array_length(d.image_refinement_log) > 0,
            false
        ) = false;
$$;


--
-- Name: diagnosis_usage_preserve_first_seen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.diagnosis_usage_preserve_first_seen() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    IF tg_op = 'INSERT' THEN
        NEW.first_seen_at := COALESCE(NEW.first_seen_at, now());
    ELSIF tg_op = 'UPDATE' THEN
        NEW.first_seen_at := OLD.first_seen_at;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: get_user_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_id_by_email(p_email text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.profiles (id, user_id, first_name, surname, locations)
    VALUES (
        NEW.id,
        NEW.id,
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'first_name'), ''), ''),
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'surname'), ''), ''),
        '[]'::jsonb
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;


--
-- Name: increment_diagnosis_quota(uuid, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_diagnosis_quota(p_user_id uuid, p_anon_key text, p_date date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    new_count integer;
BEGIN
    IF p_user_id IS NOT NULL THEN
        INSERT INTO diagnosis_usage (user_id, date, count)
        VALUES (p_user_id, p_date, 1)
        ON CONFLICT (user_id, date)
        DO UPDATE SET count = diagnosis_usage.count + 1
        RETURNING count INTO new_count;
    ELSE
        INSERT INTO diagnosis_usage (anonymous_key, date, count)
        VALUES (p_anon_key, p_date, 1)
        ON CONFLICT (anonymous_key, date)
        DO UPDATE SET count = diagnosis_usage.count + 1
        RETURNING count INTO new_count;
    END IF;

    RETURN new_count;
END;
$$;


--
-- Name: job_outcomes_after_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.job_outcomes_after_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    PERFORM public.recompute_mendr_rating(NEW.provider_id);
    RETURN NEW;
END;
$$;


--
-- Name: link_pending_provider_members(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_pending_provider_members() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.provider_members
  SET user_id = NEW.id,
      status = 'active',
      accepted_at = now(),
      updated_at = now()
  WHERE user_id IS NULL
    AND status = 'invited'
    AND lower(invited_email) = lower(NEW.email);
  RETURN NEW;
END;
$$;


--
-- Name: next_invoice_seq(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_invoice_seq(p_provider uuid) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_seq integer;
BEGIN
  INSERT INTO public.provider_document_counters (provider_id, invoice_seq)
  VALUES (p_provider, 1)
  ON CONFLICT (provider_id)
  DO UPDATE SET invoice_seq = public.provider_document_counters.invoice_seq + 1
  RETURNING invoice_seq INTO v_seq;
  RETURN v_seq;
END;
$$;


--
-- Name: platform_home_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_home_stats() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH committed AS (
        SELECT d.*, public.diagnosis_is_first_pass(d) AS first_pass
        FROM public.diagnoses d
        WHERE public.diagnosis_is_committed(d)
    )
    SELECT json_build_object(
        'committed_total', (SELECT count(*) FROM committed),
        'first_pass_correct', (SELECT count(*) FROM committed WHERE first_pass),
        'first_pass_pct', (
            SELECT CASE WHEN count(*) = 0 THEN 0
                ELSE round(100.0 * count(*) FILTER (WHERE first_pass) / count(*))
            END
            FROM committed
        ),
        'avg_confidence', (
            SELECT COALESCE(round(avg(NULLIF(diagnosis ->> 'confidence', '')::int)), 0)
            FROM committed
        ),
        'trades_covered', (
            SELECT count(DISTINCT primary_trade) FROM committed WHERE primary_trade IS NOT NULL
        ),
        'providers_active', (
            SELECT count(*) FROM public.providers WHERE is_active = true
        )
    );
$$;


--
-- Name: recompute_mendr_rating(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_mendr_rating(p_provider_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_avg numeric;
    v_count integer;
BEGIN
    SELECT AVG(rating)::numeric, COUNT(*)::integer
      INTO v_avg, v_count
      FROM public.job_outcomes
     WHERE provider_id = p_provider_id
       AND rating IS NOT NULL;

    UPDATE public.providers
       SET mendr_rating = v_avg,
           mendr_rating_count = COALESCE(v_count, 0)
     WHERE id = p_provider_id;
END;
$$;


--
-- Name: redeem_beta_access_code(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_beta_access_code(p_code text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_id uuid;
begin
    select id into v_id
    from public.beta_access_codes
    where upper(replace(code, ' ', '')) = upper(replace(p_code, ' ', ''))
      and is_active = true
      and (expires_at is null or expires_at > now())
      and (max_uses is null or redemption_count < max_uses)
    for update;

    if v_id is null then
        return null;
    end if;

    insert into public.beta_access_redemptions (code_id, ip, user_agent, session_id)
    values (v_id, p_ip, p_user_agent, p_session_id);

    update public.beta_access_codes
    set redemption_count = redemption_count + 1,
        last_redeemed_at = now()
    where id = v_id;

    return v_id;
end;
$$;


--
-- Name: run_data_layer_maintenance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_data_layer_maintenance() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    n_stale int;
    n_orphan int;
    n_usage int;
BEGIN
    DELETE FROM public.provider_cache pc
    WHERE pc.enriched_at IS NOT NULL
      AND pc.enriched_at < now() - interval '30 days';
    GET DIAGNOSTICS n_stale = ROW_COUNT;

    DELETE FROM public.provider_cache pc
    WHERE NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.id = pc.provider_id);
    GET DIAGNOSTICS n_orphan = ROW_COUNT;

    DELETE FROM public.diagnosis_usage du
    WHERE du.anonymous_key IS NOT NULL
      AND du.first_seen_at < now() - interval '30 days';
    GET DIAGNOSTICS n_usage = ROW_COUNT;

    RETURN jsonb_build_object(
        'provider_cache_stale_deleted',
        n_stale,
        'provider_cache_orphan_deleted',
        n_orphan,
        'diagnosis_usage_anon_deleted',
        n_usage
    );
END;
$$;


--
-- Name: set_primary_trade(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_primary_trade() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.primary_trade := COALESCE(public.canonical_primary_trade(NEW.diagnosis), NEW.primary_trade);
    RETURN NEW;
END;
$$;


--
-- Name: user_can_access_job_message_storage(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_can_access_job_message_storage(obj_bucket_id text, obj_name text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  job_uuid UUID;
BEGIN
  IF obj_bucket_id <> 'vault' OR obj_name IS NULL THEN
    RETURN false;
  END IF;
  -- Path format: job_messages/<uuid>/... (first segment after job_messages is job_id)
  IF obj_name NOT LIKE 'job_messages/%' THEN
    RETURN true; -- other vault paths keep default policy (e.g. public read or authenticated)
  END IF;
  BEGIN
    job_uuid := (regexp_match(obj_name, '^job_messages/([0-9a-fA-F-]{36})'))[1]::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = job_uuid AND (j.client_id = auth.uid() OR j.provider_id = auth.uid())
  );
END;
$$;


--
-- Name: user_home_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_home_stats(p_user_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH mine AS (
        SELECT
            d.id,
            d.title,
            d.diagnosis,
            d.customer_address,
            d.created_at,
            public.diagnosis_is_committed(d) AS committed,
            public.diagnosis_is_first_pass(d) AS first_pass
        FROM public.diagnoses d
        WHERE d.user_id = p_user_id
    ),
    committed AS (
        SELECT * FROM mine WHERE committed
    )
    SELECT json_build_object(
        'total', (SELECT count(*) FROM mine),
        'committed_total', (SELECT count(*) FROM committed),
        'first_pass_correct', (SELECT count(*) FROM committed WHERE first_pass),
        'first_pass_pct', (
            SELECT CASE WHEN count(*) = 0 THEN 0
                ELSE round(100.0 * count(*) FILTER (WHERE first_pass) / count(*))
            END
            FROM committed
        ),
        'by_trade', COALESCE((
            SELECT json_agg(t)
            FROM (
                SELECT COALESCE(NULLIF(trim(diagnosis ->> 'trade'), ''), 'Other') AS trade,
                       count(*) AS count
                FROM committed
                GROUP BY 1
                ORDER BY count(*) DESC
                LIMIT 6
            ) t
        ), '[]'::json),
        'recent', (
            SELECT json_build_object(
                'id', id,
                'title', COALESCE(NULLIF(trim(diagnosis ->> 'diagnosis'), ''), title, 'Untitled Diagnosis'),
                'trade', COALESCE(NULLIF(trim(diagnosis ->> 'trade_detail'), ''), NULLIF(trim(diagnosis ->> 'trade'), '')),
                'customer_address', customer_address,
                'created_at', created_at
            )
            FROM mine
            ORDER BY created_at DESC
            LIMIT 1
        )
    );
$$;


--
-- Name: admin_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE admin_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_settings IS 'Key/value admin configuration (e.g. ai_monthly_budget_usd). Service role reads and writes only.';


--
-- Name: ai_call_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_call_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    conversation_id uuid,
    agent_id text NOT NULL,
    prompt_text text NOT NULL,
    prompt_version text,
    model_id text NOT NULL,
    temperature numeric,
    top_p numeric,
    top_k integer,
    response_text text,
    response_json jsonb,
    latency_ms integer,
    input_tokens integer,
    output_tokens integer,
    error text,
    image_urls text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT ai_call_log_agent_id_check CHECK ((agent_id = ANY (ARRAY['2a'::text, '2b'::text, '2c'::text, '3-critique'::text])))
);


--
-- Name: TABLE ai_call_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_call_log IS 'Phase 3 of Diagnosis Architecture Hardening Plan. One row per Gemini call across agents 2a/2b/2c/3-critique. Pruned at 90 days.';


--
-- Name: COLUMN ai_call_log.prompt_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_call_log.prompt_text IS 'Full assembled prompt text. Images are referenced by URL — never inlined.';


--
-- Name: COLUMN ai_call_log.response_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_call_log.response_json IS 'Parsed structured output when the call returned valid JSON; null on parse failure.';


--
-- Name: COLUMN ai_call_log.image_urls; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_call_log.image_urls IS 'Image URLs the model saw on this call. Bytes are NOT inlined — fetch via Supabase storage. Empty array on text-only calls.';


--
-- Name: ai_cost_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_cost_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    endpoint text NOT NULL,
    model_name text NOT NULL,
    user_id uuid,
    conversation_id text,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    estimated_usd numeric(12,8) DEFAULT 0 NOT NULL,
    latency_ms integer,
    cached_tokens integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE ai_cost_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_cost_events IS 'One row per Gemini generateContent call. Used for cost monitoring and budget alerting.';


--
-- Name: COLUMN ai_cost_events.estimated_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_cost_events.estimated_usd IS 'Approximate cost in USD. Based on token-count multipliers in src/lib/ai-cost-logger.ts — update multipliers when Google changes pricing.';


--
-- Name: COLUMN ai_cost_events.latency_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_cost_events.latency_ms IS 'Wall-clock duration of the Gemini generateContent call. Used for rolling-average processing-time estimates on the /processing page. NULL for rows logged before the field was added.';


--
-- Name: COLUMN ai_cost_events.cached_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_cost_events.cached_tokens IS 'Prompt tokens served from Gemini context cache (cachedContentTokenCount). Billed at the cached input rate; a subset of prompt_tokens.';


--
-- Name: ai_model_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_model_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model_name text NOT NULL,
    input_per_1m_usd numeric(10,6) NOT NULL,
    output_per_1m_usd numeric(10,6) NOT NULL,
    cached_input_per_1m_usd numeric(10,6),
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_until timestamp with time zone,
    source text DEFAULT 'manual'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: TABLE ai_model_pricing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_model_pricing IS 'Per-model Gemini pricing rates with full history. Active rates have effective_until IS NULL. Service role reads only.';


--
-- Name: COLUMN ai_model_pricing.input_per_1m_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_model_pricing.input_per_1m_usd IS 'USD cost per 1,000,000 input tokens.';


--
-- Name: COLUMN ai_model_pricing.output_per_1m_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_model_pricing.output_per_1m_usd IS 'USD cost per 1,000,000 output (candidate) tokens.';


--
-- Name: COLUMN ai_model_pricing.cached_input_per_1m_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_model_pricing.cached_input_per_1m_usd IS 'USD cost per 1,000,000 cached input tokens. NULL when the model has no context-cache pricing tier.';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type public.log_category NOT NULL,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    payload jsonb,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: beta_access_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_access_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    label text,
    note text,
    is_active boolean DEFAULT true NOT NULL,
    max_uses integer,
    redemption_count integer DEFAULT 0 NOT NULL,
    last_redeemed_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE beta_access_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.beta_access_codes IS 'Per-person early-access codes for the /coming-soon gate. Service role reads and writes only.';


--
-- Name: beta_access_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_access_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_id uuid NOT NULL,
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL,
    ip text,
    user_agent text,
    session_id text
);


--
-- Name: TABLE beta_access_redemptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.beta_access_redemptions IS 'One row per successful early-access code redemption. Distinct ip/session per code_id flags code sharing. Service role writes only.';


--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    subject text,
    message text NOT NULL,
    status text DEFAULT 'unread'::text NOT NULL,
    replied_at timestamp with time zone,
    reply_text text,
    CONSTRAINT contact_messages_status_check CHECK ((status = ANY (ARRAY['unread'::text, 'read'::text, 'replied'::text])))
);


--
-- Name: cost_estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_estimates (
    subcategory_id text NOT NULL,
    min_zar integer,
    max_zar integer,
    unit text,
    note text,
    source text DEFAULT 'brave'::text NOT NULL,
    research_query text,
    researched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_key text DEFAULT ''::text NOT NULL,
    CONSTRAINT cost_estimates_source_check CHECK ((source = ANY (ARRAY['brave'::text, 'seed'::text, 'manual'::text])))
);


--
-- Name: TABLE cost_estimates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cost_estimates IS 'Researched cost ranges per fault type, refreshed via Brave + LLM on a deliberate trigger and cached. Read path falls back to static estimates in code.';


--
-- Name: COLUMN cost_estimates.variant_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_estimates.variant_key IS 'Empty string = Layer 1 baseline per fault type. A brand/model slug = Layer 2 brand-specific estimate (built later).';


--
-- Name: credit_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: diagnosis_clarification_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.diagnosis_clarification_stats WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, created_at) AS day,
    count(*) AS total_diagnoses,
    count(*) FILTER (WHERE (requires_clarification = true)) AS needs_clarification,
    round(((100.0 * (count(*) FILTER (WHERE (requires_clarification = true)))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS clarification_pct,
    round(avg(clarification_question_count) FILTER (WHERE (clarification_question_count > 0)), 2) AS avg_chips_when_needed
   FROM public.diagnoses
  GROUP BY (date_trunc('day'::text, created_at))
  ORDER BY (date_trunc('day'::text, created_at)) DESC;


--
-- Name: diagnosis_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnosis_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    event_type text NOT NULL,
    provider_id text,
    diagnosis_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_agent text,
    ip_hash text,
    CONSTRAINT diagnosis_events_event_type_check CHECK ((event_type = ANY (ARRAY['welcome_start'::text, 'diagnosis_complete'::text, 'match_view'::text, 'provider_contact'::text])))
);


--
-- Name: diagnosis_funnel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnosis_funnel (
    diagnosis_id uuid NOT NULL,
    delivered_at timestamp with time zone,
    matches_shown_at timestamp with time zone,
    match_count integer DEFAULT 0 NOT NULL,
    first_contact_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE diagnosis_funnel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.diagnosis_funnel IS 'Durable per-diagnosis funnel state, written server-side. Stages: Started (diagnoses.created_at), Diagnosis Delivered (delivered_at), Matches Shown (matches_shown_at), Contacted (first_contact_at). Service role writes only.';


--
-- Name: diagnosis_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnosis_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    diagnosis_id uuid NOT NULL,
    snapshot jsonb NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: diagnosis_outcomes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.diagnosis_outcomes WITH (security_invoker='true') AS
 SELECT id,
    user_id,
    created_at,
    updated_at,
    (diagnosis ->> 'trade'::text) AS trade,
    (diagnosis ->> 'subcategory_id'::text) AS subcategory_id,
    (NULLIF((diagnosis ->> 'confidence'::text), ''::text))::integer AS confidence,
    clarification_round,
    requires_clarification,
    COALESCE(((diagnosis ->> 'rejected'::text))::boolean, false) AS rejected,
    COALESCE(((diagnosis ->> 'unserviced'::text))::boolean, false) AS unserviced,
        CASE
            WHEN COALESCE(((diagnosis ->> 'rejected'::text))::boolean, false) THEN 'rejected'::text
            WHEN COALESCE(((diagnosis ->> 'unserviced'::text))::boolean, false) THEN 'unserviced'::text
            WHEN ((requires_clarification IS TRUE) AND ((now() - updated_at) > '00:10:00'::interval)) THEN 'clarification_abandoned'::text
            WHEN (requires_clarification IS TRUE) THEN 'clarification_open'::text
            WHEN ((clarification_round >= 2) AND (requires_clarification IS FALSE)) THEN 'clarification_force_committed'::text
            WHEN ((clarification_round >= 1) AND (requires_clarification IS FALSE)) THEN 'clarification_resolved'::text
            WHEN ((NULLIF((diagnosis ->> 'confidence'::text), ''::text))::integer >= 85) THEN 'committed_high_conf'::text
            WHEN (diagnosis IS NOT NULL) THEN 'committed_low_conf'::text
            ELSE 'unknown'::text
        END AS outcome
   FROM public.diagnoses d
  WHERE (diagnosis IS NOT NULL);


--
-- Name: VIEW diagnosis_outcomes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.diagnosis_outcomes IS 'Phase 0 of Diagnosis Architecture Hardening Plan. Classifies each diagnoses row into one outcome state for Phase 0/9 metrics queries.';


--
-- Name: diagnosis_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnosis_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    anonymous_key text,
    date date DEFAULT CURRENT_DATE NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT diagnosis_usage_has_key CHECK (((user_id IS NOT NULL) OR (anonymous_key IS NOT NULL)))
);


--
-- Name: directions_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directions_cache (
    query_key text NOT NULL,
    distance_text text,
    distance_meters integer,
    duration_text text,
    duration_seconds integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_suppressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    suppressed_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text DEFAULT 'unsubscribe'::text NOT NULL
);


--
-- Name: feature_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    summary text,
    body text,
    image_url text,
    published_at timestamp with time zone,
    email_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE feature_announcements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feature_announcements IS 'Product update / "What''s new" entries surfaced on the home page and /whats-new. Published when published_at is set and not in the future.';


--
-- Name: geocode_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geocode_cache (
    query_key text NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    address text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    description text,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    line_total numeric DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    customer_id uuid,
    quote_id uuid,
    job_id uuid,
    number text,
    status text DEFAULT 'draft'::text NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    vat_amount numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    amount_paid numeric DEFAULT 0 NOT NULL,
    deposit_percent numeric,
    due_date date,
    terms text,
    template text DEFAULT 'classic'::text NOT NULL,
    issued_at timestamp with time zone,
    sent_at timestamp with time zone,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'partial'::text, 'paid'::text, 'overdue'::text])))
);


--
-- Name: TABLE invoices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.invoices IS 'Pro invoices. Editable while draft; locked on issue with a gap-free per-Pro number. Corrections via credit_notes.';


--
-- Name: job_outcome_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_outcome_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_event_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    diagnosis_id uuid NOT NULL,
    user_id uuid NOT NULL,
    used_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_outcomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_id uuid NOT NULL,
    contact_event_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    diagnosis_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rating smallint NOT NULL,
    outcome text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contractor_reply text,
    contractor_reply_at timestamp with time zone,
    CONSTRAINT job_outcomes_outcome_check CHECK ((outcome = ANY (ARRAY['job_done'::text, 'still_open'::text, 'used_different'::text]))),
    CONSTRAINT job_outcomes_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    customer_id uuid,
    contact_event_id uuid,
    title text,
    site_address text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    scheduled_for timestamp with time zone,
    assigned_to uuid,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: TABLE jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.jobs IS 'Work orders. A won lead (or accepted quote) becomes a job with scheduling, site address, and assignment. Invoices reference a job.';


--
-- Name: lead_contact_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_contact_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    diagnosis_id uuid,
    channel text,
    scope text DEFAULT 'name,phone,enquiry'::text NOT NULL,
    consent_text_version text,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT lead_contact_consents_channel_check CHECK ((channel = ANY (ARRAY['phone'::text, 'email'::text, 'whatsapp'::text])))
);


--
-- Name: TABLE lead_contact_consents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lead_contact_consents IS 'Per-contact consent audit + the switch controlling whether a Pro may see homeowner identity. Written at the consent gate; revoked_at disables it.';


--
-- Name: lead_share_consent_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_share_consent_settings (
    user_id uuid NOT NULL,
    mode text DEFAULT 'ask_each_time'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_share_consent_settings_mode_check CHECK ((mode = ANY (ARRAY['ask_each_time'::text, 'always_share'::text])))
);


--
-- Name: TABLE lead_share_consent_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lead_share_consent_settings IS 'Per-homeowner global lead-share consent mode. ask_each_time shows the per-contact modal; always_share skips it. Revocable from settings.';


--
-- Name: lead_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_states (
    contact_event_id uuid NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    assigned_to uuid,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_states_status_check CHECK ((status = ANY (ARRAY['new'::text, 'responded'::text, 'quoted'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: TABLE lead_states; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lead_states IS 'Per-lead pipeline status, assignment, and notes, keyed to provider_contact_events. The event log itself is never mutated.';


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    followup_enabled boolean DEFAULT true NOT NULL,
    rating_enabled boolean DEFAULT true NOT NULL,
    reengagement_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    product_updates_enabled boolean DEFAULT true NOT NULL
);


--
-- Name: onboarding_place_details_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_place_details_cache (
    place_id text NOT NULL,
    payload jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    user_id uuid,
    first_name text,
    surname text,
    description text,
    username text,
    avatar_url text,
    locations jsonb DEFAULT '[]'::jsonb,
    total_scans_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    popia_consent_at timestamp with time zone,
    is_admin boolean DEFAULT false NOT NULL,
    profile_type text DEFAULT 'customer'::text NOT NULL,
    phone text,
    phone_verified_at timestamp with time zone,
    CONSTRAINT profiles_profile_type_check CHECK ((profile_type = ANY (ARRAY['customer'::text, 'pro'::text])))
);


--
-- Name: COLUMN profiles.is_admin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.is_admin IS 'When true, this user may access the /admin section. Service-role / dashboard managed.';


--
-- Name: COLUMN profiles.phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.phone IS 'Homeowner mobile, normalised to 27XXXXXXXXX. Captured at onboarding, shared with a Pro on consent. Stored unverified until OTP is enabled.';


--
-- Name: COLUMN profiles.phone_verified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.phone_verified_at IS 'Set when the number passes OTP verification. NULL = captured but unverified.';


--
-- Name: provider_application_edit_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_application_edit_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_application_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_name text NOT NULL,
    contact_name text NOT NULL,
    address text NOT NULL,
    phone text NOT NULL,
    website text,
    trade text NOT NULL,
    trade_description text NOT NULL,
    service_areas jsonb DEFAULT '[]'::jsonb NOT NULL,
    registration_number text,
    about text,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email text NOT NULL,
    areas text NOT NULL,
    notes text,
    sendgrid_sent_at timestamp with time zone,
    source text,
    founded_year integer,
    whatsapp_available boolean DEFAULT false NOT NULL,
    certifications text,
    highlights text,
    application_images jsonb,
    applicant_ip text,
    confirmation_email_status text DEFAULT 'pending'::text NOT NULL,
    confirmation_email_sent_at timestamp with time zone,
    confirmation_email_error text,
    enrichment_status text DEFAULT 'pending'::text NOT NULL,
    enrichment_queued_at timestamp with time zone,
    enrichment_started_at timestamp with time zone,
    enrichment_completed_at timestamp with time zone,
    enrichment_error text,
    matched_provider_id uuid,
    matched_google_place_id text,
    match_score numeric(5,4),
    enrichment_input jsonb,
    enrichment_payload jsonb,
    gemini_summary text,
    gemini_model text,
    gemini_generated_at timestamp with time zone,
    applicant_summary text,
    applicant_edited_at timestamp with time zone,
    applicant_profile_edits jsonb,
    invitation_email_status text,
    invitation_email_sent_at timestamp with time zone,
    invitation_email_error text,
    contractor_type text,
    willingness_to_pay_band text,
    applicant_google_place_id text,
    kyc_documents jsonb,
    user_id uuid,
    rejection_reason text,
    resubmission_of uuid,
    popia_consent_at timestamp with time zone,
    insurance_cover text,
    typical_response_time text,
    pricing_model text,
    callout_fee numeric,
    preferred_contact_channel text,
    CONSTRAINT provider_applications_confirmation_email_status_check CHECK ((confirmation_email_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]))),
    CONSTRAINT provider_applications_contractor_type_check CHECK (((contractor_type IS NULL) OR (contractor_type = ANY (ARRAY['individual'::text, 'team'::text, 'enterprise'::text])))),
    CONSTRAINT provider_applications_enrichment_status_check CHECK ((enrichment_status = ANY (ARRAY['pending'::text, 'queued'::text, 'running'::text, 'matched'::text, 'no_match'::text, 'failed'::text, 'complete'::text]))),
    CONSTRAINT provider_applications_invitation_email_status_check CHECK ((invitation_email_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]))),
    CONSTRAINT provider_applications_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: COLUMN provider_applications.contractor_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.provider_applications.contractor_type IS 'Self-reported: individual, team, or enterprise — drives service-area limits in onboarding.';


--
-- Name: COLUMN provider_applications.willingness_to_pay_band; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.provider_applications.willingness_to_pay_band IS 'Applicant-selected monthly budget band for platform access (product research).';


--
-- Name: COLUMN provider_applications.applicant_google_place_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.provider_applications.applicant_google_place_id IS 'Google Place resource id chosen during onboarding (Places API), if any.';


--
-- Name: COLUMN provider_applications.kyc_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.provider_applications.kyc_documents IS 'Optional { idDocument?: {path,bucket}, selfie?: {path,bucket} } for manual review.';


--
-- Name: provider_branding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_branding (
    provider_id uuid NOT NULL,
    logo_url text,
    accent_color text,
    banking_details text,
    vat_registered boolean DEFAULT false NOT NULL,
    vat_number text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_cache (
    provider_id uuid NOT NULL,
    google_place_id text DEFAULT ''::text NOT NULL,
    scraped_at timestamp with time zone,
    enriched_at timestamp with time zone,
    scrape_status text DEFAULT 'pending'::text NOT NULL,
    bio text,
    specialisations text[] DEFAULT '{}'::text[] NOT NULL,
    service_areas text[] DEFAULT '{}'::text[] NOT NULL,
    website_quality text,
    profile_completeness smallint DEFAULT 0 NOT NULL,
    review_summary text,
    cache_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    highlights jsonb,
    key_person text,
    enrichment_quality text,
    needs_enrichment boolean DEFAULT false NOT NULL,
    last_review_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT provider_cache_enrichment_quality_check CHECK (((enrichment_quality IS NULL) OR (enrichment_quality = ANY (ARRAY['ok'::text, 'low'::text])))),
    CONSTRAINT provider_cache_profile_completeness_check CHECK (((profile_completeness >= 0) AND (profile_completeness <= 3)))
);


--
-- Name: COLUMN provider_cache.enrichment_quality; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.provider_cache.enrichment_quality IS 'ok = passed QA; low = AI output failed quality gate — shorter retry window';


--
-- Name: COLUMN provider_cache.needs_enrichment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.provider_cache.needs_enrichment IS 'Set to true by the DataForSEO sync cron when ≥3 new reviews arrive. Cleared after full enrichment runs.';


--
-- Name: COLUMN provider_cache.last_review_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.provider_cache.last_review_count IS 'Review count recorded at last DataForSEO sync. Used to detect new reviews on subsequent runs.';


--
-- Name: provider_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    CONSTRAINT provider_claims_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: TABLE provider_claims; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.provider_claims IS 'Pending/approved/rejected requests by a Pro to claim a provider listing. Approval sets providers.claimed_by_user_id.';


--
-- Name: provider_contact_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_contact_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    channel text NOT NULL,
    dedupe_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    homeowner_whatsapp text,
    diagnosis_trade text,
    digest_sent_at timestamp with time zone,
    rating_sent_at timestamp with time zone,
    CONSTRAINT provider_contact_events_channel_check CHECK ((channel = ANY (ARRAY['phone'::text, 'email'::text, 'whatsapp'::text])))
);


--
-- Name: provider_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    homeowner_user_id uuid,
    name text,
    phone text,
    email text,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE provider_customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.provider_customers IS 'Pro CRM: one row per identified homeowner the Pro has dealt with. Auto-seeded from consented leads, plus manual adds.';


--
-- Name: provider_document_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_document_counters (
    provider_id uuid NOT NULL,
    invoice_seq integer DEFAULT 0 NOT NULL
);


--
-- Name: provider_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    source text NOT NULL,
    source_ref text,
    bucket text DEFAULT 'gallery'::text NOT NULL,
    path text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    caption text,
    status text DEFAULT 'approved'::text NOT NULL,
    CONSTRAINT provider_images_source_check CHECK ((source = ANY (ARRAY['google'::text, 'user'::text, 'provider'::text]))),
    CONSTRAINT provider_images_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: COLUMN provider_images.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.provider_images.status IS 'pending = awaiting moderation; approved = visible in public gallery; rejected = hidden';


--
-- Name: provider_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    user_id uuid,
    role text DEFAULT 'member'::text NOT NULL,
    invited_email text,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    status text DEFAULT 'invited'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))),
    CONSTRAINT provider_members_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'removed'::text])))
);


--
-- Name: TABLE provider_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.provider_members IS 'Pro team membership. Owner (first claimer), admin, or member. Writes go through service-role APIs that gate on role.';


--
-- Name: provider_notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_notification_preferences (
    provider_id uuid NOT NULL,
    user_id uuid NOT NULL,
    new_enquiry boolean DEFAULT true NOT NULL,
    new_review boolean DEFAULT true NOT NULL,
    weekly_summary boolean DEFAULT true NOT NULL,
    quiet_hours_start smallint,
    quiet_hours_end smallint,
    preferred_channel text DEFAULT 'email'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT provider_notification_preferences_preferred_channel_check CHECK ((preferred_channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'sms'::text]))),
    CONSTRAINT provider_notification_preferences_quiet_hours_end_check CHECK (((quiet_hours_end >= 0) AND (quiet_hours_end <= 23))),
    CONSTRAINT provider_notification_preferences_quiet_hours_start_check CHECK (((quiet_hours_start >= 0) AND (quiet_hours_start <= 23)))
);


--
-- Name: TABLE provider_notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.provider_notification_preferences IS 'Per-teammate notification settings for a provider. Read by the realtime enquiry alert and the weekly summary.';


--
-- Name: provider_profile_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_profile_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    diagnosis_id uuid,
    session_id text,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE provider_profile_views; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.provider_profile_views IS 'Per-provider profile-view log. Feeds the admin Providers view count and the contractor views-vs-leads metric. Not a funnel stage. Distinct views via COUNT(DISTINCT session_id). Service role writes only.';


--
-- Name: provider_rotation_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_rotation_tokens (
    provider_id uuid NOT NULL,
    week_key text NOT NULL,
    tokens_remaining smallint DEFAULT 5 NOT NULL,
    last_shown_at timestamp with time zone,
    CONSTRAINT provider_rotation_tokens_tokens_remaining_check CHECK ((tokens_remaining >= 0))
);


--
-- Name: provider_search_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_search_cache (
    query_key text NOT NULL,
    place_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    routing_summaries jsonb DEFAULT '[]'::jsonb NOT NULL,
    next_page_token text,
    created_at timestamp with time zone DEFAULT now(),
    providers jsonb
);


--
-- Name: providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    google_place_id text,
    name text NOT NULL,
    address text,
    rating numeric(3,2),
    rating_count integer,
    phone text,
    website text,
    latitude double precision,
    longitude double precision,
    summary text,
    weekday_descriptions jsonb,
    last_updated timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    about text,
    past_work text,
    last_matched_at timestamp with time zone,
    summary_long text,
    reviews_synced_at timestamp with time zone,
    specialisations text[] DEFAULT '{}'::text[] NOT NULL,
    service_areas text[] DEFAULT '{}'::text[] NOT NULL,
    certifications text[] DEFAULT '{}'::text[] NOT NULL,
    highlights jsonb,
    key_person text,
    is_active boolean DEFAULT true NOT NULL,
    enrichment_review_required boolean DEFAULT false NOT NULL,
    enrichment_last_failure text,
    enrichment_last_failure_at timestamp with time zone,
    is_verified boolean DEFAULT false NOT NULL,
    google_generative_summary text,
    google_editorial_summary text,
    notify_realtime boolean DEFAULT true NOT NULL,
    service_area_center_lat numeric,
    service_area_center_lng numeric,
    service_area_radius_km integer DEFAULT 15 NOT NULL,
    mendr_rating numeric,
    mendr_rating_count integer DEFAULT 0 NOT NULL,
    years_in_business integer,
    insurance_cover text,
    typical_response_time text,
    pricing_model text,
    callout_fee numeric,
    preferred_contact_channel text,
    field_sources jsonb DEFAULT '{}'::jsonb NOT NULL,
    claimed_at timestamp with time zone,
    claimed_by_user_id uuid,
    merged_into uuid,
    plan text DEFAULT 'starter'::text NOT NULL,
    CONSTRAINT providers_plan_check CHECK ((plan = ANY (ARRAY['starter'::text, 'team'::text, 'business'::text]))),
    CONSTRAINT providers_source_check CHECK ((source = ANY (ARRAY['google'::text, 'scrape'::text, 'scandio'::text, 'manual'::text])))
);


--
-- Name: COLUMN providers.enrichment_review_required; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.enrichment_review_required IS 'True when the LLM enrichment output failed the content-leak gate after retries; admins should review.';


--
-- Name: COLUMN providers.enrichment_last_failure; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.enrichment_last_failure IS 'Free-form summary of the last guard rejection (e.g. ''bio: css'').';


--
-- Name: COLUMN providers.enrichment_last_failure_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.enrichment_last_failure_at IS 'Timestamp of the last guard rejection.';


--
-- Name: COLUMN providers.is_verified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.is_verified IS 'For google-sourced providers this is backfilled to true. For application-sourced providers, an admin must set this to true before the provider is shown to homeowners.';


--
-- Name: COLUMN providers.google_generative_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.google_generative_summary IS 'Generative summary from Google Places API (New). Injected into Gemini enrichment prompt as context.';


--
-- Name: COLUMN providers.google_editorial_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.google_editorial_summary IS 'Editorial summary from Google Places API (New). Shorter curated description.';


--
-- Name: COLUMN providers.preferred_contact_channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.preferred_contact_channel IS 'Contractor-preferred lead channel: whatsapp | call | email.';


--
-- Name: COLUMN providers.field_sources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.field_sources IS 'Per-field provenance map, e.g. {"about":"contractor"}. Enrichment must NOT overwrite a field whose source is "contractor".';


--
-- Name: COLUMN providers.claimed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.claimed_at IS 'Set when a contractor claims/edits this profile via the claim flow.';


--
-- Name: COLUMN providers.merged_into; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.merged_into IS 'Set on a duplicate scraped row to point at the canonical provider, so claims and leads consolidate onto one record.';


--
-- Name: COLUMN providers.plan; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.providers.plan IS 'Subscription tier gating seats and service-area radius. Enforced in app; billing not yet built.';


--
-- Name: quote_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    description text,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    line_total numeric DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


--
-- Name: quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    customer_id uuid,
    contact_event_id uuid,
    number text,
    status text DEFAULT 'draft'::text NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    vat_amount numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    deposit_percent numeric,
    valid_until date,
    terms text,
    template text DEFAULT 'classic'::text NOT NULL,
    sent_at timestamp with time zone,
    viewed_at timestamp with time zone,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quotes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text])))
);


--
-- Name: TABLE quotes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quotes IS 'Pro quotes with line items (quote_items), VAT, deposit, validity, terms. Shared as a tracked link; converts to an invoice on acceptance.';


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    source text NOT NULL,
    source_ref text,
    reviewer_user_id uuid,
    reviewer_name text,
    reviewer_email text,
    rating smallint,
    category_ratings jsonb,
    title text,
    body text NOT NULL,
    image_urls text[] DEFAULT '{}'::text[],
    status text DEFAULT 'approved'::text NOT NULL,
    relative_publish_time_description text,
    published_at timestamp with time zone,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_source_check CHECK ((source = ANY (ARRAY['google'::text, 'scandio'::text, 'dataforseo'::text]))),
    CONSTRAINT reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: saved_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transcriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    source text,
    status text NOT NULL,
    transcript text,
    error_message text,
    audio_mime_type text,
    audio_bytes integer,
    language_code text DEFAULT 'en-ZA'::text NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    CONSTRAINT transcriptions_audio_bytes_check CHECK (((audio_bytes IS NULL) OR (audio_bytes >= 0))),
    CONSTRAINT transcriptions_duration_ms_check CHECK ((duration_ms >= 0)),
    CONSTRAINT transcriptions_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text])))
);


--
-- Name: user_data_consent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_data_consent (
    user_id uuid NOT NULL,
    product_analytics boolean DEFAULT true NOT NULL,
    model_training boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number text NOT NULL,
    user_id uuid,
    state text DEFAULT 'idle'::text NOT NULL,
    active_diagnosis_id uuid,
    pending_contractors jsonb,
    pending_address jsonb,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pending_clarification jsonb
);


--
-- Name: TABLE whatsapp_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.whatsapp_sessions IS 'Per-phone WhatsApp bot session state for the simulator (Phase A) and later the live Meta webhook. active_diagnosis_id references diagnoses(id) (there is no conversations table).';


--
-- Name: COLUMN whatsapp_sessions.pending_clarification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_sessions.pending_clarification IS 'Clarification hypothesis options currently presented to the user, so the forgiving parser can map a reply across re-entry.';


--
-- Name: admin_settings admin_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_settings
    ADD CONSTRAINT admin_settings_pkey PRIMARY KEY (key);


--
-- Name: ai_call_log ai_call_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_call_log
    ADD CONSTRAINT ai_call_log_pkey PRIMARY KEY (id);


--
-- Name: ai_cost_events ai_cost_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_cost_events
    ADD CONSTRAINT ai_cost_events_pkey PRIMARY KEY (id);


--
-- Name: ai_model_pricing ai_model_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_model_pricing
    ADD CONSTRAINT ai_model_pricing_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: beta_access_codes beta_access_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_access_codes
    ADD CONSTRAINT beta_access_codes_pkey PRIMARY KEY (id);


--
-- Name: beta_access_redemptions beta_access_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_access_redemptions
    ADD CONSTRAINT beta_access_redemptions_pkey PRIMARY KEY (id);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


--
-- Name: cost_estimates cost_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_estimates
    ADD CONSTRAINT cost_estimates_pkey PRIMARY KEY (subcategory_id, variant_key);


--
-- Name: credit_notes credit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_pkey PRIMARY KEY (id);


--
-- Name: diagnoses diagnoses_diagnosis_shape_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.diagnoses
    ADD CONSTRAINT diagnoses_diagnosis_shape_check CHECK (((diagnosis IS NULL) OR ((jsonb_typeof(diagnosis) = 'object'::text) AND (diagnosis ? 'trade'::text) AND (diagnosis ? 'confidence'::text)))) NOT VALID;


--
-- Name: diagnoses diagnoses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnoses
    ADD CONSTRAINT diagnoses_pkey PRIMARY KEY (id);


--
-- Name: diagnosis_events diagnosis_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_events
    ADD CONSTRAINT diagnosis_events_pkey PRIMARY KEY (id);


--
-- Name: diagnosis_funnel diagnosis_funnel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_funnel
    ADD CONSTRAINT diagnosis_funnel_pkey PRIMARY KEY (diagnosis_id);


--
-- Name: diagnosis_history diagnosis_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_history
    ADD CONSTRAINT diagnosis_history_pkey PRIMARY KEY (id);


--
-- Name: diagnosis_usage diagnosis_usage_anon_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_usage
    ADD CONSTRAINT diagnosis_usage_anon_date_key UNIQUE (anonymous_key, date);


--
-- Name: diagnosis_usage diagnosis_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_usage
    ADD CONSTRAINT diagnosis_usage_pkey PRIMARY KEY (id);


--
-- Name: diagnosis_usage diagnosis_usage_user_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_usage
    ADD CONSTRAINT diagnosis_usage_user_date_key UNIQUE (user_id, date);


--
-- Name: directions_cache directions_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directions_cache
    ADD CONSTRAINT directions_cache_pkey PRIMARY KEY (query_key);


--
-- Name: email_suppressions email_suppressions_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_email_unique UNIQUE (email);


--
-- Name: email_suppressions email_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_pkey PRIMARY KEY (id);


--
-- Name: feature_announcements feature_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_announcements
    ADD CONSTRAINT feature_announcements_pkey PRIMARY KEY (id);


--
-- Name: feature_announcements feature_announcements_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_announcements
    ADD CONSTRAINT feature_announcements_slug_key UNIQUE (slug);


--
-- Name: geocode_cache geocode_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geocode_cache
    ADD CONSTRAINT geocode_cache_pkey PRIMARY KEY (query_key);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: job_outcome_tokens job_outcome_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_outcome_tokens
    ADD CONSTRAINT job_outcome_tokens_pkey PRIMARY KEY (id);


--
-- Name: job_outcomes job_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_outcomes
    ADD CONSTRAINT job_outcomes_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: lead_contact_consents lead_contact_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_contact_consents
    ADD CONSTRAINT lead_contact_consents_pkey PRIMARY KEY (id);


--
-- Name: lead_share_consent_settings lead_share_consent_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_share_consent_settings
    ADD CONSTRAINT lead_share_consent_settings_pkey PRIMARY KEY (user_id);


--
-- Name: lead_states lead_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_states
    ADD CONSTRAINT lead_states_pkey PRIMARY KEY (contact_event_id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: onboarding_place_details_cache onboarding_place_details_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_place_details_cache
    ADD CONSTRAINT onboarding_place_details_cache_pkey PRIMARY KEY (place_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: provider_application_edit_tokens provider_application_edit_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_application_edit_tokens
    ADD CONSTRAINT provider_application_edit_tokens_pkey PRIMARY KEY (id);


--
-- Name: provider_application_edit_tokens provider_application_edit_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_application_edit_tokens
    ADD CONSTRAINT provider_application_edit_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: provider_applications provider_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_applications
    ADD CONSTRAINT provider_applications_pkey PRIMARY KEY (id);


--
-- Name: provider_branding provider_branding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_branding
    ADD CONSTRAINT provider_branding_pkey PRIMARY KEY (provider_id);


--
-- Name: provider_cache provider_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_cache
    ADD CONSTRAINT provider_cache_pkey PRIMARY KEY (provider_id);


--
-- Name: provider_claims provider_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_claims
    ADD CONSTRAINT provider_claims_pkey PRIMARY KEY (id);


--
-- Name: provider_contact_events provider_contact_events_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_contact_events
    ADD CONSTRAINT provider_contact_events_dedupe_key_key UNIQUE (dedupe_key);


--
-- Name: provider_contact_events provider_contact_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_contact_events
    ADD CONSTRAINT provider_contact_events_pkey PRIMARY KEY (id);


--
-- Name: provider_customers provider_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_customers
    ADD CONSTRAINT provider_customers_pkey PRIMARY KEY (id);


--
-- Name: provider_customers provider_customers_provider_id_homeowner_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_customers
    ADD CONSTRAINT provider_customers_provider_id_homeowner_user_id_key UNIQUE (provider_id, homeowner_user_id);


--
-- Name: provider_document_counters provider_document_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_document_counters
    ADD CONSTRAINT provider_document_counters_pkey PRIMARY KEY (provider_id);


--
-- Name: provider_images provider_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_images
    ADD CONSTRAINT provider_images_pkey PRIMARY KEY (id);


--
-- Name: provider_images provider_images_provider_id_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_images
    ADD CONSTRAINT provider_images_provider_id_path_key UNIQUE (provider_id, path);


--
-- Name: provider_images provider_images_provider_id_source_source_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_images
    ADD CONSTRAINT provider_images_provider_id_source_source_ref_key UNIQUE (provider_id, source, source_ref);


--
-- Name: provider_members provider_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_members
    ADD CONSTRAINT provider_members_pkey PRIMARY KEY (id);


--
-- Name: provider_notification_preferences provider_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notification_preferences
    ADD CONSTRAINT provider_notification_preferences_pkey PRIMARY KEY (provider_id, user_id);


--
-- Name: provider_profile_views provider_profile_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_profile_views
    ADD CONSTRAINT provider_profile_views_pkey PRIMARY KEY (id);


--
-- Name: provider_rotation_tokens provider_rotation_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_rotation_tokens
    ADD CONSTRAINT provider_rotation_tokens_pkey PRIMARY KEY (provider_id, week_key);


--
-- Name: provider_search_cache provider_search_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_search_cache
    ADD CONSTRAINT provider_search_cache_pkey PRIMARY KEY (query_key);


--
-- Name: providers providers_google_place_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_google_place_id_key UNIQUE (google_place_id);


--
-- Name: providers providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_pkey PRIMARY KEY (id);


--
-- Name: quote_items quote_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_items
    ADD CONSTRAINT quote_items_pkey PRIMARY KEY (id);


--
-- Name: quotes quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: saved_providers saved_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_providers
    ADD CONSTRAINT saved_providers_pkey PRIMARY KEY (id);


--
-- Name: saved_providers saved_providers_user_provider_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_providers
    ADD CONSTRAINT saved_providers_user_provider_unique UNIQUE (user_id, provider_id);


--
-- Name: transcriptions transcriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcriptions
    ADD CONSTRAINT transcriptions_pkey PRIMARY KEY (id);


--
-- Name: user_data_consent user_data_consent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_data_consent
    ADD CONSTRAINT user_data_consent_pkey PRIMARY KEY (user_id);


--
-- Name: whatsapp_sessions whatsapp_sessions_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_sessions
    ADD CONSTRAINT whatsapp_sessions_phone_number_key UNIQUE (phone_number);


--
-- Name: whatsapp_sessions whatsapp_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_sessions
    ADD CONSTRAINT whatsapp_sessions_pkey PRIMARY KEY (id);


--
-- Name: ai_call_log_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_call_log_conversation_id_idx ON public.ai_call_log USING btree (conversation_id);


--
-- Name: ai_call_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_call_log_created_at_idx ON public.ai_call_log USING btree (created_at);


--
-- Name: ai_cost_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_cost_events_created_at_idx ON public.ai_cost_events USING btree (created_at DESC);


--
-- Name: ai_cost_events_endpoint_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_cost_events_endpoint_created_at_idx ON public.ai_cost_events USING btree (endpoint, created_at DESC) WHERE (latency_ms IS NOT NULL);


--
-- Name: ai_cost_events_endpoint_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_cost_events_endpoint_idx ON public.ai_cost_events USING btree (endpoint, created_at DESC);


--
-- Name: ai_cost_events_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_cost_events_user_id_idx ON public.ai_cost_events USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: ai_model_pricing_model_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_model_pricing_model_active_idx ON public.ai_model_pricing USING btree (model_name) WHERE (effective_until IS NULL);


--
-- Name: ai_model_pricing_model_history_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_model_pricing_model_history_idx ON public.ai_model_pricing USING btree (model_name, effective_from DESC);


--
-- Name: beta_access_codes_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX beta_access_codes_code_key ON public.beta_access_codes USING btree (upper(replace(code, ' '::text, ''::text)));


--
-- Name: beta_access_redemptions_code_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX beta_access_redemptions_code_id_idx ON public.beta_access_redemptions USING btree (code_id);


--
-- Name: contact_messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_messages_created_at_idx ON public.contact_messages USING btree (created_at DESC);


--
-- Name: diagnoses_anon_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX diagnoses_anon_key_idx ON public.diagnoses USING btree (anon_key) WHERE (anon_key IS NOT NULL);


--
-- Name: diagnoses_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX diagnoses_user_id_created_at_idx ON public.diagnoses USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);


--
-- Name: diagnosis_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX diagnosis_events_created_at_idx ON public.diagnosis_events USING btree (created_at DESC);


--
-- Name: diagnosis_events_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX diagnosis_events_session_id_idx ON public.diagnosis_events USING btree (session_id);


--
-- Name: diagnosis_funnel_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX diagnosis_funnel_contact_idx ON public.diagnosis_funnel USING btree (first_contact_at) WHERE (first_contact_at IS NOT NULL);


--
-- Name: diagnosis_funnel_delivered_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX diagnosis_funnel_delivered_idx ON public.diagnosis_funnel USING btree (delivered_at) WHERE (delivered_at IS NOT NULL);


--
-- Name: diagnosis_funnel_matches_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX diagnosis_funnel_matches_idx ON public.diagnosis_funnel USING btree (matches_shown_at) WHERE (matches_shown_at IS NOT NULL);


--
-- Name: diagnosis_history_diagnosis_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX diagnosis_history_diagnosis_id_idx ON public.diagnosis_history USING btree (diagnosis_id);


--
-- Name: feature_announcements_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_announcements_published_idx ON public.feature_announcements USING btree (published_at DESC) WHERE (published_at IS NOT NULL);


--
-- Name: geocode_cache_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX geocode_cache_created_at_idx ON public.geocode_cache USING btree (created_at DESC);


--
-- Name: idx_ai_model_pricing_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_model_pricing_created_by ON public.ai_model_pricing USING btree (created_by);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_event_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_event_action ON public.audit_logs USING btree (event_type, action);


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_conversations_diagnosis_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_diagnosis_gin ON public.diagnoses USING gin (diagnosis);


--
-- Name: idx_conversations_providers_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_providers_gin ON public.diagnoses USING gin (providers);


--
-- Name: idx_conversations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_user_id ON public.diagnoses USING btree (user_id);


--
-- Name: idx_credit_notes_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_invoice_id ON public.credit_notes USING btree (invoice_id);


--
-- Name: idx_diagnoses_has_clarification_questions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnoses_has_clarification_questions ON public.diagnoses USING btree (clarification_question_count) WHERE (clarification_question_count > 0);


--
-- Name: idx_diagnoses_is_direct_match; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnoses_is_direct_match ON public.diagnoses USING btree (created_at DESC) WHERE (is_direct_match = true);


--
-- Name: idx_diagnoses_requires_clarification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnoses_requires_clarification ON public.diagnoses USING btree (requires_clarification) WHERE (requires_clarification = true);


--
-- Name: idx_diagnosis_usage_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnosis_usage_date ON public.diagnosis_usage USING btree (date);


--
-- Name: idx_directions_cache_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_directions_cache_created_at ON public.directions_cache USING btree (created_at);


--
-- Name: idx_edit_tokens_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_edit_tokens_application_id ON public.provider_application_edit_tokens USING btree (provider_application_id);


--
-- Name: idx_edit_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_edit_tokens_token_hash ON public.provider_application_edit_tokens USING btree (token_hash);


--
-- Name: idx_email_suppressions_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_suppressions_email ON public.email_suppressions USING btree (email);


--
-- Name: idx_geocode_cache_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geocode_cache_created_at ON public.geocode_cache USING btree (created_at);


--
-- Name: idx_invoices_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer_id ON public.invoices USING btree (customer_id);


--
-- Name: idx_invoices_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_job_id ON public.invoices USING btree (job_id);


--
-- Name: idx_invoices_quote_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_quote_id ON public.invoices USING btree (quote_id);


--
-- Name: idx_job_outcome_tokens_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_outcome_tokens_provider_id ON public.job_outcome_tokens USING btree (provider_id);


--
-- Name: idx_job_outcomes_token_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_outcomes_token_id ON public.job_outcomes USING btree (token_id);


--
-- Name: idx_jobs_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_assigned_to ON public.jobs USING btree (assigned_to);


--
-- Name: idx_jobs_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_customer_id ON public.jobs USING btree (customer_id);


--
-- Name: idx_lead_contact_consents_diagnosis_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_contact_consents_diagnosis_id ON public.lead_contact_consents USING btree (diagnosis_id);


--
-- Name: idx_lead_states_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_states_assigned_to ON public.lead_states USING btree (assigned_to);


--
-- Name: idx_provider_applications_applicant_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_applications_applicant_ip ON public.provider_applications USING btree (applicant_ip);


--
-- Name: idx_provider_applications_enrichment_queued; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_applications_enrichment_queued ON public.provider_applications USING btree (enrichment_queued_at) WHERE (enrichment_status = 'queued'::text);


--
-- Name: idx_provider_applications_matched_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_applications_matched_provider_id ON public.provider_applications USING btree (matched_provider_id);


--
-- Name: idx_provider_applications_resubmission_of; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_applications_resubmission_of ON public.provider_applications USING btree (resubmission_of);


--
-- Name: idx_provider_applications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_applications_user_id ON public.provider_applications USING btree (user_id);


--
-- Name: idx_provider_claims_reviewed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_claims_reviewed_by ON public.provider_claims USING btree (reviewed_by);


--
-- Name: idx_provider_contact_events_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_contact_events_conversation_id ON public.provider_contact_events USING btree (conversation_id);


--
-- Name: idx_provider_contact_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_contact_events_created_at ON public.provider_contact_events USING btree (created_at DESC);


--
-- Name: idx_provider_contact_events_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_contact_events_provider_id ON public.provider_contact_events USING btree (provider_id);


--
-- Name: idx_provider_customers_homeowner_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_customers_homeowner_user_id ON public.provider_customers USING btree (homeowner_user_id);


--
-- Name: idx_provider_images_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_images_provider_id ON public.provider_images USING btree (provider_id);


--
-- Name: idx_provider_images_provider_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_images_provider_sort ON public.provider_images USING btree (provider_id, sort_order, created_at DESC);


--
-- Name: idx_provider_members_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_members_invited_by ON public.provider_members USING btree (invited_by);


--
-- Name: idx_provider_notification_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_notification_preferences_user_id ON public.provider_notification_preferences USING btree (user_id);


--
-- Name: idx_provider_search_cache_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_search_cache_created_at ON public.provider_search_cache USING btree (created_at);


--
-- Name: idx_providers_google_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_providers_google_place_id ON public.providers USING btree (google_place_id) WHERE (google_place_id IS NOT NULL);


--
-- Name: idx_providers_merged_into; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_providers_merged_into ON public.providers USING btree (merged_into);


--
-- Name: idx_providers_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_providers_name_trgm ON public.providers USING gin (name extensions.gin_trgm_ops);


--
-- Name: idx_providers_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_providers_source ON public.providers USING btree (source);


--
-- Name: idx_quotes_contact_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_contact_event_id ON public.quotes USING btree (contact_event_id);


--
-- Name: idx_quotes_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_customer_id ON public.quotes USING btree (customer_id);


--
-- Name: idx_reviews_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_provider_id ON public.reviews USING btree (provider_id);


--
-- Name: idx_reviews_published_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_published_at ON public.reviews USING btree (published_at);


--
-- Name: idx_reviews_reviewer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_reviewer_user_id ON public.reviews USING btree (reviewer_user_id);


--
-- Name: idx_reviews_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_source ON public.reviews USING btree (source);


--
-- Name: idx_reviews_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_status ON public.reviews USING btree (status);


--
-- Name: idx_rotation_tokens_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rotation_tokens_week ON public.provider_rotation_tokens USING btree (week_key);


--
-- Name: idx_whatsapp_sessions_active_diagnosis_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_sessions_active_diagnosis_id ON public.whatsapp_sessions USING btree (active_diagnosis_id);


--
-- Name: invoice_items_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_items_invoice_idx ON public.invoice_items USING btree (invoice_id);


--
-- Name: invoices_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_provider_idx ON public.invoices USING btree (provider_id);


--
-- Name: job_outcome_tokens_contact_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX job_outcome_tokens_contact_event_idx ON public.job_outcome_tokens USING btree (contact_event_id);


--
-- Name: job_outcomes_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX job_outcomes_provider_idx ON public.job_outcomes USING btree (provider_id);


--
-- Name: jobs_contact_event_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX jobs_contact_event_uniq ON public.jobs USING btree (contact_event_id) WHERE (contact_event_id IS NOT NULL);


--
-- Name: jobs_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_provider_idx ON public.jobs USING btree (provider_id);


--
-- Name: lead_contact_consents_provider_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_contact_consents_provider_active_idx ON public.lead_contact_consents USING btree (provider_id) WHERE (revoked_at IS NULL);


--
-- Name: lead_contact_consents_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_contact_consents_user_idx ON public.lead_contact_consents USING btree (user_id);


--
-- Name: onboarding_place_details_cache_fetched_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_place_details_cache_fetched_at_idx ON public.onboarding_place_details_cache USING btree (fetched_at DESC);


--
-- Name: provider_applications_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX provider_applications_email_key ON public.provider_applications USING btree (email);


--
-- Name: provider_cache_google_place_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_cache_google_place_id_idx ON public.provider_cache USING btree (google_place_id);


--
-- Name: provider_cache_provider_id_cache_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_cache_provider_id_cache_version_idx ON public.provider_cache USING btree (provider_id, cache_version);


--
-- Name: provider_cache_provider_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_cache_provider_id_idx ON public.provider_cache USING btree (provider_id);


--
-- Name: provider_cache_scrape_status_scraped_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_cache_scrape_status_scraped_at_idx ON public.provider_cache USING btree (scrape_status, scraped_at);


--
-- Name: provider_claims_one_pending_per_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX provider_claims_one_pending_per_provider ON public.provider_claims USING btree (provider_id) WHERE (status = 'pending'::text);


--
-- Name: provider_claims_one_pending_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX provider_claims_one_pending_per_user ON public.provider_claims USING btree (user_id) WHERE (status = 'pending'::text);


--
-- Name: provider_claims_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_claims_status_idx ON public.provider_claims USING btree (status, created_at DESC);


--
-- Name: provider_customers_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_customers_provider_idx ON public.provider_customers USING btree (provider_id);


--
-- Name: provider_members_invited_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_members_invited_email_idx ON public.provider_members USING btree (lower(invited_email)) WHERE (invited_email IS NOT NULL);


--
-- Name: provider_members_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_members_provider_idx ON public.provider_members USING btree (provider_id);


--
-- Name: provider_members_provider_user_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX provider_members_provider_user_uniq ON public.provider_members USING btree (provider_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: provider_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_members_user_idx ON public.provider_members USING btree (user_id);


--
-- Name: provider_profile_views_diagnosis_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_profile_views_diagnosis_idx ON public.provider_profile_views USING btree (diagnosis_id) WHERE (diagnosis_id IS NOT NULL);


--
-- Name: provider_profile_views_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provider_profile_views_provider_idx ON public.provider_profile_views USING btree (provider_id, created_at DESC);


--
-- Name: providers_enrichment_review_required_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX providers_enrichment_review_required_idx ON public.providers USING btree (enrichment_review_required) WHERE (enrichment_review_required = true);


--
-- Name: providers_google_place_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX providers_google_place_id_idx ON public.providers USING btree (google_place_id);


--
-- Name: providers_reviews_synced_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX providers_reviews_synced_at_idx ON public.providers USING btree (reviews_synced_at NULLS FIRST);


--
-- Name: providers_service_areas_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX providers_service_areas_idx ON public.providers USING gin (service_areas);


--
-- Name: providers_specialisations_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX providers_specialisations_idx ON public.providers USING gin (specialisations);


--
-- Name: quote_items_quote_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quote_items_quote_idx ON public.quote_items USING btree (quote_id);


--
-- Name: quotes_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_provider_idx ON public.quotes USING btree (provider_id);


--
-- Name: reviews_provider_id_source_source_ref_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reviews_provider_id_source_source_ref_uidx ON public.reviews USING btree (provider_id, source, source_ref);


--
-- Name: reviews_provider_source_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_provider_source_published_idx ON public.reviews USING btree (provider_id, source, published_at DESC);


--
-- Name: reviews_provider_source_ref_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reviews_provider_source_ref_unique ON public.reviews USING btree (provider_id, source, source_ref) WHERE (source_ref IS NOT NULL);


--
-- Name: saved_providers_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_providers_user_id_idx ON public.saved_providers USING btree (user_id);


--
-- Name: transcriptions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcriptions_created_at_idx ON public.transcriptions USING btree (created_at DESC);


--
-- Name: transcriptions_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcriptions_user_id_created_at_idx ON public.transcriptions USING btree (user_id, created_at DESC);


--
-- Name: whatsapp_sessions_last_message_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_sessions_last_message_at_idx ON public.whatsapp_sessions USING btree (last_message_at);


--
-- Name: whatsapp_sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_sessions_user_id_idx ON public.whatsapp_sessions USING btree (user_id);


--
-- Name: audit_logs audit_logs_deny_update_delete_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_logs_deny_update_delete_trigger BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_deny_update_delete();


--
-- Name: diagnoses diagnoses_archive_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER diagnoses_archive_trg BEFORE UPDATE ON public.diagnoses FOR EACH ROW EXECUTE FUNCTION public.diagnoses_archive_before_update();


--
-- Name: diagnosis_usage diagnosis_usage_preserve_first_seen_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER diagnosis_usage_preserve_first_seen_trg BEFORE INSERT OR UPDATE ON public.diagnosis_usage FOR EACH ROW EXECUTE FUNCTION public.diagnosis_usage_preserve_first_seen();


--
-- Name: job_outcomes trg_job_outcomes_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_job_outcomes_after_insert AFTER INSERT OR UPDATE OF rating ON public.job_outcomes FOR EACH ROW EXECUTE FUNCTION public.job_outcomes_after_change();


--
-- Name: diagnoses trg_set_primary_trade; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_primary_trade BEFORE INSERT OR UPDATE OF diagnosis ON public.diagnoses FOR EACH ROW EXECUTE FUNCTION public.set_primary_trade();


--
-- Name: ai_call_log ai_call_log_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_call_log
    ADD CONSTRAINT ai_call_log_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.diagnoses(id) ON DELETE SET NULL;


--
-- Name: ai_cost_events ai_cost_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_cost_events
    ADD CONSTRAINT ai_cost_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ai_model_pricing ai_model_pricing_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_model_pricing
    ADD CONSTRAINT ai_model_pricing_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: beta_access_redemptions beta_access_redemptions_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_access_redemptions
    ADD CONSTRAINT beta_access_redemptions_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.beta_access_codes(id) ON DELETE CASCADE;


--
-- Name: diagnoses conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnoses
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: credit_notes credit_notes_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: diagnosis_funnel diagnosis_funnel_diagnosis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_funnel
    ADD CONSTRAINT diagnosis_funnel_diagnosis_id_fkey FOREIGN KEY (diagnosis_id) REFERENCES public.diagnoses(id) ON DELETE CASCADE;


--
-- Name: diagnosis_history diagnosis_history_diagnosis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_history
    ADD CONSTRAINT diagnosis_history_diagnosis_id_fkey FOREIGN KEY (diagnosis_id) REFERENCES public.diagnoses(id) ON DELETE CASCADE;


--
-- Name: diagnosis_usage diagnosis_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_usage
    ADD CONSTRAINT diagnosis_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.provider_customers(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE SET NULL;


--
-- Name: job_outcome_tokens job_outcome_tokens_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_outcome_tokens
    ADD CONSTRAINT job_outcome_tokens_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: job_outcomes job_outcomes_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_outcomes
    ADD CONSTRAINT job_outcomes_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: job_outcomes job_outcomes_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_outcomes
    ADD CONSTRAINT job_outcomes_token_id_fkey FOREIGN KEY (token_id) REFERENCES public.job_outcome_tokens(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_contact_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_contact_event_id_fkey FOREIGN KEY (contact_event_id) REFERENCES public.provider_contact_events(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.provider_customers(id) ON DELETE SET NULL;


--
-- Name: jobs jobs_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: lead_contact_consents lead_contact_consents_diagnosis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_contact_consents
    ADD CONSTRAINT lead_contact_consents_diagnosis_id_fkey FOREIGN KEY (diagnosis_id) REFERENCES public.diagnoses(id) ON DELETE SET NULL;


--
-- Name: lead_contact_consents lead_contact_consents_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_contact_consents
    ADD CONSTRAINT lead_contact_consents_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: lead_contact_consents lead_contact_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_contact_consents
    ADD CONSTRAINT lead_contact_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lead_share_consent_settings lead_share_consent_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_share_consent_settings
    ADD CONSTRAINT lead_share_consent_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lead_states lead_states_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_states
    ADD CONSTRAINT lead_states_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lead_states lead_states_contact_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_states
    ADD CONSTRAINT lead_states_contact_event_id_fkey FOREIGN KEY (contact_event_id) REFERENCES public.provider_contact_events(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: provider_application_edit_tokens provider_application_edit_tokens_provider_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_application_edit_tokens
    ADD CONSTRAINT provider_application_edit_tokens_provider_application_id_fkey FOREIGN KEY (provider_application_id) REFERENCES public.provider_applications(id) ON DELETE CASCADE;


--
-- Name: provider_applications provider_applications_matched_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_applications
    ADD CONSTRAINT provider_applications_matched_provider_id_fkey FOREIGN KEY (matched_provider_id) REFERENCES public.providers(id) ON DELETE SET NULL;


--
-- Name: provider_applications provider_applications_resubmission_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_applications
    ADD CONSTRAINT provider_applications_resubmission_of_fkey FOREIGN KEY (resubmission_of) REFERENCES public.provider_applications(id) ON DELETE SET NULL;


--
-- Name: provider_applications provider_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_applications
    ADD CONSTRAINT provider_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: provider_branding provider_branding_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_branding
    ADD CONSTRAINT provider_branding_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_cache provider_cache_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_cache
    ADD CONSTRAINT provider_cache_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_claims provider_claims_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_claims
    ADD CONSTRAINT provider_claims_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_claims provider_claims_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_claims
    ADD CONSTRAINT provider_claims_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: provider_claims provider_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_claims
    ADD CONSTRAINT provider_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: provider_contact_events provider_contact_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_contact_events
    ADD CONSTRAINT provider_contact_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.diagnoses(id) ON DELETE CASCADE;


--
-- Name: provider_contact_events provider_contact_events_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_contact_events
    ADD CONSTRAINT provider_contact_events_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_customers provider_customers_homeowner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_customers
    ADD CONSTRAINT provider_customers_homeowner_user_id_fkey FOREIGN KEY (homeowner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: provider_customers provider_customers_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_customers
    ADD CONSTRAINT provider_customers_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_document_counters provider_document_counters_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_document_counters
    ADD CONSTRAINT provider_document_counters_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_images provider_images_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_images
    ADD CONSTRAINT provider_images_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_members provider_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_members
    ADD CONSTRAINT provider_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: provider_members provider_members_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_members
    ADD CONSTRAINT provider_members_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_members provider_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_members
    ADD CONSTRAINT provider_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: provider_notification_preferences provider_notification_preferences_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notification_preferences
    ADD CONSTRAINT provider_notification_preferences_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_notification_preferences provider_notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_notification_preferences
    ADD CONSTRAINT provider_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: provider_profile_views provider_profile_views_diagnosis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_profile_views
    ADD CONSTRAINT provider_profile_views_diagnosis_id_fkey FOREIGN KEY (diagnosis_id) REFERENCES public.diagnoses(id) ON DELETE SET NULL;


--
-- Name: provider_profile_views provider_profile_views_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_profile_views
    ADD CONSTRAINT provider_profile_views_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: provider_rotation_tokens provider_rotation_tokens_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_rotation_tokens
    ADD CONSTRAINT provider_rotation_tokens_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: providers providers_merged_into_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.providers(id) ON DELETE SET NULL;


--
-- Name: quote_items quote_items_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_items
    ADD CONSTRAINT quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE;


--
-- Name: quotes quotes_contact_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_contact_event_id_fkey FOREIGN KEY (contact_event_id) REFERENCES public.provider_contact_events(id) ON DELETE SET NULL;


--
-- Name: quotes quotes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.provider_customers(id) ON DELETE SET NULL;


--
-- Name: quotes quotes_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_reviewer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewer_user_id_fkey FOREIGN KEY (reviewer_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: saved_providers saved_providers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_providers
    ADD CONSTRAINT saved_providers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: transcriptions transcriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcriptions
    ADD CONSTRAINT transcriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_data_consent user_data_consent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_data_consent
    ADD CONSTRAINT user_data_consent_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_sessions whatsapp_sessions_active_diagnosis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_sessions
    ADD CONSTRAINT whatsapp_sessions_active_diagnosis_id_fkey FOREIGN KEY (active_diagnosis_id) REFERENCES public.diagnoses(id) ON DELETE SET NULL;


--
-- Name: whatsapp_sessions whatsapp_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_sessions
    ADD CONSTRAINT whatsapp_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs Audit logs allow select own or service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit logs allow select own or service" ON public.audit_logs FOR SELECT USING (((( SELECT auth.role() AS role) = 'service_role'::text) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: audit_logs Audit logs deny delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit logs deny delete" ON public.audit_logs FOR DELETE USING (false);


--
-- Name: audit_logs Audit logs deny update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit logs deny update" ON public.audit_logs FOR UPDATE USING (false);


--
-- Name: audit_logs Audit logs insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit logs insert own" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: audit_logs Audit logs no anon read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit logs no anon read" ON public.audit_logs FOR SELECT USING (false);


--
-- Name: profiles Profiles insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles insert own" ON public.profiles FOR INSERT WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: profiles Profiles select own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles select own" ON public.profiles FOR SELECT USING (((id = ( SELECT auth.uid() AS uid)) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: profiles Profiles update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles update own" ON public.profiles FOR UPDATE USING (((id = ( SELECT auth.uid() AS uid)) OR (user_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: directions_cache Public Read Directions Cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public Read Directions Cache" ON public.directions_cache FOR SELECT USING (true);


--
-- Name: geocode_cache Public Read Geocode Cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public Read Geocode Cache" ON public.geocode_cache FOR SELECT USING (true);


--
-- Name: user_data_consent Users manage own data consent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own data consent" ON public.user_data_consent USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: notification_preferences Users manage own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: saved_providers Users manage their own saves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage their own saves" ON public.saved_providers USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: admin_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_call_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_call_log ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_cost_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_cost_events ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_model_pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_model_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_model_pricing ai_model_pricing_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_model_pricing_admin_select ON public.ai_model_pricing FOR SELECT TO authenticated USING (false);


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: beta_access_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beta_access_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: beta_access_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beta_access_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_messages contact_messages_insert_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_messages_insert_anon ON public.contact_messages FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: cost_estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cost_estimates ENABLE ROW LEVEL SECURITY;

--
-- Name: cost_estimates cost_estimates_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_estimates_public_read ON public.cost_estimates FOR SELECT TO authenticated, anon USING (true);


--
-- Name: credit_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_notes credit_notes_claimed_pro_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY credit_notes_claimed_pro_rw ON public.credit_notes TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.invoices i
     JOIN public.providers p ON ((p.id = i.provider_id)))
  WHERE ((i.id = credit_notes.invoice_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.invoices i
     JOIN public.providers p ON ((p.id = i.provider_id)))
  WHERE ((i.id = credit_notes.invoice_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: diagnoses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;

--
-- Name: diagnoses diagnoses_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY diagnoses_delete_owner ON public.diagnoses FOR DELETE TO authenticated, anon USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: diagnoses diagnoses_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY diagnoses_insert_owner ON public.diagnoses FOR INSERT TO authenticated, anon WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: diagnoses diagnoses_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY diagnoses_select_owner ON public.diagnoses FOR SELECT TO authenticated, anon USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: diagnoses diagnoses_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY diagnoses_update_owner ON public.diagnoses FOR UPDATE TO authenticated, anon USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: diagnosis_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.diagnosis_events ENABLE ROW LEVEL SECURITY;

--
-- Name: diagnosis_funnel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.diagnosis_funnel ENABLE ROW LEVEL SECURITY;

--
-- Name: diagnosis_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.diagnosis_history ENABLE ROW LEVEL SECURITY;

--
-- Name: diagnosis_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.diagnosis_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: directions_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directions_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: email_suppressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_announcements feature_announcements_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY feature_announcements_public_read ON public.feature_announcements FOR SELECT TO authenticated, anon USING (((published_at IS NOT NULL) AND (published_at <= now())));


--
-- Name: geocode_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items invoice_items_claimed_pro_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_items_claimed_pro_rw ON public.invoice_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.invoices i
     JOIN public.providers p ON ((p.id = i.provider_id)))
  WHERE ((i.id = invoice_items.invoice_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.invoices i
     JOIN public.providers p ON ((p.id = i.provider_id)))
  WHERE ((i.id = invoice_items.invoice_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_claimed_pro_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_claimed_pro_rw ON public.invoices TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = invoices.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = invoices.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: job_outcome_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_outcome_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: job_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs jobs_claimed_pro_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY jobs_claimed_pro_rw ON public.jobs TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = jobs.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = jobs.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: lead_contact_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_contact_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_contact_consents lead_contact_consents_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_contact_consents_select_own ON public.lead_contact_consents FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: lead_contact_consents lead_contact_consents_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_contact_consents_update_own ON public.lead_contact_consents FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: lead_share_consent_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_share_consent_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_share_consent_settings lead_share_consent_settings_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_share_consent_settings_insert_own ON public.lead_share_consent_settings FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: lead_share_consent_settings lead_share_consent_settings_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_share_consent_settings_select_own ON public.lead_share_consent_settings FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: lead_share_consent_settings lead_share_consent_settings_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_share_consent_settings_update_own ON public.lead_share_consent_settings FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: lead_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_states ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_states lead_states_claimed_pro_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_states_claimed_pro_rw ON public.lead_states TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.provider_contact_events e
     JOIN public.providers p ON ((p.id = e.provider_id)))
  WHERE ((e.id = lead_states.contact_event_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.provider_contact_events e
     JOIN public.providers p ON ((p.id = e.provider_id)))
  WHERE ((e.id = lead_states.contact_event_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: job_outcome_tokens no_public_access_job_outcome_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_public_access_job_outcome_tokens ON public.job_outcome_tokens USING (false);


--
-- Name: job_outcomes no_public_access_job_outcomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_public_access_job_outcomes ON public.job_outcomes USING (false);


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_place_details_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_place_details_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_application_edit_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_application_edit_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_applications provider_applications_insert_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_applications_insert_anon ON public.provider_applications FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: provider_branding; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_branding ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_branding provider_branding_claimed_pro_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_branding_claimed_pro_rw ON public.provider_branding TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = provider_branding.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = provider_branding.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: provider_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_claims provider_claims_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_claims_select_own ON public.provider_claims FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: provider_contact_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_contact_events ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_customers provider_customers_claimed_pro_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_customers_claimed_pro_rw ON public.provider_customers TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = provider_customers.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = provider_customers.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: provider_document_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_document_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_images ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_images provider_images: public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "provider_images: public read" ON public.provider_images FOR SELECT USING (true);


--
-- Name: provider_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_members ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_members provider_members_read_own_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_members_read_own_team ON public.provider_members FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = provider_members.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: provider_notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_notification_preferences provider_notification_prefs_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY provider_notification_prefs_own ON public.provider_notification_preferences TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: provider_profile_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_profile_views ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_rotation_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_rotation_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_search_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_search_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

--
-- Name: providers providers_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY providers_public_select ON public.providers FOR SELECT TO authenticated, anon USING ((COALESCE(is_active, true) AND ((source = 'google'::text) OR (is_verified = true))));


--
-- Name: quote_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

--
-- Name: quote_items quote_items_claimed_pro_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_items_claimed_pro_rw ON public.quote_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.quotes q
     JOIN public.providers p ON ((p.id = q.provider_id)))
  WHERE ((q.id = quote_items.quote_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.quotes q
     JOIN public.providers p ON ((p.id = q.provider_id)))
  WHERE ((q.id = quote_items.quote_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: quotes quotes_claimed_pro_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotes_claimed_pro_rw ON public.quotes TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = quotes.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = quotes.provider_id) AND (p.claimed_by_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews reviews_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reviews_public_select ON public.reviews FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.providers p
  WHERE ((p.id = reviews.provider_id) AND COALESCE(p.is_active, true)))));


--
-- Name: saved_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: email_suppressions service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.email_suppressions USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: transcriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transcriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_data_consent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_data_consent ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


