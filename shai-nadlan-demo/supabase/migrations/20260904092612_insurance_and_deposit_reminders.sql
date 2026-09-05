-- The two reminders Nadlanitor has and we did not.
--
-- Their app lists "תזכורות חכמות" covering contract renewal, index updates,
-- insurance and deposits. We covered the first two. These are the other two,
-- and they need almost nothing: a deposit amount is already on every lease, so
-- the only missing fact is whether it was actually received.
--
-- Both columns are nullable and mean "not tracked", so nothing starts nagging
-- about properties whose insurance date nobody has entered.

alter table public.properties
  add column if not exists insurance_expires_on date,
  add column if not exists insurer text;

comment on column public.properties.insurance_expires_on is
  'Building insurance expiry. NULL = not tracked, and no reminder is produced.';

alter table public.leases
  add column if not exists deposit_received boolean not null default false;

comment on column public.leases.deposit_received is
  'Whether the deposit named in `deposit` was actually collected. A lease with a
   deposit amount and this false is what the reminder is about.';

grant select (insurance_expires_on, insurer), update (insurance_expires_on, insurer),
      insert (insurance_expires_on, insurer)
  on public.properties to authenticated;
grant select (deposit_received), update (deposit_received), insert (deposit_received)
  on public.leases to authenticated;
