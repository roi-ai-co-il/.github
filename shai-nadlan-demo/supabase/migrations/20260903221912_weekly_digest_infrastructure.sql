-- The weekly digest.
--
-- Until now every alert waited for Shai to open the app. This is the piece
-- that reverses that: once a week the portfolio speaks first.
--
-- WHY THIS RUNS IN POSTGRES AND NOT IN THE APP
-- A scheduled job has no logged-in user, so member-scoped RLS would return
-- nothing to it. The alternative was putting a service-role key into Vercel —
-- a second long-lived credential in a second place. Running inside the database
-- removes the problem instead of working around it: the function is SECURITY
-- DEFINER, reads the tables directly, and the only secret involved is the
-- Resend key, which lives in Vault and never leaves the server.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Where the digest goes. A table rather than a constant so the recipient can be
-- changed with one UPDATE — it starts as Royi so he reviews a few before Shai
-- ever sees one.
create table if not exists public.digest_settings (
  id           boolean primary key default true check (id),
  recipient    text not null,
  sender       text not null default 'ROI AI <noreply@roiai.co.il>',
  enabled      boolean not null default true,
  last_sent_at timestamptz,
  last_status  text
);

insert into public.digest_settings (id, recipient)
values (true, 'royiargamanx@gmail.com')
on conflict (id) do nothing;

-- Not client data: only the cron and the maintainer touch this.
alter table public.digest_settings enable row level security;
revoke all on public.digest_settings from anon, authenticated;

/* Builds the digest body. Split out from the sender so the content can be
   inspected — select public.build_weekly_digest() — without sending anything.
   Returns null when there is nothing at all to report AND nothing to
   summarise, so a truly empty portfolio never generates mail. */
create or replace function public.build_weekly_digest()
returns table (subject text, html text)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_today        date := (now() at time zone 'Asia/Jerusalem')::date;
  v_late_n       int;
  v_late_total   numeric;
  v_expiring_n   int;
  v_cpi_n        int;
  v_props        int;
  v_rented       int;
  v_income       numeric;
  v_rows         text := '';
  v_headline     text;
begin
  select count(*), coalesce(sum(p.amount), 0)
    into v_late_n, v_late_total
  from public.lease_payments p
  join public.leases l on l.id = p.lease_id and l.status = 'active'
  where not p.paid and p.due_date < v_today;

  select count(*) into v_expiring_n
  from public.leases
  where status = 'active' and end_date <= v_today + 90;

  select count(*) into v_cpi_n
  from public.leases
  where status = 'active' and linked_to_cpi
    and (coalesce(cpi_updated_on, start_date) + interval '1 year')::date <= v_today;

  select count(*) into v_props from public.properties;
  select count(*), coalesce(sum(monthly_rent), 0) into v_rented, v_income
  from public.leases where status = 'active';

  if v_props = 0 then
    return;  -- nothing in the portfolio yet; silence is the honest answer
  end if;

  if v_late_n > 0 then
    v_rows := v_rows || '<tr><td style="padding:10px 0;border-bottom:1px solid #eee9f5;">'
      || '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#c0392b;margin-left:8px;"></span>'
      || '<b>' || v_late_n || ' תשלומים באיחור</b> · ' || to_char(v_late_total, 'FM999,999,999') || ' ₪'
      || '</td></tr>';
  end if;
  if v_expiring_n > 0 then
    v_rows := v_rows || '<tr><td style="padding:10px 0;border-bottom:1px solid #eee9f5;">'
      || '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#c98a2b;margin-left:8px;"></span>'
      || '<b>' || v_expiring_n || ' חוזים נגמרים</b> · תוך 90 יום'
      || '</td></tr>';
  end if;
  if v_cpi_n > 0 then
    v_rows := v_rows || '<tr><td style="padding:10px 0;border-bottom:1px solid #eee9f5;">'
      || '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2b6ec9;margin-left:8px;"></span>'
      || '<b>' || v_cpi_n || ' חוזים לעדכון מדד</b>'
      || '</td></tr>';
  end if;

  if v_rows = '' then
    v_headline := 'הכול תקין השבוע';
    v_rows := '<tr><td style="padding:10px 0;color:#6b6475;">אין תשלומים באיחור, אין חוזים שנגמרים בקרוב, ואין עדכוני מדד שממתינים.</td></tr>';
  else
    v_headline := 'מה דורש טיפול';
  end if;

  subject := 'הסקירה השבועית · ' || to_char(v_today, 'DD.MM.YYYY');
  html :=
    '<div dir="rtl" style="margin:0;padding:32px 16px;background:#f6f4fb;font-family:-apple-system,Segoe UI,Arial,sans-serif;">'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:460px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 2px 16px rgba(90,60,140,.09);">'
    || '<tr><td style="height:5px;background:linear-gradient(90deg,#a855f7,#ec4899);font-size:0;line-height:0;">&nbsp;</td></tr>'
    || '<tr><td style="padding:28px 30px 6px 30px;">'
    ||   '<div style="font-size:20px;font-weight:700;color:#1c1420;">' || v_headline || '</div>'
    ||   '<div style="font-size:13px;color:#8b8395;padding-top:4px;">שי עובדיה · ניהול נדל״ן</div>'
    || '</td></tr>'
    || '<tr><td style="padding:14px 30px 0 30px;"><table role="presentation" width="100%" style="border-collapse:collapse;font-size:15px;color:#1c1420;">'
    ||   v_rows
    || '</table></td></tr>'
    || '<tr><td style="padding:20px 30px 0 30px;">'
    ||   '<table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;color:#6b6475;">'
    ||   '<tr><td style="padding:4px 0;">נכסים</td><td align="left" style="padding:4px 0;color:#1c1420;font-weight:600;">' || v_props || '</td></tr>'
    ||   '<tr><td style="padding:4px 0;">מושכרים</td><td align="left" style="padding:4px 0;color:#1c1420;font-weight:600;">' || v_rented || '</td></tr>'
    ||   '<tr><td style="padding:4px 0;">הכנסה חודשית</td><td align="left" style="padding:4px 0;color:#1c1420;font-weight:600;">' || to_char(v_income, 'FM999,999,999') || ' ₪</td></tr>'
    ||   '</table>'
    || '</td></tr>'
    || '<tr><td align="center" style="padding:24px 30px 30px 30px;">'
    ||   '<a href="https://shai-nadlan-demo-three.vercel.app" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 26px;border-radius:999px;">פתיחת המערכת</a>'
    ||   '<div style="font-size:11px;color:#b8b1c2;padding-top:16px;">ROI AI</div>'
    || '</td></tr>'
    || '</table></div>';

  return next;
end $$;

revoke all on function public.build_weekly_digest() from public, anon, authenticated;

/* Sends it. The Resend key is read from Vault at call time and is never
   returned, logged or stored in this function's own text. */
create or replace function public.send_weekly_digest()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_key   text;
  v_to    text;
  v_from  text;
  v_subj  text;
  v_html  text;
  v_req   bigint;
begin
  select recipient, sender into v_to, v_from
  from public.digest_settings where id and enabled;
  if v_to is null then
    return 'skipped: disabled or unconfigured';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'RESEND_API_KEY';
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
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_key,
                 'Content-Type',  'application/json'),
    body    := jsonb_build_object('from', v_from, 'to', v_to, 'subject', v_subj, 'html', v_html)
  ) into v_req;

  update public.digest_settings
     set last_sent_at = now(), last_status = 'queued #' || v_req
   where id;
  return 'queued #' || v_req;
end $$;

revoke all on function public.send_weekly_digest() from public, anon, authenticated;

-- Sunday 07:00 Israel time. cron.schedule runs in UTC; 04:00 UTC is 07:00 IDT.
select cron.unschedule('shai-weekly-digest')
 where exists (select 1 from cron.job where jobname = 'shai-weekly-digest');

select cron.schedule('shai-weekly-digest', '0 4 * * 0', $cron$ select public.send_weekly_digest(); $cron$);
