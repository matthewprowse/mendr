-- Phase 2 of the Diagnosis Architecture Hardening Plan.
-- See: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 2
--
-- Adds `diagnosis_critique` JSONB column to `public.diagnoses`. Agent 3
-- (self-critique) writes here after every diagnose / refine call. Powers Phase
-- 8 stuck-loop detection, Phase 9 dashboard calibration tab, and Phase 13
-- meta-analyst pattern detection.
--
-- Column is nullable — historical diagnoses (pre-Phase-2) have no critique
-- (forward-only, per Matthew's decision on 2026-05-26).

ALTER TABLE public.diagnoses
    ADD COLUMN IF NOT EXISTS diagnosis_critique JSONB;

COMMENT ON COLUMN public.diagnoses.diagnosis_critique IS
    'Agent 3 (self-critique) output, written fire-and-forget after diagnose/refine completes. Shape: features/diagnosis/types.ts DiagnosisCritique. Phase 2 of Diagnosis Architecture Hardening Plan.';
