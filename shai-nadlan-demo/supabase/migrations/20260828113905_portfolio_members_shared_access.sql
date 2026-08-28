-- Shared portfolio: every row stays owner-stamped, but any member of
-- portfolio_members can read and manage the whole portfolio. Membership is
-- checked through a SECURITY DEFINER helper so table policies never query
-- an RLS-guarded table from inside another policy.
-- Applied to production 2026-08-28 (version 20260828113905).

create table if not exists public.portfolio_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.portfolio_members enable row level security;

create policy "members_select_self" on public.portfolio_members
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_portfolio_member()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.portfolio_members m where m.user_id = auth.uid());
$$;

revoke all on function public.is_portfolio_member() from public;
revoke all on function public.is_portfolio_member() from anon;
grant execute on function public.is_portfolio_member() to authenticated;

-- ── properties ──
drop policy if exists "properties_select_own" on public.properties;
drop policy if exists "properties_insert_own" on public.properties;
drop policy if exists "properties_update_own" on public.properties;
drop policy if exists "properties_delete_own" on public.properties;
create policy "properties_select_member" on public.properties
  for select to authenticated using (public.is_portfolio_member());
create policy "properties_insert_member" on public.properties
  for insert to authenticated with check (public.is_portfolio_member() and owner = auth.uid());
create policy "properties_update_member" on public.properties
  for update to authenticated using (public.is_portfolio_member()) with check (public.is_portfolio_member());
create policy "properties_delete_member" on public.properties
  for delete to authenticated using (public.is_portfolio_member());

-- ── property_images ──
drop policy if exists "property_images_select_own" on public.property_images;
drop policy if exists "property_images_insert_own" on public.property_images;
drop policy if exists "property_images_update_own" on public.property_images;
drop policy if exists "property_images_delete_own" on public.property_images;
create policy "property_images_select_member" on public.property_images
  for select to authenticated using (public.is_portfolio_member());
create policy "property_images_insert_member" on public.property_images
  for insert to authenticated with check (public.is_portfolio_member() and owner = auth.uid());
create policy "property_images_update_member" on public.property_images
  for update to authenticated using (public.is_portfolio_member()) with check (public.is_portfolio_member());
create policy "property_images_delete_member" on public.property_images
  for delete to authenticated using (public.is_portfolio_member());

-- ── tenants ──
drop policy if exists "tenants_select_own" on public.tenants;
drop policy if exists "tenants_insert_own" on public.tenants;
drop policy if exists "tenants_update_own" on public.tenants;
drop policy if exists "tenants_delete_own" on public.tenants;
create policy "tenants_select_member" on public.tenants
  for select to authenticated using (public.is_portfolio_member());
create policy "tenants_insert_member" on public.tenants
  for insert to authenticated with check (public.is_portfolio_member() and owner = auth.uid());
create policy "tenants_update_member" on public.tenants
  for update to authenticated using (public.is_portfolio_member()) with check (public.is_portfolio_member());
create policy "tenants_delete_member" on public.tenants
  for delete to authenticated using (public.is_portfolio_member());

-- ── leases ──
drop policy if exists "leases_select_own" on public.leases;
drop policy if exists "leases_insert_own" on public.leases;
drop policy if exists "leases_update_own" on public.leases;
drop policy if exists "leases_delete_own" on public.leases;
create policy "leases_select_member" on public.leases
  for select to authenticated using (public.is_portfolio_member());
create policy "leases_insert_member" on public.leases
  for insert to authenticated with check (public.is_portfolio_member() and owner = auth.uid());
create policy "leases_update_member" on public.leases
  for update to authenticated using (public.is_portfolio_member()) with check (public.is_portfolio_member());
create policy "leases_delete_member" on public.leases
  for delete to authenticated using (public.is_portfolio_member());
