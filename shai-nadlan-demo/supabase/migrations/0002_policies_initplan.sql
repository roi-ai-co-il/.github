-- Wrap auth.uid() as (select auth.uid()) in all policies so Postgres evaluates
-- it once per statement (initplan) instead of per row.

do $$
declare
  t text;
begin
  foreach t in array array['properties','property_images','tenants','leases'] loop
    execute format('alter policy "%1$s_select_own" on public.%1$I using (owner = (select auth.uid()))', t);
    execute format('alter policy "%1$s_insert_own" on public.%1$I with check (owner = (select auth.uid()))', t);
    execute format('alter policy "%1$s_update_own" on public.%1$I using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', t);
    execute format('alter policy "%1$s_delete_own" on public.%1$I using (owner = (select auth.uid()))', t);
  end loop;
end $$;
