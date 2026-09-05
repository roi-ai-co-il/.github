-- The digest, rewritten twice over.
--
-- 1. IT WAS NOT UNDERSTANDABLE. The old version was a row of coloured dots and
--    bare counts — the shape of a status page, not something a person reads at
--    07:00. Every line is now a sentence with the number beside it, and the
--    Hebrew is inflected properly (שוכר אחד לא שילם / 3 שוכרים לא שילמו),
--    because "1 תשלומים" is exactly what makes an automated email feel like a
--    machine talking.
--
-- 2. IT WORE THE WRONG BRAND. It used ROI AI's purple-pink. This is Shai's
--    system, and his system is iOS: #007AFF blue, #F2F2F7 grouped background,
--    white cards, hairline separators, and the same semantic red/orange/indigo
--    the app already uses for danger/warning/info. Opening the mail should feel
--    like opening the app.

create or replace function public.build_weekly_digest()
returns table (subject text, html text)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_today      date := (now() at time zone 'Asia/Jerusalem')::date;
  v_late_n     int;  v_late_total numeric;
  v_expiring_n int;  v_cpi_n int;
  v_props      int;  v_rented int;  v_income numeric;
  v_rows       text := '';
  v_headline   text;
  v_sub        text;

  -- One row: a big number on the left, a readable sentence on the right.
  function_row text;
begin
  select count(*), coalesce(sum(p.amount), 0) into v_late_n, v_late_total
  from public.lease_payments p
  join public.leases l on l.id = p.lease_id and l.status = 'active'
  where not p.paid and p.due_date < v_today;

  select count(*) into v_expiring_n
  from public.leases where status = 'active' and end_date <= v_today + 90;

  select count(*) into v_cpi_n
  from public.leases
  where status = 'active' and linked_to_cpi
    and (coalesce(cpi_updated_on, start_date) + interval '1 year')::date <= v_today;

  select count(*) into v_props from public.properties;
  select count(*), coalesce(sum(monthly_rent), 0) into v_rented, v_income
  from public.leases where status = 'active';

  if v_props = 0 then return; end if;

  if v_late_n > 0 then
    v_rows := v_rows ||
      '<tr><td style="padding:14px 20px;border-bottom:1px solid #3C3C431F;">'
      || '<table role="presentation" width="100%" style="border-collapse:collapse;"><tr>'
      || '<td style="font-size:15px;color:#000;line-height:1.45;">'
      ||   '<b>' || case when v_late_n = 1 then 'שוכר אחד לא שילם' else v_late_n || ' שוכרים לא שילמו' end || '</b>'
      ||   '<div style="font-size:13px;color:#3C3C4399;padding-top:2px;">סך הכול ' || to_char(v_late_total,'FM999,999,999') || ' ₪ שממתינים</div>'
      || '</td>'
      || '<td align="left" width="52" style="font-size:26px;font-weight:700;color:#FF3B30;direction:ltr;">' || v_late_n || '</td>'
      || '</tr></table></td></tr>';
  end if;

  if v_expiring_n > 0 then
    v_rows := v_rows ||
      '<tr><td style="padding:14px 20px;border-bottom:1px solid #3C3C431F;">'
      || '<table role="presentation" width="100%" style="border-collapse:collapse;"><tr>'
      || '<td style="font-size:15px;color:#000;line-height:1.45;">'
      ||   '<b>' || case when v_expiring_n = 1 then 'חוזה אחד נגמר בקרוב' else v_expiring_n || ' חוזים נגמרים בקרוב' end || '</b>'
      ||   '<div style="font-size:13px;color:#3C3C4399;padding-top:2px;">בתוך 90 הימים הקרובים — כדאי לדבר עם השוכרים</div>'
      || '</td>'
      || '<td align="left" width="52" style="font-size:26px;font-weight:700;color:#FF9500;direction:ltr;">' || v_expiring_n || '</td>'
      || '</tr></table></td></tr>';
  end if;

  if v_cpi_n > 0 then
    v_rows := v_rows ||
      '<tr><td style="padding:14px 20px;border-bottom:1px solid #3C3C431F;">'
      || '<table role="presentation" width="100%" style="border-collapse:collapse;"><tr>'
      || '<td style="font-size:15px;color:#000;line-height:1.45;">'
      ||   '<b>' || case when v_cpi_n = 1 then 'חוזה אחד מוכן לעדכון מדד' else v_cpi_n || ' חוזים מוכנים לעדכון מדד' end || '</b>'
      ||   '<div style="font-size:13px;color:#3C3C4399;padding-top:2px;">עברה שנה מהעדכון האחרון — אפשר להעלות את שכר הדירה</div>'
      || '</td>'
      || '<td align="left" width="52" style="font-size:26px;font-weight:700;color:#5856D6;direction:ltr;">' || v_cpi_n || '</td>'
      || '</tr></table></td></tr>';
  end if;

  if v_rows = '' then
    v_headline := 'הכול תקין';
    v_sub := 'אין מה לעשות השבוע';
    v_rows := '<tr><td style="padding:18px 20px;font-size:15px;color:#3C3C4399;line-height:1.6;">'
      || 'כל השוכרים שילמו, אף חוזה לא נגמר בקרוב, ואין עדכוני מדד שממתינים.'
      || '</td></tr>';
  else
    v_headline := 'מה מחכה לך';
    v_sub := 'שלושה דברים לבדוק במערכת';
    if (v_late_n > 0)::int + (v_expiring_n > 0)::int + (v_cpi_n > 0)::int = 1 then
      v_sub := 'דבר אחד לבדוק במערכת';
    elsif (v_late_n > 0)::int + (v_expiring_n > 0)::int + (v_cpi_n > 0)::int = 2 then
      v_sub := 'שני דברים לבדוק במערכת';
    end if;
  end if;

  subject := v_headline || ' · ' || to_char(v_today, 'DD.MM');
  html :=
    '<div dir="rtl" style="margin:0;padding:24px 14px;background:#F2F2F7;font-family:-apple-system,BlinkMacSystemFont,''SF Pro Text'',''Segoe UI'',Arial,sans-serif;">'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:440px;margin:0 auto;">'

    -- header, like the app's own large title
    || '<tr><td style="padding:4px 6px 14px 6px;">'
    ||   '<div style="font-size:13px;color:#3C3C434D;">' || to_char(v_today,'DD.MM.YYYY') || '</div>'
    ||   '<div style="font-size:28px;font-weight:700;color:#000;letter-spacing:-.4px;padding-top:2px;">' || v_headline || '</div>'
    ||   '<div style="font-size:15px;color:#3C3C4399;padding-top:3px;">' || v_sub || '</div>'
    || '</td></tr>'

    -- the grouped card
    || '<tr><td><table role="presentation" width="100%" style="border-collapse:collapse;background:#FFF;border-radius:14px;overflow:hidden;">'
    ||   v_rows
    || '</table></td></tr>'

    -- portfolio, as a second grouped card
    || '<tr><td style="padding:20px 6px 8px 6px;font-size:13px;color:#3C3C4399;">התיק שלך</td></tr>'
    || '<tr><td><table role="presentation" width="100%" style="border-collapse:collapse;background:#FFF;border-radius:14px;overflow:hidden;font-size:15px;">'
    ||   '<tr><td style="padding:12px 20px;border-bottom:1px solid #3C3C431F;color:#000;">נכסים</td>'
    ||       '<td align="left" style="padding:12px 20px;border-bottom:1px solid #3C3C431F;color:#3C3C4399;direction:ltr;">' || v_props || '</td></tr>'
    ||   '<tr><td style="padding:12px 20px;border-bottom:1px solid #3C3C431F;color:#000;">מושכרים</td>'
    ||       '<td align="left" style="padding:12px 20px;border-bottom:1px solid #3C3C431F;color:#3C3C4399;direction:ltr;">' || v_rented || ' מתוך ' || v_props || '</td></tr>'
    ||   '<tr><td style="padding:12px 20px;color:#000;">נכנס בחודש</td>'
    ||       '<td align="left" style="padding:12px 20px;color:#3C3C4399;direction:ltr;">' || to_char(v_income,'FM999,999,999') || ' ₪</td></tr>'
    || '</table></td></tr>'

    -- action
    || '<tr><td align="center" style="padding:26px 6px 8px 6px;">'
    ||   '<a href="https://shai-nadlan-demo-three.vercel.app/" style="display:inline-block;background:#007AFF;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 30px;border-radius:12px;">פתיחת המערכת</a>'
    ||   '<div style="font-size:13px;color:#3C3C4399;padding-top:14px;line-height:1.55;">בטלפון עדיף לפתוח את האייקון ממסך הבית —<br>שם אתם כבר מחוברים.</div>'
    || '</td></tr>'
    || '</table></div>';

  return next;
end $$;

revoke all on function public.build_weekly_digest() from public, anon, authenticated;
