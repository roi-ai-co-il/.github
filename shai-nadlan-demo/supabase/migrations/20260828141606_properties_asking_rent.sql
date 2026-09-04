-- The rent the owner WANTS for the property — shown while it's vacant and
-- used as the default when a new lease is created.
-- Applied to production 2026-08-28 (version 20260828141606).
alter table public.properties
  add column if not exists asking_rent numeric(12,2)
  check (asking_rent is null or asking_rent >= 0);
