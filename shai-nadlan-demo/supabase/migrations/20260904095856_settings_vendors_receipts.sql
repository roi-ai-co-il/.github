-- ── 1. Settings the owner can actually change ────────────────────────────
-- digest_settings was a cron-only table: RLS on, no grants, read by a
-- SECURITY DEFINER function. To give it a screen it needs to be readable and
-- narrowly writable by the signed-in member. `sender` deliberately stays
-- ungranted: it must remain a verified Resend address, and a typo there
-- breaks sending with no visible error.
alter table public.digest_settings
  add column if not exists send_dow smallint not null default 0,
  add column if not exists lease_notice_days smallint not null default 90,
  add column if not exists insurance_notice_days smallint not null default 30;

alter table public.digest_settings
  drop constraint if exists digest_settings_send_dow_ck,
  add constraint digest_settings_send_dow_ck check (send_dow between 0 and 6);
alter table public.digest_settings
  drop constraint if exists digest_settings_lease_days_ck,
  add constraint digest_settings_lease_days_ck check (lease_notice_days between 7 and 365);
alter table public.digest_settings
  drop constraint if exists digest_settings_ins_days_ck,
  add constraint digest_settings_ins_days_ck check (insurance_notice_days between 7 and 365);

drop policy if exists digest_settings_select_member on public.digest_settings;
create policy digest_settings_select_member on public.digest_settings
  for select using (public.is_portfolio_member());
drop policy if exists digest_settings_update_member on public.digest_settings;
create policy digest_settings_update_member on public.digest_settings
  for update using (public.is_portfolio_member());

grant select on public.digest_settings to authenticated;
grant update (recipient, enabled, greeting_name, send_dow, lease_notice_days, insurance_notice_days)
  on public.digest_settings to authenticated;

-- ── 2. בעלי מקצוע ─────────────────────────────────────────────────────────
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  trade text not null default 'אחר',
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vendors enable row level security;
drop policy if exists vendors_select_member on public.vendors;
create policy vendors_select_member on public.vendors for select using (public.is_portfolio_member());
drop policy if exists vendors_insert_member on public.vendors;
create policy vendors_insert_member on public.vendors for insert with check (public.is_portfolio_member() and owner = auth.uid());
drop policy if exists vendors_update_member on public.vendors;
create policy vendors_update_member on public.vendors for update using (public.is_portfolio_member());
drop policy if exists vendors_delete_member on public.vendors;
create policy vendors_delete_member on public.vendors for delete using (public.is_portfolio_member());
grant select, insert, update, delete on public.vendors to authenticated;

-- ── 3. Receipts ───────────────────────────────────────────────────────────
-- Every displayed field is SNAPSHOT at issue time. A receipt is a document
-- handed to a tenant: renaming the property or raising the rent a year later
-- must not rewrite what the tenant was given.
create sequence if not exists public.receipt_number_seq start 1001;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payment_id uuid not null unique references public.lease_payments(id) on delete cascade,
  number bigint not null default nextval('public.receipt_number_seq'),
  issued_at timestamptz not null default now(),
  amount numeric not null,
  paid_date date,
  tenant_name text not null,
  property_name text not null,
  property_address text,
  issuer_name text not null,
  period_label text not null,
  created_at timestamptz not null default now()
);
alter table public.receipts enable row level security;
drop policy if exists receipts_select_member on public.receipts;
create policy receipts_select_member on public.receipts for select using (public.is_portfolio_member());
drop policy if exists receipts_insert_member on public.receipts;
create policy receipts_insert_member on public.receipts for insert with check (public.is_portfolio_member() and owner = auth.uid());
drop policy if exists receipts_delete_member on public.receipts;
create policy receipts_delete_member on public.receipts for delete using (public.is_portfolio_member());
-- Deliberately NO update policy: an issued receipt is immutable. Reissuing
-- means deleting and creating a new one, which takes a new number.
grant select, insert, delete on public.receipts to authenticated;
grant usage on sequence public.receipt_number_seq to authenticated;

create index if not exists receipts_payment_idx on public.receipts(payment_id);
create index if not exists vendors_name_idx on public.vendors(name);
