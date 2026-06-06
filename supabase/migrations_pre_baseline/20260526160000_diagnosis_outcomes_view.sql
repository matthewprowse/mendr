-- Phase 0 of the Diagnosis Architecture Hardening Plan.
-- See: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 0
--
-- Purpose: classify every diagnosis row into a single outcome state so we can
-- measure clarification rates, force-commit rates, and abandonment from one
-- query rather than from JSONB grep.
--
-- States (mirrors the plan's enumeration):
--   committed_high_conf            confidence >= 85, no clarification involved
--   committed_low_conf             commit path, no clarification, confidence < 85
--   clarification_resolved         clarification opened on round 1, resolved (committed) before round 2
--   clarification_force_committed  clarification ran >=1 round, ended at force-commit on round 2
--   clarification_open             clarification still open and within the abandonment window
--   clarification_abandoned        clarification still open, no activity for >10 minutes
--   rejected                       image not home-related (diagnosis->>'rejected' = true)
--   unserviced                     home-related but no trade matches (diagnosis->>'unserviced' = true)
--   unknown                        diagnosis JSON present but classification did not match any branch
--
-- The view is read-only and idempotent. Drop+recreate is safe.

DROP VIEW IF EXISTS public.diagnosis_outcomes;

CREATE VIEW public.diagnosis_outcomes AS
SELECT
    d.id,
    d.user_id,
    d.created_at,
    d.updated_at,
    d.diagnosis ->> 'trade'           AS trade,
    d.diagnosis ->> 'subcategory_id'  AS subcategory_id,
    NULLIF(d.diagnosis ->> 'confidence', '')::int AS confidence,
    d.clarification_round,
    d.requires_clarification,
    COALESCE((d.diagnosis ->> 'rejected')::boolean,   false) AS rejected,
    COALESCE((d.diagnosis ->> 'unserviced')::boolean, false) AS unserviced,
    CASE
        WHEN COALESCE((d.diagnosis ->> 'rejected')::boolean, false)   THEN 'rejected'
        WHEN COALESCE((d.diagnosis ->> 'unserviced')::boolean, false) THEN 'unserviced'
        WHEN d.requires_clarification IS TRUE
             AND now() - d.updated_at > interval '10 minutes'         THEN 'clarification_abandoned'
        WHEN d.requires_clarification IS TRUE                         THEN 'clarification_open'
        WHEN d.clarification_round >= 2
             AND d.requires_clarification IS FALSE                    THEN 'clarification_force_committed'
        WHEN d.clarification_round >= 1
             AND d.requires_clarification IS FALSE                    THEN 'clarification_resolved'
        WHEN NULLIF(d.diagnosis ->> 'confidence', '')::int >= 85      THEN 'committed_high_conf'
        WHEN d.diagnosis IS NOT NULL                                  THEN 'committed_low_conf'
        ELSE 'unknown'
    END AS outcome
FROM public.diagnoses d
WHERE d.diagnosis IS NOT NULL;

COMMENT ON VIEW public.diagnosis_outcomes IS
    'Phase 0 of Diagnosis Architecture Hardening Plan. Classifies each diagnoses row into one outcome state for Phase 0/9 metrics queries.';
