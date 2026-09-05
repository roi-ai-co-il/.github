-- RLS is not a grant. A table with policies but no GRANT answers PostgREST
-- with 401 before any policy is ever evaluated — which is exactly what the
-- three new tables did: `properties` returned 200 while `owner_entities` and
-- `property_documents` returned 401, and both tsc and the production build
-- were clean throughout. Caught only by calling the live API.
--
-- Mirrors the existing table-level grants on public.properties. `anon` gets
-- nothing: every one of these is portfolio data behind a login.

grant select, insert, update, delete on public.property_documents to authenticated;
grant select, insert, update, delete on public.owner_entities     to authenticated;
grant select, insert, update, delete on public.buildings          to authenticated;

revoke all on public.property_documents from anon;
revoke all on public.owner_entities     from anon;
revoke all on public.buildings          from anon;
