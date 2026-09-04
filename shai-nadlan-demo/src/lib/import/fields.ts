/**
 * What a column can mean, and how to tell.
 *
 * A fixed "Nadlanitor profile" would only ever read one vendor's export. This
 * catalog reads any sheet: each field carries the words people actually write
 * in a header, in Hebrew and in English, AND a shape test that looks at the
 * VALUES. The shape test is what lets the importer map a column whose header
 * is "עמודה 3", or a sheet with no header row at all.
 */

import { date as parseDate, money, num, phone as parsePhone, vocab } from './coerce';
import { PROPERTY_TYPES, PROPERTY_STATUS } from '../domain';

export type FieldGroup = 'property' | 'tenant' | 'lease';

export interface FieldDef {
  key: string;
  label: string;
  group: FieldGroup;
  /** Words that appear in a header meaning this field. Order is irrelevant;
   *  a longer match always outranks a shorter one. */
  synonyms: string[];
  /** 0..1 — how well a sample of this column's VALUES looks like this field. */
  shape?: (values: string[]) => number;
  /**
   * Tie-break used ONLY when the header says nothing and the values alone must
   * decide. Several fields legitimately share a value shape — a date column
   * could be a lease start or a purchase date, a money column could be the rent
   * or the asking rent — and with equal scores the winner would otherwise be
   * whichever happens to sit earlier in this array. This states the preference
   * out loud instead: in a landlord's table a bare date is far more often a
   * lease date than a purchase date. A header always overrules it.
   */
  valuePrior?: number;
  hint?: string;
}

/* ------------------------------------------------------------ vocabularies */

export const TYPE_WORDS: Record<string, string[]> = {
  apartment: ['דירה', 'דירת', 'apartment', 'flat', 'מגורים'],
  penthouse: ['פנטהאוז', 'פנטהאוס', 'penthouse'],
  garden_apartment: ['דירת גן', 'גן', 'garden'],
  house: ['בית פרטי', 'קוטג', 'וילה', 'house', 'villa', 'cottage'],
  commercial: ['מסחרי', 'חנות', 'מסחר', 'commercial', 'shop', 'retail'],
  office: ['משרד', 'משרדים', 'office'],
  storage: ['מחסן', 'storage', 'warehouse'],
  parking: ['חניה', 'חנייה', 'parking'],
};

export const STATUS_WORDS: Record<string, string[]> = {
  rented: ['מושכר', 'מאוכלס', 'תפוס', 'פעיל', 'rented', 'occupied', 'leased'],
  vacant: ['פנוי', 'ריק', 'לא מושכר', 'vacant', 'empty', 'available'],
  renovation: ['בשיפוץ', 'שיפוץ', 'שיפוצים', 'renovation', 'refurbishment'],
  for_sale: ['למכירה', 'מכירה', 'for sale', 'sale'],
};

/* A city list is not decoration: a column whose values are Israeli cities is a
   city column no matter what its header says, and that single signal maps the
   most common "address + city" sheet correctly on its own. */
export const CITIES = [
  'תל אביב', 'תל אביב יפו', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד', 'נתניה',
  'באר שבע', 'בני ברק', 'חולון', 'רמת גן', 'אשקלון', 'רחובות', 'בת ים', 'בית שמש', 'כפר סבא',
  'הרצליה', 'חדרה', 'מודיעין', 'מודיעין מכבים רעות', 'נצרת', 'לוד', 'רמלה', 'רעננה', 'רהט',
  'הוד השרון', 'גבעתיים', 'קריית אתא', 'קריית גת', 'נהריה', 'אום אל פחם', 'קריית ביאליק',
  'קריית אונו', 'אילת', 'ראש העין', 'עפולה', 'נס ציונה', 'עכו', 'אלעד', 'רמת השרון',
  'כרמיאל', 'טבריה', 'יבנה', 'טייבה', 'קריית מוצקין', 'שפרעם', 'נוף הגליל', 'אור יהודה',
  'קריית ים', 'מעלה אדומים', 'דימונה', 'צפת', 'נתיבות', 'סחנין', 'באקה אל גרביה', 'אופקים',
  'קריית שמונה', 'יהוד', 'יהוד מונוסון', 'טירה', 'ערד', 'גבעת שמואל', 'טירת כרמל', 'אריאל',
  'שדרות', 'מגדל העמק', 'ביתר עילית', 'מודיעין עילית', 'אור עקיבא', 'בית שאן', 'קלנסווה',
  'כפר קאסם', 'זכרון יעקב', 'רמת ישי', 'פרדס חנה כרכור', 'גני תקווה', 'קריית מלאכי',
  'מזכרת בתיה', 'קצרין', 'ירוחם', 'מצפה רמון', 'להבים', 'עומר', 'כוכב יאיר', 'שוהם',
  'בנימינה', 'קריית טבעון', 'כפר יונה', 'אבן יהודה', 'תל מונד', 'רמת גן גבעתיים',
];

const normCity = (s: string) =>
  s.replace(/["'׳״\-־]/g, ' ').replace(/\s+/g, ' ').trim();

const CITY_SET = new Set(CITIES.map(normCity));

export function looksLikeCity(v: string): boolean {
  const n = normCity(v);
  if (CITY_SET.has(n)) return true;
  // "תל אביב-יפו" and "ת\"א" style shorthands.
  for (const c of CITY_SET) if (n.length > 3 && (c.startsWith(n) || n.startsWith(c))) return true;
  return false;
}

/* -------------------------------------------------------------- shape tests */

/** Share of non-empty sample values for which `test` holds. A column is judged
 *  on the values that are actually there; a mostly-empty column simply carries
 *  little evidence rather than scoring zero. */
function ratio(values: string[], test: (v: string) => boolean): number {
  const present = values.filter((v) => v && v.trim());
  if (!present.length) return 0;
  return present.filter(test).length / present.length;
}

/**
 * How much a column's values are worth as evidence, from how many there are.
 *
 * Kept SEPARATE from the hit rate on purpose. Folding the sample size into the
 * ratio itself pushes a perfect 2-of-2 column below the shape tests' own
 * thresholds, so a small paste maps nothing — the discount belongs after the
 * decision, on the confidence, not before it on the evidence.
 */
export function sampleWeight(values: string[]): number {
  const present = values.filter((v) => v && v.trim()).length;
  return Math.min(1, present / 3);
}

const numeric = (v: string) => num(v).state === 'ok';
const numberIn = (min: number, max: number) => (v: string) => {
  const p = num(v);
  return p.state === 'ok' && p.value >= min && p.value <= max;
};

const shapeMoney = (min: number, max: number) => (vals: string[]) => {
  const r = ratio(vals, (v) => money(v, { min, max }).state === 'ok');
  // A column of numbers that are all in the band is strong evidence; a column
  // of numbers mostly outside it is evidence AGAINST, not merely absent.
  return r > 0.7 ? r : ratio(vals, numeric) > 0.7 ? -0.4 : 0;
};

const shapeDate = (vals: string[]) => {
  const r = ratio(vals, (v) => parseDate(v).state === 'ok');
  if (r > 0.6) return r;
  // A column of plain numbers is not a date column, whatever its title says.
  return ratio(vals, numeric) > 0.7 ? -0.5 : 0;
};

/**
 * Words, not numbers. The negative return is the important half: a column of
 * rents titled "עיר" must be pushed AWAY from city, and a shape test that
 * returns 0 for "these are not cities" is indistinguishable from one that
 * returns 0 for "I have no opinion". Contradiction and absence are different
 * answers and are scored differently.
 */
/** Two or more words, no digits: what a person's name looks like and what a
 *  property name ("דירה 4 ברוטשילד") usually does not. */
const shapePersonName = (vals: string[]) => {
  if (ratio(vals, numeric) > 0.5) return -0.5;
  const r = ratio(vals, (v) => {
    const s = v.trim();
    return !/\d/.test(s) && s.length >= 4 && s.length <= 40 && s.split(/\s+/).length >= 2;
  });
  return r > 0.6 ? r * 0.8 : 0;
};

const shapeText = (vals: string[]) => {
  if (ratio(vals, numeric) > 0.7) return -0.5;
  const r = ratio(vals, (v) => !numeric(v) && v.trim().length >= 2);
  return r > 0.7 ? r * 0.6 : 0;
};

/* -------------------------------------------------------------- the catalog */

export const FIELDS: FieldDef[] = [
  /* --- property --------------------------------------------------------- */
  {
    key: 'name', label: 'שם הנכס', group: 'property',
    synonyms: ['שם הנכס', 'שם נכס', 'כינוי', 'תיאור הנכס', 'תיאור', 'נכס', 'שם',
               'property name', 'name', 'title', 'description', 'unit'],
    shape: shapeText,
    hint: 'אם אין עמודה כזאת נרכיב שם מהכתובת',
    valuePrior: 0.9,
  },
  {
    key: 'address', label: 'כתובת', group: 'property',
    synonyms: ['כתובת הנכס', 'כתובת מלאה', 'כתובת', 'רחוב ומספר', 'רחוב',
               'address', 'street', 'full address'],
    shape: (vals) => {
      // A street line almost always carries a house number inside text.
      if (ratio(vals, numeric) > 0.7) return -0.5;
      const r = ratio(vals, (v) => /\d/.test(v) && /[\u0590-\u05FFa-zA-Z]/.test(v));
      return r > 0.6 ? r * 0.9 : shapeText(vals) * 0.5;
    },
  },
  {
    key: 'city', label: 'עיר', group: 'property',
    synonyms: ['עיר', 'ישוב', 'יישוב', 'עיר / יישוב', 'city', 'town', 'locality'],
    shape: (vals) => {
      // A place name is never a number, so numeric values are evidence against
      // — and a city we simply do not have in the list is merely no evidence.
      if (ratio(vals, numeric) > 0.7) return -0.6;
      const r = ratio(vals, looksLikeCity);
      return r > 0.5 ? Math.min(1, r + 0.15) : 0;
    },
  },
  {
    key: 'property_type', label: 'סוג נכס', group: 'property',
    synonyms: ['סוג הנכס', 'סוג נכס', 'סוג', 'type', 'property type', 'asset type'],
    shape: (vals) => ratio(vals, (v) => vocab(v, TYPE_WORDS).state === 'ok'),
  },
  {
    key: 'status', label: 'סטטוס', group: 'property',
    synonyms: ['סטטוס', 'מצב הנכס', 'מצב', 'תפוסה', 'status', 'state', 'occupancy'],
    shape: (vals) => ratio(vals, (v) => vocab(v, STATUS_WORDS).state === 'ok'),
  },
  {
    key: 'rooms', label: 'חדרים', group: 'property',
    synonyms: ['מספר חדרים', 'מס חדרים', 'חדרים', 'חדר', 'rooms', 'no of rooms', 'bedrooms'],
    shape: (vals) => {
      const r = ratio(vals, numberIn(1, 12));
      return r > 0.8 ? r * 0.85 : 0;
    },
  },
  {
    key: 'area_sqm', label: 'שטח (מ״ר)', group: 'property',
    synonyms: ['שטח במר', 'שטח מר', 'שטח', 'מר', 'מטר', 'area', 'sqm', 'size', 'm2'],
    shape: (vals) => {
      const r = ratio(vals, numberIn(8, 3000));
      return r > 0.8 ? r * 0.7 : 0;
    },
  },
  {
    key: 'floor_no', label: 'קומה', group: 'property',
    synonyms: ['קומה', 'floor', 'level'],
    shape: (vals) => {
      const r = ratio(vals, numberIn(-3, 80));
      return r > 0.8 ? r * 0.6 : 0;
    },
  },
  {
    key: 'asking_rent', label: 'שכ״ד מבוקש', group: 'property',
    synonyms: ['שכד מבוקש', 'שכר דירה מבוקש', 'מחיר מבוקש', 'שכירות מבוקשת', 'מבוקש',
               'asking rent', 'asking price', 'target rent'],
    shape: shapeMoney(300, 200_000),
    valuePrior: 0.85,
  },
  {
    key: 'purchase_price', label: 'מחיר רכישה', group: 'property',
    synonyms: ['מחיר רכישה', 'עלות רכישה', 'מחיר קניה', 'עלות', 'רכישה',
               'purchase price', 'cost', 'acquisition price'],
    shape: shapeMoney(50_000, 500_000_000),
  },
  {
    key: 'purchase_date', label: 'תאריך רכישה', group: 'property',
    synonyms: ['תאריך רכישה', 'תאריך קניה', 'יום רכישה', 'נרכש',
               'purchase date', 'bought', 'acquisition date'],
    shape: shapeDate,
    valuePrior: 0.75,
  },
  {
    key: 'current_value', label: 'שווי נוכחי', group: 'property',
    synonyms: ['שווי נוכחי', 'שווי משוער', 'שווי שוק', 'שווי', 'הערכת שווי',
               'current value', 'market value', 'valuation', 'value'],
    shape: shapeMoney(50_000, 500_000_000),
  },
  {
    key: 'insurance_expires_on', label: 'ביטוח — עד מתי', group: 'property',
    synonyms: ['תוקף ביטוח', 'ביטוח עד', 'פקיעת ביטוח', 'ביטוח',
               'insurance expiry', 'insurance until', 'insurance'],
    shape: shapeDate,
    valuePrior: 0.65,
  },
  {
    key: 'insurer', label: 'חברת הביטוח', group: 'property',
    synonyms: ['חברת ביטוח', 'מבטח', 'insurer', 'insurance company'],
    shape: shapeText,
  },
  {
    key: 'building', label: 'אתר / בניין', group: 'property',
    synonyms: ['בניין', 'אתר', 'פרויקט', 'מתחם', 'building', 'site', 'project', 'complex'],
    shape: shapeText,
    hint: 'ייווצר אוטומטית אם עוד לא קיים',
  },
  {
    key: 'entity', label: 'מי מחזיק בנכס', group: 'property',
    synonyms: ['ישות', 'ישות מחזיקה', 'על שם', 'בעלים', 'חברה מחזיקה', 'חברה', 'בעלות',
               'entity', 'holder', 'owner', 'company', 'held by'],
    shape: shapeText,
    hint: 'ייווצר אוטומטית אם עוד לא קיים',
  },
  {
    key: 'notes', label: 'הערות', group: 'property',
    synonyms: ['הערות', 'הערה', 'notes', 'note', 'comments', 'remarks'],
    shape: shapeText,
    valuePrior: 0.7,
  },

  /* --- tenant ----------------------------------------------------------- */
  {
    key: 'tenant_name', label: 'שם השוכר', group: 'tenant',
    synonyms: ['שם השוכר', 'שם הדייר', 'שוכר', 'דייר', 'שם דייר', 'מחזיק',
               'tenant', 'tenant name', 'lessee', 'renter'],
    shape: shapePersonName,
  },
  {
    key: 'tenant_phone', label: 'טלפון השוכר', group: 'tenant',
    synonyms: ['טלפון השוכר', 'טלפון', 'נייד', 'פלאפון', 'סלולרי', 'מספר טלפון',
               'phone', 'mobile', 'cell', 'telephone'],
    shape: (vals) => {
      const r = ratio(vals, (v) => parsePhone(v).state === 'ok');
      return r > 0.5 ? Math.min(1, r + 0.2) : 0;
    },
  },
  {
    key: 'tenant_email', label: 'אימייל השוכר', group: 'tenant',
    synonyms: ['אימייל', 'מייל', 'דואל', 'דואר אלקטרוני', 'email', 'e mail', 'mail'],
    shape: (vals) => ratio(vals, (v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim())),
  },

  /* --- lease ------------------------------------------------------------ */
  {
    key: 'monthly_rent', label: 'שכר דירה חודשי', group: 'lease',
    synonyms: ['שכר דירה חודשי', 'דמי שכירות', 'שכר דירה', 'שכד חודשי', 'שכד', 'שכירות',
               'monthly rent', 'rent', 'rental'],
    shape: shapeMoney(300, 200_000),
  },
  {
    key: 'lease_start', label: 'תחילת החוזה', group: 'lease',
    synonyms: ['תחילת חוזה', 'תחילת שכירות', 'תאריך כניסה', 'מתאריך', 'התחלה', 'כניסה',
               'lease start', 'start date', 'from', 'move in'],
    shape: shapeDate,
  },
  {
    key: 'lease_end', label: 'סיום החוזה', group: 'lease',
    synonyms: ['סיום חוזה', 'סוף חוזה', 'תאריך יציאה', 'עד תאריך', 'תום שכירות', 'סיום', 'יציאה',
               'lease end', 'end date', 'until', 'expiry', 'expiration'],
    shape: shapeDate,
    valuePrior: 0.9,
  },
  {
    key: 'payment_day', label: 'יום התשלום', group: 'lease',
    synonyms: ['יום תשלום', 'יום גבייה', 'יום בחודש', 'payment day', 'due day'],
    shape: (vals) => {
      const r = ratio(vals, numberIn(1, 31));
      return r > 0.9 ? r * 0.5 : 0;
    },
  },
  {
    key: 'deposit', label: 'פיקדון', group: 'lease',
    synonyms: ['פיקדון', 'פקדון', 'ערבון', 'בטחונות', 'deposit', 'security deposit'],
    shape: shapeMoney(100, 500_000),
  },
  {
    key: 'linked_to_cpi', label: 'צמוד למדד', group: 'lease',
    synonyms: ['צמוד למדד', 'צמוד מדד', 'הצמדה למדד', 'הצמדה', 'מדד', 'cpi', 'index linked'],
    shape: (vals) => ratio(vals, (v) => /^(כן|לא|yes|no|true|false|1|0|צמוד)$/i.test(v.trim())),
  },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** The three fields a property cannot be saved without. */
export const REQUIRED_PROPERTY_FIELDS = ['name', 'address', 'city'] as const;

export const GROUP_LABEL: Record<FieldGroup, string> = {
  property: 'הנכס',
  tenant: 'השוכר',
  lease: 'החוזה',
};

/* Re-exported so the review screen can render a mapped enum in the app's own
   words rather than the stored key. */
export { PROPERTY_TYPES, PROPERTY_STATUS };
