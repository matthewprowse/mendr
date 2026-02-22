# Supabase setup

For chat and conversation persistence (saving messages and diagnosis to the cloud), run these in the **Supabase Dashboard → SQL Editor** in order:

1. **Schema** – run the entire `tables.sql` file (creates tables for conversations and messages).
2. **Policies** – run the entire `rls.sql` file (enables RLS for anonymous access).

No authentication is required; the app works without user accounts.
