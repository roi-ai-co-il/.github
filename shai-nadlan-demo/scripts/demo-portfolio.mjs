/**
 * The demo portfolio.
 *
 * Data only — no database, no network. It is a separate file because the point
 * of a demo is that a person can read it, disagree with a number, and change
 * it without touching the code that writes it.
 *
 * Every screen in the system has something to show here on purpose:
 *   · two buildings with several flats each, so "אתרים" is populated
 *   · three holding entities, so "ישויות" means something
 *   · every one of the eight property types, so no filter is ever empty
 *   · a late payer, a lease about to end, an index update due, a deposit never
 *     collected and insurance about to expire, so "דורש טיפול" is real
 *   · an ended lease, so a property has history rather than only a present
 */

/** Days from today, as an ISO date. Everything is relative so the demo never
 *  goes stale — the alerts still fire a month from now. */
export function day(offset, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Months from today, keeping the day of month where the month allows it. */
export function month(offset, dayOfMonth = 1, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth() + offset, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const dd = Math.min(dayOfMonth, last);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export const ENTITIES = [
  { key: 'private', name: 'שי עובדיה', entity_type: 'יחיד',
    notes: 'הנכסים הוותיקים, רשומים על שם פרטי.' },
  { key: 'company', name: 'ש.ע. נכסים בע״מ', entity_type: 'חברה', tax_id: '515248803',
    notes: 'הנכסים המסחריים והמשרדים.' },
  { key: 'partnership', name: 'עובדיה ושות׳ — שותפות נדל״ן', entity_type: 'שותפות',
    notes: 'שותפות עם אחי על מגדל ויצמן. 50/50.' },
];

export const BUILDINGS = [
  /* Named 'בניין רוטשילד' and not 'בית רוטשילד': a site holds six separate
     units, and "6 נכסים בבית רוטשילד" reads like six flats inside somebody's
     house. 'בית X' is ordinary Israeli usage for an apartment block, but the
     demo has to be unambiguous on first read. */
  { key: 'rothschild', name: 'בניין רוטשילד', address: 'רוטשילד 12', city: 'תל אביב',
    entity: 'private', notes: 'בניין באוהאוס משומר, 4 קומות. ועד בית פעיל, אין מעלית.' },
  { key: 'weizmann', name: 'מגדל ויצמן', address: 'ויצמן 8', city: 'רמת גן',
    entity: 'partnership', notes: 'מגדל מגורים חדש עם לובי, חניון תת־קרקעי ומעליות.' },
];

export const VENDORS = [
  { name: 'אבי כהן', trade: 'אינסטלטור', phone: '0522345671', notes: 'זמין גם בסופ״ש. מטפל בכל הבניין ברוטשילד.' },
  { name: 'מוטי לוי', trade: 'חשמלאי', phone: '0543456782', notes: 'חשמלאי מוסמך, עושה גם בדיקות תקינות.' },
  { name: 'נועם קירור', trade: 'מזגנים', phone: '0503456783', notes: 'שירות ותחזוקה שנתית למזגנים.' },
  { name: 'שיפוצי הדר', trade: 'שיפוצים', phone: '0526789014', notes: 'עושים את השיפוץ בחיפה.' },
  { name: 'ניקיון פלוס', trade: 'ניקיון', phone: '0547890125', notes: 'ניקיון בין דיירים.' },
  { name: 'עו״ד רונית שמש', trade: 'עורך דין', phone: '0508901236', email: 'ronit@shemesh-law.co.il', notes: 'חוזי שכירות ופינויים.' },
  { name: 'מעליות שחר', trade: 'מעליות', phone: '0529012347', notes: 'הצעת מחיר למעלית בבניין רוטשילד.' },
];

/**
 * `payments` says what the collection history looks like:
 *   'ontime'  every due month up to now is paid
 *   'late1'   last month never arrived
 *   'late2'   the last two months never arrived
 *   'none'    nothing paid yet (a lease that only just started)
 */
export const PROPERTIES = [
  /* ---- בניין רוטשילד, תל אביב ------------------------------------------ */
  {
    image: 'p01-tlv-flat-3r', gallery: ['g-rothschild-exterior'],
    name: 'רוטשילד 12, דירה 3', address: 'רוטשילד 12 קומה 1 דירה 3', city: 'תל אביב',
    property_type: 'apartment', rooms: 3, area_sqm: 72, floor_no: 1,
    purchase_price: 2350000, purchase_date: '2016-04-12', current_value: 3250000,
    building: 'rothschild', entity: 'private',
    insurer: 'הראל', insurance_expires_on: month(7, 1),
    notes: 'שופצה ב־2021. מרפסת מעוגלת לרחוב.',
    lease: { tenant: 'דנה כהן', phone: '0541234567', email: 'dana.cohen@gmail.com',
      rent: 6800, start: month(-10, 1), end: month(2, 1), payment_day: 1,
      deposit: 13600, deposit_received: true, cpi: false, payments: 'ontime' },
  },
  {
    image: 'p02-tlv-flat-4r',
    name: 'רוטשילד 12, דירה 5', address: 'רוטשילד 12 קומה 2 דירה 5', city: 'תל אביב',
    property_type: 'apartment', rooms: 4, area_sqm: 92, floor_no: 2,
    purchase_price: 2900000, purchase_date: '2014-09-01', current_value: 3900000,
    building: 'rothschild', entity: 'private',
    insurer: 'הראל', insurance_expires_on: month(7, 1),
    notes: 'הדייר מאחר בתשלומים כבר חודשיים. לדבר איתו.',
    lease: { tenant: 'אבי מזרחי', phone: '0527654321',
      rent: 7900, start: month(-18, 5), end: month(6, 5), payment_day: 5,
      deposit: 15800, deposit_received: true, cpi: false, payments: 'late2' },
  },
  {
    image: 'p03-tlv-kitchen',
    name: 'רוטשילד 12, דירה 8', address: 'רוטשילד 12 קומה 3 דירה 8', city: 'תל אביב',
    property_type: 'apartment', rooms: 3.5, area_sqm: 84, floor_no: 3,
    purchase_price: 2600000, purchase_date: '2018-02-20', current_value: 3400000,
    building: 'rothschild', entity: 'private',
    insurer: 'הראל', insurance_expires_on: month(7, 1),
    notes: 'החוזה נגמר בקרוב — לשאול אם היא מחדשת.',
    lease: { tenant: 'נועה פרידמן', phone: '0538889977', email: 'noaf@outlook.com',
      rent: 7200, start: day(-690), end: day(38), payment_day: 10,
      deposit: 14400, deposit_received: true, cpi: false, payments: 'ontime' },
  },
  {
    image: 'p04-penthouse-terrace', gallery: ['g-penthouse-living', 'g-bathroom'],
    name: 'פנטהאוז רוטשילד 12', address: 'רוטשילד 12 קומה 4 דירה 14', city: 'תל אביב',
    property_type: 'penthouse', rooms: 5, area_sqm: 140, floor_no: 4,
    purchase_price: 5800000, purchase_date: '2012-06-15', current_value: 8900000,
    building: 'rothschild', entity: 'private',
    insurer: 'מנורה', insurance_expires_on: month(9, 20),
    notes: 'גג פרטי 60 מ״ר. החוזה צמוד מדד — לעדכן פעם בשנה.',
    lease: { tenant: 'איתן שרון', phone: '0501112233', email: 'eitan.sharon@gmail.com',
      rent: 16500, start: month(-25, 1), end: month(11, 1), payment_day: 1,
      deposit: 33000, deposit_received: true, cpi: true, cpiUpdatedMonthsAgo: 13,
      payments: 'ontime' },
  },
  {
    image: 'p05-parking',
    name: 'חניה 4, רוטשילד 12', address: 'רוטשילד 12 קומה -1 חניה 4', city: 'תל אביב',
    property_type: 'parking', area_sqm: 12, floor_no: -1,
    purchase_price: 180000, purchase_date: '2012-06-15', current_value: 260000,
    building: 'rothschild', entity: 'private', asking_rent: 450,
    notes: 'חניה מקורה. אפשר להשכיר בנפרד מהדירות.',
    status: 'vacant',
  },
  {
    image: 'p06-storage',
    name: 'מחסן 2, רוטשילד 12', address: 'רוטשילד 12 קומה -1 מחסן 2', city: 'תל אביב',
    property_type: 'storage', area_sqm: 8, floor_no: -1,
    purchase_price: 90000, purchase_date: '2012-06-15', current_value: 140000,
    building: 'rothschild', entity: 'private',
    notes: 'מושכר לדיירת מהבניין ממול.',
    lease: { tenant: 'יעל בן־דוד', phone: '0546667788',
      rent: 350, start: month(-14, 1), end: month(10, 1), payment_day: 1,
      deposit: null, deposit_received: false, cpi: false, payments: 'ontime' },
  },

  /* ---- מגדל ויצמן, רמת גן -------------------------------------------- */
  {
    image: 'p07-tower-flat', gallery: ['g-weizmann-tower'],
    name: 'ויצמן 8, דירה 12', address: 'ויצמן 8 קומה 4 דירה 12', city: 'רמת גן',
    property_type: 'apartment', rooms: 4, area_sqm: 98, floor_no: 4,
    purchase_price: 2750000, purchase_date: '2021-11-03', current_value: 3300000,
    building: 'weizmann', entity: 'partnership',
    insurer: 'כלל', insurance_expires_on: month(5, 15),
    notes: 'מרפסת שמש 12 מ״ר, חניה ומחסן צמודים.',
    lease: { tenant: 'אורי לוי', phone: '0523334455', email: 'uri.levi@gmail.com',
      rent: 6400, start: month(-7, 1), end: month(5, 1), payment_day: 1,
      deposit: 12800, deposit_received: true, cpi: false, payments: 'ontime' },
  },
  {
    image: 'p08-empty-flat',
    name: 'ויצמן 8, דירה 27', address: 'ויצמן 8 קומה 9 דירה 27', city: 'רמת גן',
    property_type: 'apartment', rooms: 3, area_sqm: 76, floor_no: 9,
    purchase_price: 2400000, purchase_date: '2021-11-03', current_value: 2950000,
    building: 'weizmann', entity: 'partnership', asking_rent: 6900,
    notes: 'התפנתה החודש. לצלם ולפרסם.',
    status: 'vacant',
  },
  {
    image: 'p09-office-small',
    name: 'משרד 3, ויצמן 8', address: 'ויצמן 8 קומה 1 משרד 3', city: 'רמת גן',
    property_type: 'office', area_sqm: 65, floor_no: 1,
    purchase_price: 1650000, purchase_date: '2021-11-03', current_value: 2050000,
    building: 'weizmann', entity: 'company',
    notes: 'הפיקדון עדיין לא נגבה — לבדוק מול השוכר.',
    lease: { tenant: 'אלפא ייעוץ בע״מ', phone: '0779001234', email: 'office@alpha-consulting.co.il',
      rent: 5200, start: month(-4, 1), end: month(20, 1), payment_day: 1,
      deposit: 15600, deposit_received: false, cpi: true, cpiUpdatedMonthsAgo: 4,
      payments: 'ontime' },
  },

  /* ---- נכסים בודדים --------------------------------------------------- */
  {
    image: 'p10-villa',
    name: 'הווילה ברעננה', address: 'הנרייטה סולד 14', city: 'רעננה',
    property_type: 'house', rooms: 6, area_sqm: 210, floor_no: 0,
    purchase_price: 4900000, purchase_date: '2019-07-22', current_value: 7200000,
    entity: 'private',
    insurer: 'AIG', insurance_expires_on: day(18),
    notes: 'מגרש 480 מ״ר, בריכה. הביטוח נגמר בקרוב.',
    lease: { tenant: 'משפחת אזולאי', phone: '0544445566', email: 'azoulay.family@gmail.com',
      rent: 14500, start: month(-13, 1), end: month(11, 1), payment_day: 1,
      deposit: 29000, deposit_received: true, cpi: true, cpiUpdatedMonthsAgo: 2,
      payments: 'ontime' },
  },
  {
    image: 'p11-garden-apt',
    name: 'דירת גן, כפר סבא', address: 'הזית 3 דירה 1', city: 'כפר סבא',
    property_type: 'garden_apartment', rooms: 4, area_sqm: 105, floor_no: 0,
    purchase_price: 2450000, purchase_date: '2020-03-10', current_value: 3150000,
    entity: 'private',
    insurer: 'כלל', insurance_expires_on: month(4, 10),
    notes: 'גינה פרטית 60 מ״ר. הדיירת מטפחת אותה בעצמה.',
    lease: { tenant: 'רונית שגב', phone: '0525556677',
      rent: 8600, start: month(-9, 1), end: month(3, 1), payment_day: 1,
      deposit: 17200, deposit_received: true, cpi: false, payments: 'ontime' },
  },
  {
    image: 'p12-shop',
    name: 'חנות בז׳בוטינסקי', address: 'ז׳בוטינסקי 45', city: 'פתח תקווה',
    property_type: 'commercial', area_sqm: 88, floor_no: 0,
    purchase_price: 2100000, purchase_date: '2017-05-30', current_value: 2800000,
    entity: 'company',
    insurer: 'הפניקס', insurance_expires_on: month(6, 1),
    notes: 'פיצרייה. איחור של חודש בתשלום.',
    lease: { tenant: 'פיצה נונו בע״מ', phone: '0399887766', email: 'nono.pizza@gmail.com',
      rent: 9800, start: month(-22, 1), end: month(14, 1), payment_day: 1,
      deposit: 29400, deposit_received: true, cpi: true, cpiUpdatedMonthsAgo: 6,
      payments: 'late1' },
  },
  {
    image: 'p13-renovation',
    name: 'הרצל 22, חיפה', address: 'הרצל 22 דירה 4', city: 'חיפה',
    property_type: 'apartment', rooms: 3, area_sqm: 68, floor_no: 2,
    purchase_price: 990000, purchase_date: '2023-08-14', current_value: 1350000,
    entity: 'private', asking_rent: 4200,
    notes: 'בשיפוץ. אינסטלציה וחשמל הוחלפו, נשארו ריצוף וצבע.',
    status: 'renovation',
  },
  {
    image: 'p14-batyam-sea',
    name: 'שדרות ירושלים 60, בת ים', address: 'שדרות ירושלים 60 דירה 9', city: 'בת ים',
    property_type: 'apartment', rooms: 2.5, area_sqm: 58, floor_no: 3,
    purchase_price: 1150000, purchase_date: '2015-01-19', current_value: 1750000,
    entity: 'private',
    notes: 'הוצאה למכירה. נוף לים. הדיירת הקודמת עזבה בסוף החוזה.',
    status: 'for_sale',
    endedLease: { tenant: 'שמעון גולן', phone: '0536664422',
      rent: 4900, start: month(-26, 1), end: month(-2, 1), payment_day: 1,
      deposit: 9800, deposit_received: true },
  },
  {
    image: 'p15-office-empty',
    name: 'משרד באלנבי', address: 'אלנבי 91 קומה 2', city: 'תל אביב',
    property_type: 'office', area_sqm: 120, floor_no: 2,
    purchase_price: 2900000, purchase_date: '2022-10-05', current_value: 3600000,
    entity: 'company', asking_rent: 7500,
    notes: 'קומה פתוחה. מתאים לסטארטאפ קטן או קליניקה.',
    status: 'vacant',
  },
];

/** Tasks reference a property by its `name`. */
export const TASKS = [
  { title: 'לשאול את נועה פרידמן אם היא מחדשת', property: 'רוטשילד 12, דירה 8',
    due: day(7), notes: 'החוזה נגמר בעוד כחודש. אם לא — לצלם ולפרסם.' },
  { title: 'לדבר עם אבי מזרחי על שני התשלומים', property: 'רוטשילד 12, דירה 5',
    due: day(-3), notes: 'שני חודשים באיחור. אם לא נסגר עד סוף השבוע — להעביר לעו״ד שמש.' },
  { title: 'לחדש ביטוח מבנה לווילה', property: 'הווילה ברעננה',
    due: day(14), notes: 'AIG. לבקש הצעה גם מהראל להשוואה.' },
  { title: 'לעדכן מדד בחוזה של הפנטהאוז', property: 'פנטהאוז רוטשילד 12',
    due: day(4), notes: 'עברה שנה מהעדכון האחרון.' },
  { title: 'לגבות פיקדון מאלפא ייעוץ', property: 'משרד 3, ויצמן 8',
    due: day(2), notes: '15,600 ₪ שעדיין לא נגבו.' },
  { title: 'לקבל הצעת מחיר למעלית בבניין רוטשילד', due: day(21),
    notes: 'מעליות שחר. ועד הבית מוכן להשתתף בחצי.' },
  { title: 'לתאם ריצוף בדירה בחיפה', property: 'הרצל 22, חיפה',
    due: day(9), notes: 'שיפוצי הדר. לבחור גוון לפני שמזמינים.' },
  { title: 'לצלם את המשרד באלנבי לפרסום', property: 'משרד באלנבי',
    due: day(-10), done: true },
  { title: 'לחדש את חוזה הניקיון בלובי', due: day(-20), done: true },
];

/** Documents rendered as real PDFs at seed time and uploaded to the private bucket. */
export const DOCUMENTS = [
  { property: 'רוטשילד 12, דירה 3', doc_type: 'חוזה', title: 'חוזה שכירות — דנה כהן',
    dateOffsetMonths: -10, body: 'lease' },
  { property: 'רוטשילד 12, דירה 5', doc_type: 'חוזה', title: 'חוזה שכירות — אבי מזרחי',
    dateOffsetMonths: -18, body: 'lease' },
  { property: 'הווילה ברעננה', doc_type: 'ביטוח', title: 'פוליסת ביטוח מבנה — AIG',
    dateOffsetMonths: -6, body: 'insurance' },
  { property: 'פנטהאוז רוטשילד 12', doc_type: 'שמאות', title: 'הערכת שמאי — ינואר',
    dateOffsetMonths: -8, body: 'valuation' },
  { property: 'חנות בז׳בוטינסקי', doc_type: 'ארנונה', title: 'שובר ארנונה — רבעון נוכחי',
    dateOffsetMonths: -1, body: 'municipal' },
  { property: 'הרצל 22, חיפה', doc_type: 'אישור', title: 'אישור העדר חובות — ועד הבית',
    dateOffsetMonths: -2, body: 'approval' },
];
