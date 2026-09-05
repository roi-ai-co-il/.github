-- Four tables carry an `updated_at` column and had no trigger to maintain it,
-- so the value froze at creation and quietly claimed the row had never been
-- touched. properties/leases/tenants have had the trigger since the start;
-- every table added since was missing it. A column that states something false
-- is worse than no column: the first screen to ask "what changed recently"
-- would have been wrong, and nothing would have looked broken.
create trigger repairs_updated_at        before update on public.repairs
  for each row execute function public.set_updated_at();
create trigger vendors_updated_at        before update on public.vendors
  for each row execute function public.set_updated_at();
create trigger buildings_updated_at      before update on public.buildings
  for each row execute function public.set_updated_at();
create trigger owner_entities_updated_at before update on public.owner_entities
  for each row execute function public.set_updated_at();
