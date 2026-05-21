-- RLS for contact_messages.
-- Anyone can submit a contact form (insert). No client-side reads — admin only via service_role.

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_messages_insert_anon
    ON public.contact_messages
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- No SELECT, UPDATE, or DELETE policies for anon/authenticated.
