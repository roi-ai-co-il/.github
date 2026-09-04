-- Monthly rent payments, one row per due month per lease.
-- Member-scoped exactly like the rest of the portfolio.
-- Applied to production 2026-08-28 (version 20260828140627).

create table if not exists public.lease_payments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  due_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  paid boolean not null default false,
  paid_date date,
  created_at timestamptz not null default now(),
  constraint lease_payments_unique_month unique (lease_id, due_date)
);

create index if not exists lease_payments_lease_idx on public.lease_payments(lease_id);
create index if not exists lease_payments_due_idx on public.lease_payments(due_date);

alter table public.lease_payments enable row level security;

create policy "lease_payments_select_member" on public.lease_payments
  for select to authenticated using (public.is_portfolio_member());
create policy "lease_payments_insert_member" on public.lease_payments
  for insert to authenticated with check (public.is_portfolio_member() and owner = auth.uid());
create policy "lease_payments_update_member" on public.lease_payments
  for update to authenticated using (public.is_portfolio_member()) with check (public.is_portfolio_member());
create policy "lease_payments_delete_member" on public.lease_payments
  for delete to authenticated using (public.is_portfolio_member());
