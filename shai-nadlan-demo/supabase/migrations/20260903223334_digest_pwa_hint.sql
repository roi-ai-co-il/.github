-- The digest's call to action, corrected for how phones actually behave.
--
-- iOS cannot open an installed home-screen web app from an email link — there
-- is no scheme for it, so Mail always hands the URL to Safari. Worse, an iOS
-- home-screen web app keeps its own storage separate from Safari's, so the
-- button would land Shai in a browser where he is NOT signed in and ask him
-- for a code again. Tapping his own icon is strictly better there.
--
-- Android/Chrome does capture in-scope links into the installed app, and on a
-- desktop the link is the only route — so the button stays, and a line under
-- it points phone users at the icon they already have. The URL is the
-- manifest's start_url exactly, which is what gives Android the best chance of
-- opening the app rather than a tab.

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
    return;
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
    ||   '<a href="https://shai-nadlan-demo-three.vercel.app/" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 26px;border-radius:999px;">פתיחת המערכת</a>'
    ||   '<div style="font-size:12px;color:#8b8395;padding-top:12px;line-height:1.6;">בטלפון עדיף לפתוח את האייקון של המערכת<br>ממסך הבית — שם אתם כבר מחוברים.</div>'
    ||   '<div style="font-size:11px;color:#b8b1c2;padding-top:14px;">ROI AI</div>'
    || '</td></tr>'
    || '</table></div>';

  return next;
end $$;

revoke all on function public.build_weekly_digest() from public, anon, authenticated;
