-- Body copied from the LIVE pg_get_functiondef, not from the migration that
-- first created it, and extended with one guard: the send day is now a
-- setting. The cron therefore has to fire every day and let the function
-- decide, instead of encoding Sunday in the schedule.
CREATE OR REPLACE FUNCTION public.send_weekly_digest(p_force boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key  text; v_to text; v_from text; v_subj text; v_html text;
  v_req  bigint;
  v_hour int := extract(hour from (now() at time zone 'Asia/Jerusalem'));
  v_dow  int := extract(dow  from (now() at time zone 'Asia/Jerusalem'));
  v_want int;
  v_last timestamptz;
begin
  select recipient, sender, last_sent_at, send_dow into v_to, v_from, v_last, v_want
  from public.digest_settings where id and enabled;
  if v_to is null then return 'skipped: disabled or unconfigured'; end if;

  if not p_force then
    if v_hour <> 7 then
      return 'skipped: not 07:00 in Israel (now ' || v_hour || ':00)';
    end if;
    if v_dow <> v_want then
      return 'skipped: not the chosen day (today ' || v_dow || ', want ' || v_want || ')';
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
     set last_sent_at = now(), last_request_id = v_req,
         last_status  = 'queued #' || v_req || ' — awaiting confirmation'
   where id;
  return 'queued #' || v_req;
end $function$;

select cron.alter_job(2, schedule := '0 4,5 * * *');
select cron.alter_job(3, schedule := '5 4,5 * * *');
