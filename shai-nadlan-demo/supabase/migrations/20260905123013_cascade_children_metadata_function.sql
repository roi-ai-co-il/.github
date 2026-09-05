-- Which tables a delete cascades into, read from the live catalog.
--
-- The delete-warning gate first derived this graph from the migrations in the
-- repository and got the wrong answer — it reported that receipts and
-- property_documents do not cascade from a property, when the database says
-- they do. The repository holds 9 migrations; the database has recorded 29.
-- A checked-in migration set is a snapshot, and reasoning about the schema
-- from it is reasoning about a stale copy.
--
-- Returns schema shape only — table names and nothing else. No row is read, so
-- there is nothing here a portfolio member could not already see by looking at
-- the app. SECURITY DEFINER because pg_constraint is not readable through
-- PostgREST as an ordinary caller; the search_path is pinned so the body
-- cannot be redirected at a resolvable name.
create or replace function public.cascade_children(p_table text)
returns table (child text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with recursive edges as (
    select
      child_ns.nspname || '.' || child.relname  as child_table,
      child.relname                             as child_name,
      parent.relname                            as parent_name
    from pg_constraint c
    join pg_class child       on child.oid = c.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent      on parent.oid = c.confrelid
    join pg_namespace p_ns    on p_ns.oid = parent.relnamespace
    where c.contype = 'f'
      and c.confdeltype = 'c'          -- ON DELETE CASCADE
      and child_ns.nspname = 'public'
      and p_ns.nspname = 'public'
  ),
  walk as (
    select child_name, parent_name from edges where parent_name = p_table
    union
    select e.child_name, e.parent_name
    from edges e join walk w on e.parent_name = w.child_name
  )
  select distinct child_name from walk;
$$;

revoke all on function public.cascade_children(text) from public;
grant execute on function public.cascade_children(text) to authenticated;
