-- The migrations this database has actually run, so a gate can compare them
-- against what the repository contains. Versions and names only — the SQL
-- itself stays where it is.
--
-- This exists because the two had silently diverged: 29 applied, 9 committed.
-- Nothing failed, nothing warned, and every offline reading of the schema was
-- quietly wrong for weeks.
create or replace function public.applied_migrations()
returns table (version text, name text)
language sql
stable
security definer
set search_path = pg_catalog, supabase_migrations
as $$
  select version, coalesce(name, '') from supabase_migrations.schema_migrations
  order by version;
$$;

revoke all on function public.applied_migrations() from public;
grant execute on function public.applied_migrations() to authenticated;
