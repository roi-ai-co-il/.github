/**
 * The demo's documents, rendered as real Hebrew PDFs.
 *
 * A documents screen with nothing behind the rows is a screen nobody can try.
 * These are printed by the same Chromium the project already carries for its
 * end-to-end tests, so the Hebrew is shaped and right-to-left properly rather
 * than reversed — which is what happens with every text renderer here that
 * lacks HarfBuzz.
 */

const SHELL = (title, inner) => `<!doctype html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 12pt/1.7 "Assistant","Arial Hebrew","Arial",sans-serif; color:#1b1f1d; }
  h1 { font-size: 19pt; margin: 0 0 2mm; }
  .sub { color:#6b736e; font-size:10pt; margin:0 0 8mm; }
  h2 { font-size: 12.5pt; margin: 7mm 0 2mm; border-bottom:1px solid #d8dcd8; padding-bottom:1.5mm; }
  table { width:100%; border-collapse:collapse; font-size:11pt; }
  td { padding:2mm 0; vertical-align:top; }
  td.k { color:#6b736e; width:38%; }
  ol { padding-inline-start:6mm; } li { margin-bottom:2.5mm; }
  .sign { margin-top:14mm; display:flex; gap:14mm; }
  .sign div { flex:1; border-top:1px solid #1b1f1d; padding-top:2mm; font-size:10pt; color:#6b736e; }
  .stamp { margin-top:10mm; font-size:9pt; color:#98a09a; border-top:1px dashed #d8dcd8; padding-top:3mm; }
</style></head><body>${inner}
<p class="stamp">מסמך הדגמה שנוצר עבור תיק הנכסים — אינו מסמך משפטי.</p>
</body></html>`;

const rows = (pairs) =>
  `<table>${pairs.map(([k, v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join('')}</table>`;

const ILS = (n) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const heDate = (iso) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

export const BODIES = {
  lease: (c) => SHELL('חוזה שכירות', `
    <h1>חוזה שכירות בלתי מוגנת</h1>
    <p class="sub">${c.property} · ${c.city}</p>
    ${rows([
      ['המשכיר', c.landlord],
      ['השוכר', c.tenant],
      ['טלפון השוכר', c.phone ?? '—'],
      ['תקופת השכירות', `${heDate(c.start)} — ${heDate(c.end)}`],
      ['דמי שכירות חודשיים', ILS(c.rent)],
      ['יום התשלום בחודש', c.paymentDay],
      ['פיקדון', c.deposit ? ILS(c.deposit) : 'ללא'],
      ['הצמדה למדד', c.cpi ? 'כן — מדד המחירים לצרכן' : 'לא'],
    ])}
    <h2>עיקרי ההסכם</h2>
    <ol>
      <li>השוכר ישלם את דמי השכירות מדי חודש בחודשו, ביום ${c.paymentDay} לחודש.</li>
      <li>השוכר יישא בתשלומי החשמל, המים, הארנונה והגז לתקופת השכירות.</li>
      <li>המשכיר יישא בתיקונים הנובעים מבלאי סביר ובביטוח המבנה.</li>
      <li>אין להשכיר בשכירות משנה ללא הסכמת המשכיר מראש ובכתב.</li>
      <li>הודעה על אי־חידוש תימסר לפחות 60 יום לפני תום התקופה.</li>
    </ol>
    <div class="sign"><div>חתימת המשכיר</div><div>חתימת השוכר</div></div>`),

  insurance: (c) => SHELL('פוליסת ביטוח מבנה', `
    <h1>פוליסת ביטוח מבנה</h1>
    <p class="sub">${c.property} · ${c.city}</p>
    ${rows([
      ['חברת הביטוח', c.insurer ?? '—'],
      ['מספר פוליסה', c.policy],
      ['בעל הפוליסה', c.landlord],
      ['תקופת הביטוח', `${heDate(c.start)} — ${heDate(c.end)}`],
      ['סכום ביטוח מבנה', ILS(c.sum)],
      ['השתתפות עצמית', ILS(c.excess)],
      ['כיסויים', 'אש, נזקי מים, רעידת אדמה, צד ג׳'],
    ])}
    <h2>הערות</h2>
    <ol>
      <li>הכיסוי לרעידת אדמה כפוף להשתתפות עצמית נפרדת.</li>
      <li>יש להודיע על שינוי בייעוד הנכס או על עבודות בנייה.</li>
    </ol>`),

  valuation: (c) => SHELL('הערכת שמאי', `
    <h1>חוות דעת שמאי מקרקעין</h1>
    <p class="sub">${c.property} · ${c.city}</p>
    ${rows([
      ['מזמין חוות הדעת', c.landlord],
      ['מועד הביקור בנכס', heDate(c.date)],
      ['שטח רשום', `${c.area} מ״ר`],
      ['מצב פיזי', 'טוב — שופץ בשנים האחרונות'],
      ['שווי שוק מוערך', ILS(c.value)],
      ['שווי לצורכי ביטוח', ILS(Math.round(c.value * 0.42))],
    ])}
    <h2>נימוקים עיקריים</h2>
    <ol>
      <li>עסקאות השוואה ברדיוס 300 מטר מששת החודשים האחרונים.</li>
      <li>מיקום מרכזי, ביקוש יציב להשכרה ארוכת טווח.</li>
      <li>הנכס כולל שטח חוץ צמוד המשפיע מהותית על השווי.</li>
    </ol>
    <div class="sign"><div>חתימת השמאי</div><div>מספר רישיון</div></div>`),

  municipal: (c) => SHELL('שובר ארנונה', `
    <h1>הודעת חיוב ארנונה</h1>
    <p class="sub">${c.property} · ${c.city}</p>
    ${rows([
      ['מספר נכס בעירייה', c.account],
      ['סוג הנכס', 'מסחרי'],
      ['שטח לחיוב', `${c.area} מ״ר`],
      ['תקופת החיוב', c.period],
      ['סכום לתשלום', ILS(c.amount)],
      ['מועד אחרון לתשלום', heDate(c.due)],
    ])}
    <h2>הערות</h2>
    <ol>
      <li>החיוב חל על המחזיק בנכס בפועל בתקופה הנקובה.</li>
      <li>ניתן להסדיר בהוראת קבע ולקבל הנחה על תשלום מראז לשנה.</li>
    </ol>`),

  approval: (c) => SHELL('אישור העדר חובות', `
    <h1>אישור העדר חובות — ועד הבית</h1>
    <p class="sub">${c.property} · ${c.city}</p>
    <p>הרינו לאשר כי בעל הדירה שבנדון, ${c.landlord}, אינו חב דבר לוועד הבית
    נכון ליום ${heDate(c.date)}, וכי כל תשלומי ועד הבית שולמו במלואם.</p>
    ${rows([
      ['תשלום חודשי לוועד', ILS(c.monthly)],
      ['יתרת חוב', ILS(0)],
      ['תוקף האישור', '90 יום ממועד ההנפקה'],
    ])}
    <div class="sign"><div>יו״ר ועד הבית</div><div>גזבר</div></div>`),
};

/** Print every document the portfolio declares. Returns [{ name, bytes }]. */
export async function renderDocuments(docs, lookup) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = [];
  try {
    for (const d of docs) {
      const ctx = lookup(d);
      const html = BODIES[d.body](ctx);
      await page.setContent(html, { waitUntil: 'load' });
      const bytes = await page.pdf({ format: 'A4', printBackground: true });
      out.push({ doc: d, bytes });
    }
  } finally {
    await browser.close();
  }
  return out;
}
