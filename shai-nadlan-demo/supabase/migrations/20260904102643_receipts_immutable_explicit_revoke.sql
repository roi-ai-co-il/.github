-- Listing three privileges in a GRANT does not remove a fourth. Supabase
-- applies ALTER DEFAULT PRIVILEGES granting ALL on every new table in public
-- to anon/authenticated/service_role, so `grant select, insert, delete`
-- added nothing and UPDATE was already there. Only RLS was stopping an edit,
-- and an invariant this specific deserves to be expressed where it fails
-- loudly rather than by the absence of a policy.
revoke update on public.receipts from authenticated, anon;

-- anon has no business with either of these tables at all; RLS was the only
-- thing standing between the public key and them.
revoke all on public.receipts from anon;
revoke all on public.vendors  from anon;
revoke all on public.digest_settings from anon;
