-- pg_net is asynchronous: net.http_post returns a request id immediately and the
-- real HTTP result lands in net._http_response later. So send_weekly_digest()
-- has always recorded "queued #N" whether Resend accepted the mail or rejected
-- it — a revoked key, a suspended domain or a malformed body would fail in
-- total silence, week after week, with last_status still reading "queued".
--
-- "Queued" is not "accepted", the same way 200 is not "delivered". This closes
-- the first half: a follow-up job reads the actual response and writes what
-- really happened, so `select last_status from digest_settings` becomes a fact
-- rather than an intention.

alter table public.digest_settings
  add column if not exists last_request_id bigint;

create or replace function public.confirm_weekly_digest()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_req  bigint;
  v_code int;
  v_body text;
begin
  select last_request_id into v_req from public.digest_settings where id;
  if v_req is null then return 'nothing to confirm'; end if;

  select status_code, left(content, 200) into v_code, v_body
  from net._http_response where id = v_req;

  if v_code is null then
    -- Still in flight, or the row has aged out of pg_net's retention window.
    update public.digest_settings
       set last_status = 'no response recorded for #' || v_req where id;
    return 'no response for #' || v_req;
  end if;

  update public.digest_settings
     set last_status = case when v_code between 200 and 299
                            then 'accepted by Resend (' || v_code || ')'
                            else 'FAILED ' || v_code || ' — ' || coalesce(v_body,'') end
   where id;

  return case when v_code between 200 and 299 then 'ok ' || v_code
              else 'FAILED ' || v_code end;
end $$;

revoke all on function public.confirm_weekly_digest() from public, anon, authenticated;

-- Record the request id so the confirmation has something to look up.
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
     set last_sent_at = now(), last_request_id = v_req,
         last_status  = 'queued #' || v_req || ' — awaiting confirmation'
   where id;
  return 'queued #' || v_req;
end $$;

revoke all on function public.send_weekly_digest(boolean) from public, anon, authenticated;

-- Five minutes after each send window, on the same two DST-safe hours.
select cron.unschedule('shai-weekly-digest-confirm')
 where exists (select 1 from cron.job where jobname = 'shai-weekly-digest-confirm');

select cron.schedule('shai-weekly-digest-confirm', '5 4,5 * * 0',
                     $cron$ select public.confirm_weekly_digest(); $cron$);
