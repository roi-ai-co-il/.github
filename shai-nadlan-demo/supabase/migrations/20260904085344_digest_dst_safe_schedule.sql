-- pg_cron fires in UTC and has no per-job timezone, so a single '0 4 * * 0'
-- means 07:00 in Israel only while DST is in effect. After 25.10 the same job
-- would land at 06:00, and after the spring change it would drift back — a
-- weekly email that quietly moves an hour twice a year.
--
-- Fix: fire on BOTH candidate hours and let the function decide. It sends only
-- when the Israel local hour is 7, and only if it has not already sent in the
-- last three days — so the second firing is a no-op, and a retry after an
-- outage cannot produce a duplicate either.

create or replace function public.send_weekly_digest(p_force boolean default false)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_key  text; v_to text; v_from text; v_subj text; v_html text;
  v_req  bigint;
  v_hour int := extract(hour from (now() at time zone 'Asia/Jerusalem'));
  v_last timestamptz;
begin
  select recipient, sender, last_sent_at into v_to, v_from, v_last
  from public.digest_settings where id and enabled;
  if v_to is null then return 'skipped: disabled or unconfigured'; end if;

  -- The DST guard. p_force lets a human send one on demand from the SQL editor.
  if not p_force then
    if v_hour <> 7 then
      return 'skipped: not 07:00 in Israel (now ' || v_hour || ':00)';
    end if;
    if v_last is not null and v_last > now() - interval '3 days' then
      return 'skipped: already sent ' || to_char(v_last at time zone 'Asia/Jerusalem', 'DD.MM HH24:MI');
    end if;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'RESEND_API_KEY';
  if v_key is null then
    update public.digest_settings set last_status = 'no key in vault' where id;
    return 'skipped: RESEND_API_KEY missing from vault';
  end if;

  select d.subject, d.html into v_subj, v_html from public.build_weekly_digest() d;
  if v_subj is null then
    update public.digest_settings set last_status = 'nothing to send' where id;
    return 'skipped: empty portfolio';
  end if;

  select net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization','Bearer ' || v_key, 'Content-Type','application/json'),
    body    := jsonb_build_object('from', v_from, 'to', v_to, 'subject', v_subj, 'html', v_html)
  ) into v_req;

  update public.digest_settings
     set last_sent_at = now(), last_status = 'queued #' || v_req where id;
  return 'queued #' || v_req;
end $$;

revoke all on function public.send_weekly_digest(boolean) from public, anon, authenticated;
drop function if exists public.send_weekly_digest();

select cron.unschedule('shai-weekly-digest')
 where exists (select 1 from cron.job where jobname = 'shai-weekly-digest');

-- 04:00 UTC (= 07:00 IDT) and 05:00 UTC (= 07:00 IST). Whichever one is 07:00
-- locally sends; the other returns 'skipped: not 07:00'.
select cron.schedule('shai-weekly-digest', '0 4,5 * * 0',
                     $cron$ select public.send_weekly_digest(); $cron$);
