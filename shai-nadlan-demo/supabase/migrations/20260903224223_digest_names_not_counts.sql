-- The digest, rebuilt around one realisation: the previous version was a
-- COUNTER, not information.
--
-- "2 שוכרים לא שילמו" cannot be acted on. Which tenants? Which flats? Shai had
-- to open the app to find out, which makes the email a push notification with
-- extra steps. Now every line names the tenant, the property, the amount and
-- how late it is — and carries a WhatsApp link, because chasing rent is the
-- actual next action and it should be one tap from the inbox.
--
-- Also removed: the giant coloured numerals (the sentence already said "2"),
-- and the portfolio card — he knows how many flats he owns; repeating it
-- weekly is filler that pushed the real content down. And 14,600 appeared
-- twice meaning two different things, which is how a reader stops trusting a
-- report.

create or replace function public.build_weekly_digest()
returns table (subject text, html text)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
  v_body  text := '';
  v_n     int  := 0;
  v_head  text;
  r       record;

  -- +9725… for wa.me, from an Israeli 05… number
  function_wa text;
begin
  ---------------------------------------------------------------- unpaid rent
  for r in
    select t.full_name, t.phone, p.name as prop, p.city,
           sum(lp.amount) as owed, min(lp.due_date) as oldest, count(*) as months
    from public.lease_payments lp
    join public.leases l  on l.id = lp.lease_id and l.status = 'active'
    join public.properties p on p.id = l.property_id
    left join public.tenants t on t.id = l.tenant_id
    where not lp.paid and lp.due_date < v_today
    group by t.full_name, t.phone, p.name, p.city
    order by min(lp.due_date)
  loop
    if v_n = 0 then
      v_body := v_body || '<tr><td style="padding:22px 6px 8px 6px;font-size:13px;font-weight:600;color:#FF3B30;">לא שולם</td></tr>'
        || '<tr><td><table role="presentation" width="100%" style="border-collapse:collapse;background:#FFF;border-radius:14px;overflow:hidden;">';
    end if;
    v_n := v_n + 1;
    v_body := v_body
      || '<tr><td style="padding:14px 18px;border-top:' || case when v_n = 1 then '0' else '1px solid #3C3C431F' end || ';">'
      ||   '<div style="font-size:16px;font-weight:600;color:#000;">' || coalesce(r.full_name,'שוכר') || '</div>'
      ||   '<div style="font-size:14px;color:#3C3C4399;padding-top:2px;">' || r.prop || ' · ' || coalesce(r.city,'') || '</div>'
      ||   '<div style="font-size:15px;color:#000;padding-top:6px;">'
      ||     '<b>' || to_char(r.owed,'FM999,999,999') || ' ₪</b>'
      ||     '<span style="color:#FF3B30;"> · באיחור ' || (v_today - r.oldest) || ' ימים</span>'
      ||     case when r.months > 1 then '<span style="color:#3C3C4399;"> · ' || r.months || ' חודשים</span>' else '' end
      ||   '</div>'
      ||   case when r.phone is not null then
             '<div style="padding-top:10px;"><a href="https://wa.me/972' || ltrim(regexp_replace(r.phone,'[^0-9]','','g'),'0')
             || '?text=' || 'היי%20' || replace(coalesce(r.full_name,''),' ','%20') || '%2C%20לגבי%20שכר%20הדירה'
             || '" style="display:inline-block;background:#34C759;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:8px 16px;border-radius:9px;">שליחת הודעה</a></div>'
           else '' end
      || '</td></tr>';
  end loop;
  if v_n > 0 then v_body := v_body || '</table></td></tr>'; end if;

  ------------------------------------------------------------ leases expiring
  declare v_e int := 0; begin
    for r in
      select t.full_name, p.name as prop, p.city, l.end_date, l.monthly_rent
      from public.leases l
      join public.properties p on p.id = l.property_id
      left join public.tenants t on t.id = l.tenant_id
      where l.status = 'active' and l.end_date <= v_today + 90
      order by l.end_date
    loop
      if v_e = 0 then
        v_body := v_body || '<tr><td style="padding:22px 6px 8px 6px;font-size:13px;font-weight:600;color:#FF9500;">חוזים שנגמרים</td></tr>'
          || '<tr><td><table role="presentation" width="100%" style="border-collapse:collapse;background:#FFF;border-radius:14px;overflow:hidden;">';
      end if;
      v_e := v_e + 1;
      v_body := v_body
        || '<tr><td style="padding:14px 18px;border-top:' || case when v_e = 1 then '0' else '1px solid #3C3C431F' end || ';">'
        ||   '<div style="font-size:16px;font-weight:600;color:#000;">' || r.prop || '</div>'
        ||   '<div style="font-size:14px;color:#3C3C4399;padding-top:2px;">' || coalesce(r.full_name,'ללא שוכר') || ' · ' || to_char(r.monthly_rent,'FM999,999') || ' ₪ לחודש</div>'
        ||   '<div style="font-size:15px;color:#000;padding-top:6px;">נגמר ב־' || to_char(r.end_date,'DD.MM')
        ||     '<span style="color:#FF9500;"> · בעוד ' || (r.end_date - v_today) || ' ימים</span></div>'
        || '</td></tr>';
    end loop;
    if v_e > 0 then v_body := v_body || '</table></td></tr>'; end if;
    v_n := v_n + v_e;
  end;

  ------------------------------------------------------------------ index due
  declare v_c int := 0; begin
    for r in
      select p.name as prop, t.full_name, l.monthly_rent,
             coalesce(l.cpi_updated_on, l.start_date) as since
      from public.leases l
      join public.properties p on p.id = l.property_id
      left join public.tenants t on t.id = l.tenant_id
      where l.status = 'active' and l.linked_to_cpi
        and (coalesce(l.cpi_updated_on, l.start_date) + interval '1 year')::date <= v_today
      order by coalesce(l.cpi_updated_on, l.start_date)
    loop
      if v_c = 0 then
        v_body := v_body || '<tr><td style="padding:22px 6px 8px 6px;font-size:13px;font-weight:600;color:#5856D6;">מוכן לעדכון מדד</td></tr>'
          || '<tr><td><table role="presentation" width="100%" style="border-collapse:collapse;background:#FFF;border-radius:14px;overflow:hidden;">';
      end if;
      v_c := v_c + 1;
      v_body := v_body
        || '<tr><td style="padding:14px 18px;border-top:' || case when v_c = 1 then '0' else '1px solid #3C3C431F' end || ';">'
        ||   '<div style="font-size:16px;font-weight:600;color:#000;">' || r.prop || '</div>'
        ||   '<div style="font-size:14px;color:#3C3C4399;padding-top:2px;">' || coalesce(r.full_name,'') || ' · ' || to_char(r.monthly_rent,'FM999,999') || ' ₪ היום</div>'
        ||   '<div style="font-size:15px;color:#000;padding-top:6px;">לא עודכן מאז ' || to_char(r.since,'DD.MM.YYYY') || '</div>'
        || '</td></tr>';
    end loop;
    if v_c > 0 then v_body := v_body || '</table></td></tr>'; end if;
    v_n := v_n + v_c;
  end;

  if (select count(*) from public.properties) = 0 then return; end if;

  if v_n = 0 then
    v_head := 'הכול תקין';
    v_body := '<tr><td><table role="presentation" width="100%" style="background:#FFF;border-radius:14px;"><tr><td style="padding:20px 18px;font-size:15px;color:#3C3C4399;line-height:1.6;">'
      || 'כל השוכרים שילמו, אף חוזה לא נגמר בתשעים הימים הקרובים, ואין עדכוני מדד שממתינים.'
      || '</td></tr></table></td></tr>';
  else
    v_head := 'מה מחכה לך';
  end if;

  subject := v_head || ' · ' || to_char(v_today,'DD.MM');
  html :=
    '<div dir="rtl" style="margin:0;padding:24px 14px;background:#F2F2F7;font-family:-apple-system,BlinkMacSystemFont,''SF Pro Text'',''Segoe UI'',Arial,sans-serif;">'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:440px;margin:0 auto;">'
    || '<tr><td style="padding:4px 6px 2px 6px;">'
    ||   '<div style="font-size:13px;color:#3C3C434D;">' || to_char(v_today,'DD.MM.YYYY') || '</div>'
    ||   '<div style="font-size:28px;font-weight:700;color:#000;letter-spacing:-.4px;padding-top:2px;">' || v_head || '</div>'
    || '</td></tr>'
    || v_body
    || '<tr><td align="center" style="padding:30px 6px 8px 6px;">'
    ||   '<a href="https://shai-nadlan-demo-three.vercel.app/" style="display:inline-block;background:#007AFF;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 30px;border-radius:12px;">פתיחת המערכת</a>'
    ||   '<div style="font-size:13px;color:#3C3C4399;padding-top:14px;line-height:1.55;">בטלפון עדיף לפתוח את האייקון ממסך הבית —<br>שם אתם כבר מחוברים.</div>'
    || '</td></tr>'
    || '</table></div>';

  return next;
end $$;

revoke all on function public.build_weekly_digest() from public, anon, authenticated;
