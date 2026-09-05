-- Index-linked rent: the flag existed and was displayed, but nothing ever said
-- "the anniversary passed, the rent can be raised". Without somewhere to record
-- that it was handled, such an alert would fire forever after the first
-- anniversary — a nag, not a reminder. This column is what lets it clear.
--
-- NULL means "never updated", and the anniversary is then measured from the
-- lease start. Deliberately a date and not a boolean: next year's reminder has
-- to know when the last one was acted on.

alter table public.leases
  add column if not exists cpi_updated_on date;

comment on column public.leases.cpi_updated_on is
  'Date the index-linked rent was last updated. NULL = never; the reminder then counts from start_date.';

grant select (cpi_updated_on), update (cpi_updated_on) on public.leases to authenticated;
