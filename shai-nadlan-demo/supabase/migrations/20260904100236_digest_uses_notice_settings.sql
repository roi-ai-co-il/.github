-- One rule, two places: the dashboard and the weekly email must use the SAME
-- notice windows, or the settings screen is a lie on one of them. Patched
-- against the LIVE definition and refuses rather than guesses if either
-- anchor is missing. Inlined as scalar subqueries so no DECLARE block has to
-- be edited blind.
do $do$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'build_weekly_digest';

  if v_src is null then
    raise exception 'build_weekly_digest not found';
  end if;

  if position('l.end_date <= v_today + 90' in v_src) = 0 then
    raise exception 'lease-window anchor not found — refusing to guess';
  end if;
  if position('p.insurance_expires_on <= v_today + 30' in v_src) = 0 then
    raise exception 'insurance-window anchor not found — refusing to guess';
  end if;

  v_new := replace(v_src,
    'l.end_date <= v_today + 90',
    'l.end_date <= v_today + (select lease_notice_days from public.digest_settings where id)');
  v_new := replace(v_new,
    'p.insurance_expires_on <= v_today + 30',
    'p.insurance_expires_on <= v_today + (select insurance_notice_days from public.digest_settings where id)');

  execute v_new;
end $do$;
