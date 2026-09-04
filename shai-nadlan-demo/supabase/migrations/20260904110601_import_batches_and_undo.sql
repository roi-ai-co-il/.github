-- An import is one act, and it must be undoable as one act.
-- Every row a batch created carries its id, so "בטל את הייבוא" is a delete by
-- batch rather than 28 manual deletions. Rows created by hand carry NULL and
-- can never be swept up by an undo.

create table if not exists public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  source      text not null default 'file',       -- 'file' | 'paste'
  filename    text,
  -- What the batch actually wrote, counted at write time by the client that
  -- wrote it. Kept for the summary screen and for the undo confirmation.
  counts      jsonb not null default '{}'::jsonb,
  undone_at   timestamptz
);

alter table public.properties add column if not exists import_batch_id uuid
  references public.import_batches(id) on delete set null;
alter table public.tenants    add column if not exists import_batch_id uuid
  references public.import_batches(id) on delete set null;
alter table public.leases     add column if not exists import_batch_id uuid
  references public.import_batches(id) on delete set null;

create index if not exists properties_import_batch_idx on public.properties(import_batch_id)
  where import_batch_id is not null;
create index if not exists tenants_import_batch_idx    on public.tenants(import_batch_id)
  where import_batch_id is not null;
create index if not exists leases_import_batch_idx     on public.leases(import_batch_id)
  where import_batch_id is not null;

alter table public.import_batches enable row level security;

drop policy if exists import_batches_select_member on public.import_batches;
drop policy if exists import_batches_insert_member on public.import_batches;
drop policy if exists import_batches_update_member on public.import_batches;
drop policy if exists import_batches_delete_member on public.import_batches;

create policy import_batches_select_member on public.import_batches
  for select to authenticated using (public.is_portfolio_member());
create policy import_batches_insert_member on public.import_batches
  for insert to authenticated with check (public.is_portfolio_member() and owner = (select auth.uid()));
create policy import_batches_update_member on public.import_batches
  for update to authenticated using (public.is_portfolio_member()) with check (public.is_portfolio_member());
create policy import_batches_delete_member on public.import_batches
  for delete to authenticated using (public.is_portfolio_member());

-- RLS is not a GRANT: without this, PostgREST answers 401 before any policy
-- is evaluated. This repo has shipped that exact bug once already.
grant select, insert, update, delete on public.import_batches to authenticated;
revoke all on public.import_batches from anon;
