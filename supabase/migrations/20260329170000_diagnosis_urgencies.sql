-- Normalized urgency reference data for diagnosis results.
CREATE TABLE IF NOT EXISTS diagnosis_urgencies (
    key                     text PRIMARY KEY,
    label                   text NOT NULL,
    description             text NOT NULL,
    target_resolution_hours integer NOT NULL,
    sort_order              integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now()
);

INSERT INTO diagnosis_urgencies (key, label, description, target_resolution_hours, sort_order)
VALUES
    ('immediate', 'Immediate', 'Address immediately to reduce safety risk or rapid damage.', 4, 1),
    ('urgent', 'Urgent', 'Arrange repair as soon as possible, ideally within 24 hours.', 24, 2),
    ('soon', 'Soon', 'Book repair in the next few days to avoid escalation.', 72, 3),
    ('planned', 'Planned', 'Low urgency, can be scheduled as routine maintenance.', 336, 4)
ON CONFLICT (key) DO UPDATE
SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    target_resolution_hours = EXCLUDED.target_resolution_hours,
    sort_order = EXCLUDED.sort_order;

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS urgency_key text REFERENCES diagnosis_urgencies(key);
