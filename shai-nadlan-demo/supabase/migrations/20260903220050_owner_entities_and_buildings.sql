-- Two structural layers Shai named in the video, both OPTIONAL.
--
--   ישויות (0:40) — "ומפה אני רואה את הישויות, מי מחזיק במה."
--   אתרים  (0:00) — "זה נקרא אתרים... אני יכול להיכנס לנכס בתוך האתר."
--
-- Both foreign keys are NULLABLE by design. A property with no entity and no
-- building behaves exactly as it does today, so nothing has to be filled in
-- before the app keeps working. That matters especially for buildings: we do
-- not yet know whether Shai holds several units in one building or whether his
-- properties are scattered. If they are scattered, the layer simply stays
-- empty and costs nothing — rather than forcing a wrapper around every single
-- property, which is what copying Nadlanitor literally would have done.

create table if not exists public.owner_entities (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid(),
  name        text not null,
  -- Who legally holds the asset. 'יחיד' is a private person, the common case.
  entity_type text not null default 'יחיד'
              check (entity_type in ('יחיד','חברה','שותפות','עמותה','אחר')),
  tax_id      text,          -- ח.פ / ת.ז — nullable, never invented
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.buildings (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  name       text not null,
  address    text,
  city       text,
  entity_id  uuid references public.owner_entities(id) on delete set null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- on delete set null, never cascade: removing an entity or a building must
-- never take the properties down with it.
alter table public.properties
  add column if not exists entity_id   uuid references public.owner_entities(id) on delete set null,
  add column if not exists building_id uuid references public.buildings(id)      on delete set null;

create index if not exists properties_entity_idx   on public.properties (entity_id)   where entity_id is not null;
create index if not exists properties_building_idx on public.properties (building_id) where building_id is not null;
create index if not exists buildings_entity_idx    on public.buildings  (entity_id)   where entity_id is not null;

alter table public.owner_entities enable row level security;
alter table public.buildings      enable row level security;

-- Same membership shape as every other table in this schema.
drop policy if exists owner_entities_select_member on public.owner_entities;
create policy owner_entities_select_member on public.owner_entities
  for select using (public.is_portfolio_member());
drop policy if exists owner_entities_insert_member on public.owner_entities;
create policy owner_entities_insert_member on public.owner_entities
  for insert with check (public.is_portfolio_member() and owner = auth.uid());
drop policy if exists owner_entities_update_member on public.owner_entities;
create policy owner_entities_update_member on public.owner_entities
  for update using (public.is_portfolio_member());
drop policy if exists owner_entities_delete_member on public.owner_entities;
create policy owner_entities_delete_member on public.owner_entities
  for delete using (public.is_portfolio_member());

drop policy if exists buildings_select_member on public.buildings;
create policy buildings_select_member on public.buildings
  for select using (public.is_portfolio_member());
drop policy if exists buildings_insert_member on public.buildings;
create policy buildings_insert_member on public.buildings
  for insert with check (public.is_portfolio_member() and owner = auth.uid());
drop policy if exists buildings_update_member on public.buildings;
create policy buildings_update_member on public.buildings
  for update using (public.is_portfolio_member());
drop policy if exists buildings_delete_member on public.buildings;
create policy buildings_delete_member on public.buildings
  for delete using (public.is_portfolio_member());

-- ⚠️ properties already has COLUMN-level grants in this project's history, so a
-- new column is unreadable and unwritable until it is granted explicitly.
grant select (entity_id, building_id), update (entity_id, building_id), insert (entity_id, building_id)
  on public.properties to authenticated;
