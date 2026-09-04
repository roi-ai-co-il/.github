-- תיקונים: an electrician, a plumber, a leak. Some of it is charged on to the
-- tenant; the rest comes straight out of the owner's profit.
--
-- The split is stored as an INTENT (charge_mode), never as a pair of amounts.
-- Storing "who pays" next to "how much the tenant pays" is a drift generator:
-- raise the invoice from 800 to 900 and a repair marked "the tenant pays"
-- silently becomes a split, with nothing to force the two columns to agree.
-- So the two money figures are GENERATED columns — one derivation, in the
-- database, shared by every screen, every report and every future writer.
--
-- cost is nullable on purpose: the tradesman has been and the invoice has not
-- arrived. That is "not known yet", not ₪0, and both derived columns come back
-- null so no screen can quote an invented number.

create table public.repairs (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references public.properties(id) on delete cascade,
  vendor_id     uuid references public.vendors(id) on delete set null,

  title         text not null,
  trade         text,                       -- what kind of work; free text
  reported_on   date not null default current_date,
  done_on       date,                       -- null = still open

  cost          numeric(12,2),              -- null = the invoice has not arrived
  charge_mode   text not null default 'owner',
  tenant_share  numeric(12,2),              -- only meaningful for 'split'

  -- What the tenant is charged, and what actually comes off the profit.
  -- Derived, so they cannot disagree with charge_mode or with each other.
  tenant_charge numeric(12,2) generated always as (
    case charge_mode
      when 'owner'  then 0
      when 'tenant' then cost
      else tenant_share
    end
  ) stored,
  owner_cost    numeric(12,2) generated always as (
    cost - case charge_mode
      when 'owner'  then 0
      when 'tenant' then cost
      else tenant_share
    end
  ) stored,

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint repairs_charge_mode_known
    check (charge_mode in ('owner', 'tenant', 'split')),
  constraint repairs_cost_not_negative
    check (cost is null or cost >= 0),
  -- A split needs a number, and it cannot exceed the invoice.
  constraint repairs_split_has_a_share
    check (charge_mode <> 'split'
           or (tenant_share is not null and tenant_share >= 0
               and (cost is null or tenant_share <= cost))),
  -- ...and only a split may carry one, so a leftover value from a changed
  -- mind can never feed the derivation.
  constraint repairs_share_only_for_split
    check (charge_mode = 'split' or tenant_share is null),
  -- Charging the tenant an amount nobody knows yet is not a thing.
  constraint repairs_tenant_pays_needs_a_cost
    check (charge_mode <> 'tenant' or cost is not null),
  constraint repairs_finished_after_it_started
    check (done_on is null or done_on >= reported_on)
);

create index repairs_property_idx on public.repairs (property_id, reported_on desc);
create index repairs_vendor_idx   on public.repairs (vendor_id) where vendor_id is not null;
create index repairs_open_idx     on public.repairs (done_on) where done_on is null;

alter table public.repairs enable row level security;

create policy repairs_select_member on public.repairs
  for select using (is_portfolio_member());
create policy repairs_insert_member on public.repairs
  for insert with check (is_portfolio_member() and owner = auth.uid());
create policy repairs_update_member on public.repairs
  for update using (is_portfolio_member());
create policy repairs_delete_member on public.repairs
  for delete using (is_portfolio_member());

-- Supabase's ALTER DEFAULT PRIVILEGES has already granted ALL on this table to
-- anon, authenticated and service_role. Listing the privileges we want does not
-- take away the ones we leave out, so the refusal has to be an explicit REVOKE.
grant select, insert, update, delete on public.repairs to authenticated;
revoke all on public.repairs from anon;
