-- The digest was written like a status page. The app itself greets him by name
-- on every entry — "בוקר טוב שי" — and the weekly mail sounded like it came
-- from a different product.
--
-- Now it opens the way the app does, says how many things are waiting in a
-- sentence rather than as a header, and closes with a line that reads like a
-- person wrote it. The name is a setting, not a constant, so the same digest
-- can address whoever it is sent to.

alter table public.digest_settings
  add column if not exists greeting_name text not null default 'שי';

create or replace function public.digest_greeting(p_now timestamptz default now())
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when extract(hour from (p_now at time zone 'Asia/Jerusalem')) < 12 then 'בוקר טוב'
    when extract(hour from (p_now at time zone 'Asia/Jerusalem')) < 17 then 'צהריים טובים'
    else 'ערב טוב'
  end;
$$;
