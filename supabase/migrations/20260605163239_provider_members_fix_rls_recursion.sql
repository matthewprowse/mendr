-- Phase 8: replace the self-referential provider_members SELECT policy, which
-- triggers "infinite recursion detected in policy" when queried directly. Team
-- rosters are served through service-role APIs that bypass RLS, so the policy
-- only needs to cover direct authenticated reads: the owner via
-- claimed_by_user_id, and a member reading their own row.

DROP POLICY IF EXISTS "provider_members_read_own_team" ON public.provider_members;

CREATE POLICY "provider_members_read_own_team" ON public.provider_members FOR SELECT TO authenticated
  USING (
    provider_members.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_members.provider_id AND p.claimed_by_user_id = auth.uid()
    )
  );
