-- Drop the shape check that required urgency_key in the diagnosis JSONB.
-- urgency_key has been removed from the AI classifier output.
ALTER TABLE public.diagnoses DROP CONSTRAINT IF EXISTS diagnoses_diagnosis_shape_check;

-- Re-add without urgency_key requirement.
ALTER TABLE public.diagnoses ADD CONSTRAINT diagnoses_diagnosis_shape_check CHECK (
    diagnosis IS NULL
    OR (
        jsonb_typeof(diagnosis) = 'object'
        AND diagnosis ? 'trade'
        AND diagnosis ? 'confidence'
    )
) NOT VALID;
