-- shai-nadlan demo: portfolio schema
-- Tables: properties, property_images, tenants, leases. All owner-scoped with RLS.

create extension if not exists pgcrypto;

-- ── updated_at trigger ────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── properties ──────────────────────────────────────
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  address text not null check (char_length(address) between 1 and 200),
  city text not null check (char_length(city) between 1 and 80),
  property_type text not null check (property_type in
    ('apartment','penthouse','garden_apartment','house','commercial','office','storage','parking')),
  rooms numeric(4,1) check (rooms is null or rooms between 0 and 50),
  area_sqm numeric(8,1) check (area_sqm is null or area_sqm between 0 and 100000),
  floor_no int check (floor_no is null or floor_no between -5 and 200),
  purchase_price numeric(14,2) check (purchase_price is null or purchase_price >= 0),
  purchase_date date,
  current_value numeric(14,2) check (current_value is null or current_value >= 0),
  status text not null default 'vacant' check (status in ('rented','vacant','renovation','for_sale')),
  notes text,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists properties_owner_idx on public.properties(owner);
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

alter table public.properties enable row level security;

create policy "properties_select_own" on public.properties
  for select to authenticated using (owner = auth.uid());
create policy "properties_insert_own" on public.properties
  for insert to authenticated with check (owner = auth.uid());
create policy "properties_update_own" on public.properties
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "properties_delete_own" on public.properties
  for delete to authenticated using (owner = auth.uid());

-- ── property_images ─────────────────────────────────
create table if not exists public.property_images (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  url text not null check (char_length(url) between 1 and 2000),
  storage_path text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists property_images_owner_idx on public.property_images(owner);
create index if not exists property_images_property_idx on public.property_images(property_id);

alter table public.property_images enable row level security;

create policy "property_images_select_own" on public.property_images
  for select to authenticated using (owner = auth.uid());
create policy "property_images_insert_own" on public.property_images
  for insert to authenticated with check (owner = auth.uid());
create policy "property_images_update_own" on public.property_images
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "property_images_delete_own" on public.property_images
  for delete to authenticated using (owner = auth.uid());

-- ── tenants ────────────────────────────────────────
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or char_length(email) <= 200),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenants_owner_idx on public.tenants(owner);
create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

alter table public.tenants enable row level security;

create policy "tenants_select_own" on public.tenants
  for select to authenticated using (owner = auth.uid());
create policy "tenants_insert_own" on public.tenants
  for insert to authenticated with check (owner = auth.uid());
create policy "tenants_update_own" on public.tenants
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "tenants_delete_own" on public.tenants
  for delete to authenticated using (owner = auth.uid());

-- ── leases ─────────────────────────────────────────
create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  payment_day int not null default 1 check (payment_day between 1 and 31),
  deposit numeric(12,2) check (deposit is null or deposit >= 0),
  linked_to_cpi boolean not null default false,
  status text not null default 'active' check (status in ('active','ended')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leases_dates_valid check (end_date > start_date)
);

create index if not exists leases_owner_idx on public.leases(owner);
create index if not exists leases_property_idx on public.leases(property_id);
create index if not exists leases_tenant_idx on public.leases(tenant_id);
create index if not exists leases_end_date_idx on public.leases(end_date);

create trigger leases_updated_at before update on public.leases
  for each row execute function public.set_updated_at();

alter table public.leases enable row level security;

create policy "leases_select_own" on public.leases
  for select to authenticated using (owner = auth.uid());
create policy "leases_insert_own" on public.leases
  for insert to authenticated with check (owner = auth.uid());
create policy "leases_update_own" on public.leases
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "leases_delete_own" on public.leases
  for delete to authenticated using (owner = auth.uid());

-- ── Storage: property images bucket ──────────────────────
insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do nothing;

create policy "property_images_bucket_read" on storage.objects
  for select using (bucket_id = 'property-images');
create policy "property_images_bucket_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "property_images_bucket_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text);
