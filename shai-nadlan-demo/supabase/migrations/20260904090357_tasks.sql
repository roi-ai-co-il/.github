-- Tasks, the second of the two menu items Shai saw in Nadlanitor.
--
-- Their app added "משימות" in 1.0.11 and keeps a separate "לוח מעקב שכ״ד"
-- (rent tracking board), which is what their calendar actually is. So the two
-- are different things and we build them differently: the calendar needs NO new
-- table — lease_payments already carries due dates — while a task is genuinely
-- new information nobody records today.
--
-- Deliberately small. A task here is a thing to do, optionally about a property,
-- optionally with a date. No assignee (single-owner portfolio), no priority
-- field (a date already orders the work), no status enum (done or not).

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid(),
  title       text not null check (length(btrim(title)) > 0),
  property_id uuid references public.properties(id) on delete set null,
  due_date    date,
  done        boolean not null default false,
  done_at     timestamptz,
  notes       text,
  created_at  timestamptz not null default now()
);

-- Open tasks first, soonest first, undated last — the order the list renders in.
create index if not exists tasks_open_idx
  on public.tasks (done, due_date nulls last, created_at desc);
create index if not exists tasks_property_idx
  on public.tasks (property_id) where property_id is not null;

alter table public.tasks enable row level security;

drop policy if exists tasks_select_member on public.tasks;
create policy tasks_select_member on public.tasks
  for select using (public.is_portfolio_member());
drop policy if exists tasks_insert_member on public.tasks;
create policy tasks_insert_member on public.tasks
  for insert with check (public.is_portfolio_member() and owner = auth.uid());
drop policy if exists tasks_update_member on public.tasks;
create policy tasks_update_member on public.tasks
  for update using (public.is_portfolio_member());
drop policy if exists tasks_delete_member on public.tasks;
create policy tasks_delete_member on public.tasks
  for delete using (public.is_portfolio_member());

-- RLS is not a GRANT: without this PostgREST answers 401 before any policy runs.
grant select, insert, update, delete on public.tasks to authenticated;
revoke all on public.tasks from anon;

-- Keep done_at honest rather than trusting the client to send it.
create or replace function public.tasks_stamp_done()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.done and not coalesce(old.done, false) then new.done_at := now();
  elsif not new.done then new.done_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_stamp_done_trg on public.tasks;
create trigger tasks_stamp_done_trg before insert or update on public.tasks
  for each row execute function public.tasks_stamp_done();
