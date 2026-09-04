/**
 * From mapped columns to "here is exactly what will be written".
 *
 * Nothing here touches the database. It produces a plan the user reads and
 * edits row by row, and only then does the writer act on it — so the screen
 * the user approves and the rows that get created are the same object.
 */

import {
  bool, date as parseDate, detectDateOrder, int, money, num, phone as parsePhone,
  text as parseText, vocab, clean, type DateOrder, type Parsed,
} from './coerce';
import { buildingKey, buildingNameFor, parseAddress } from './address';
import { FIELD_BY_KEY, STATUS_WORDS, TYPE_WORDS } from './fields';
import type { ColumnMapping } from './match';

export type IssueLevel = 'error' | 'warn' | 'info';

export interface Issue {
  field: string;
  level: IssueLevel;
  text: string;
}

export interface PlannedProperty {
  name: string;
  address: string;
  city: string;
  property_type: string;
  status: string;
  rooms: number | null;
  area_sqm: number | null;
  floor_no: number | null;
  asking_rent: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  current_value: number | null;
  insurance_expires_on: string | null;
  insurer: string | null;
  notes: string | null;
  buildingName: string | null;
  entityName: string | null;
}

export interface PlannedTenant {
  full_name: string;
  phone: string | null;
  email: string | null;
}

export interface PlannedLease {
  monthly_rent: number;
  start_date: string;
  end_date: string;
  payment_day: number;
  deposit: number | null;
  linked_to_cpi: boolean;
  /** True when we supplied the end date rather than read it. Shown in the UI. */
  endAssumed: boolean;
}

export type RowDecision = 'create' | 'skip' | 'merge';

export interface PlannedRow {
  index: number;               // 0-based position in the body
  sourceRow: number;           // 1-based row number in the original sheet
  raw: string[];
  property: PlannedProperty;
  tenant: PlannedTenant | null;
  lease: PlannedLease | null;
  issues: Issue[];
  /** Fields we filled in ourselves rather than read. Rendered highlighted. */
  derived: string[];
  decision: RowDecision;
  /** Set when this row matches a property that already exists. */
  duplicateOf: { id: string; name: string } | null;
  /** Set when an EARLIER row in the same file has the same address. */
  duplicateOfRow: number | null;
  /** When several rows share one street address, the building we would create
   *  for them. Null for a property that stands alone. */
  autoBuilding: string | null;
}

/** A building the file implies rather than names: several units at one street
 *  address. Shai's addresses look like "רוטשילד 12 קומה 1 דירה 2", so this is
 *  the normal case for him, not an edge case. */
export interface DetectedBuilding {
  name: string;
  rows: number[];
}

export interface ExistingProperty { id: string; name: string; address: string; city: string }

export interface PlanOptions {
  /** Mark every due month before the current one as already paid. Default on:
   *  an imported active lease that has been running for a year would otherwise
   *  arrive as twelve red overdue payments, which is a wall of false alarm. */
  markPastPaid: boolean;
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = { markPastPaid: true };

/* ---------------------------------------------------------- normalisation */

/** For duplicate detection only. Punctuation and the word "רחוב" vary between
 *  two spellings of the same street; an apartment number does NOT — two units
 *  in one building are two properties and must never be merged into one. */
export function normalizeAddress(address: string, city: string): string {
  // A word boundary cannot be expressed as \b here: the default word-character
  // class is ASCII-only and matches no Hebrew letter at all, so /\bרח\b/ never
  // fires. The words are dropped token by token instead, which is also the only
  // way "רח" inside "רחביה" stays untouched.
  const STREET_WORDS = new Set(['רחוב', 'רח', 'שדרות', 'שד', 'שדרת', 'סמטת', 'דרך']);
  const strip = (s: string) =>
    clean(s)
      .replace(/["'׳״]/g, '')
      .replace(/[.,\-־/\\]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STREET_WORDS.has(w))
      .join(' ')
      .toLowerCase();
  return `${strip(address)}|${strip(city)}`;
}

/* ------------------------------------------------------------- the builder */

interface Reader {
  get(fieldKey: string): string;
  has(fieldKey: string): boolean;
}

function makeReader(row: string[], byField: Map<string, number>): Reader {
  return {
    get: (k) => {
      const c = byField.get(k);
      return c == null ? '' : clean(row[c] ?? '');
    },
    has: (k) => byField.has(k),
  };
}

/** Record a parse failure as an issue rather than substituting a value. */
function take<T>(p: Parsed<T>, fieldKey: string, issues: Issue[], level: IssueLevel = 'warn'): T | null {
  if (p.state === 'ok') return p.value;
  if (p.state === 'empty') return null;
  const label = FIELD_BY_KEY.get(fieldKey)?.label ?? fieldKey;
  issues.push({ field: fieldKey, level, text: `לא הצלחנו לקרוא ${label}: „${p.raw}”` });
  return null;
}

/** Today as a plain calendar day in the user's own timezone. */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** One rule for "this lease is over", used by the plan AND by the writer, so
 *  the status on the property and the status on the lease cannot disagree. */
export function leaseHasEnded(endDate: string, now = new Date()): boolean {
  return endDate < todayIso(now);
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp to the last real day of the target month: 31/01 + 1 month is 28/02,
  // never 03/03.
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface BuildPlanInput {
  headers: string[];
  body: string[][];
  headerRow: number;
  mappings: ColumnMapping[];
  existing: ExistingProperty[];
  options?: PlanOptions;
}

export interface Plan {
  rows: PlannedRow[];
  /** Which way round each date column was read, and whether that was proven. */
  dateOrder: { order: DateOrder; evidence: 'proven' | 'assumed' };
  /** Buildings the addresses imply. Empty for a scattered portfolio. */
  detectedBuildings: DetectedBuilding[];
}

export function buildPlan(input: BuildPlanInput): Plan {
  const { headers, body, headerRow, mappings, existing } = input;
  void headers;

  const byField = new Map<string, number>();
  for (const m of mappings) if (m.fieldKey) byField.set(m.fieldKey, m.column);

  /* The order of every date column is decided ONCE, from all their values
     together — a per-cell guess would read 03/04 and 05/04 differently. */
  const dateCols = ['purchase_date', 'lease_start', 'lease_end', 'insurance_expires_on']
    .map((k) => byField.get(k))
    .filter((c): c is number => c != null);
  const dateSample = body.flatMap((r) => dateCols.map((c) => r[c] ?? ''));
  const dateOrder = detectDateOrder(dateSample);

  const existingByAddress = new Map<string, ExistingProperty>();
  for (const p of existing) existingByAddress.set(normalizeAddress(p.address, p.city), p);

  const seenInFile = new Map<string, number>();
  const rows: PlannedRow[] = [];

  body.forEach((raw, index) => {
    const issues: Issue[] = [];
    const derived: string[] = [];
    const r = makeReader(raw, byField);

    /* ---- property ---------------------------------------------------- */
    let address = r.get('address');
    let city = r.get('city');

    // One "כתובת" column often carries the city after a comma. Splitting it is
    // a real reading of the cell — but it is still OUR reading, so the field is
    // marked derived and shown highlighted rather than passed off as given.
    if (address && !city && address.includes(',')) {
      const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        city = parts[parts.length - 1];
        address = parts.slice(0, -1).join(', ');
        derived.push('city');
      }
    }

    /* The unit is usually written inside the address. Reading it costs nothing
       and fills in a floor the file never had a column for. */
    const parsedAddr = parseAddress(address);

    let name = r.get('name');
    if (!name) {
      // A property must be called something. The address is the honest choice —
      // it is what the user would have typed — and it is marked derived.
      if (address) { name = city ? `${address}, ${city}` : address; derived.push('name'); }
    }

    if (!name) issues.push({ field: 'name', level: 'error', text: 'אין שם ואין כתובת — אי אפשר ליצור נכס' });
    if (!address) issues.push({ field: 'address', level: 'error', text: 'חסרה כתובת' });
    if (!city) issues.push({ field: 'city', level: 'error', text: 'חסרה עיר' });

    const typeParsed = r.has('property_type') ? vocab(r.get('property_type'), TYPE_WORDS) : { state: 'empty' as const };
    let property_type = 'apartment';
    if (typeParsed.state === 'ok') property_type = typeParsed.value;
    else if (typeParsed.state === 'unreadable') {
      issues.push({ field: 'property_type', level: 'warn', text: `„${typeParsed.raw}” אינו סוג נכס מוכר — נשמר כדירה` });
      derived.push('property_type');
    } else if (!r.has('property_type')) derived.push('property_type');

    const statusParsed = r.has('status') ? vocab(r.get('status'), STATUS_WORDS) : { state: 'empty' as const };

    const property: PlannedProperty = {
      name, address, city, property_type,
      status: 'vacant',                       // decided below, once the lease is known
      rooms: take(num(r.get('rooms')), 'rooms', issues),
      area_sqm: take(num(r.get('area_sqm')), 'area_sqm', issues),
      floor_no: take(int(r.get('floor_no'), { min: -5, max: 100 }), 'floor_no', issues),
      asking_rent: take(money(r.get('asking_rent'), { min: 0, max: 1_000_000 }), 'asking_rent', issues),
      purchase_price: take(money(r.get('purchase_price'), { min: 0, max: 1_000_000_000 }), 'purchase_price', issues),
      purchase_date: take(parseDate(r.get('purchase_date'), dateOrder.order), 'purchase_date', issues),
      current_value: take(money(r.get('current_value'), { min: 0, max: 1_000_000_000 }), 'current_value', issues),
      insurance_expires_on: take(parseDate(r.get('insurance_expires_on'), dateOrder.order), 'insurance_expires_on', issues),
      insurer: take(parseText(r.get('insurer')), 'insurer', issues),
      notes: take(parseText(r.get('notes')), 'notes', issues),
      buildingName: take(parseText(r.get('building')), 'building', issues),
      entityName: take(parseText(r.get('entity')), 'entity', issues),
    };

    // A floor written inside the address is used only when no column gave one,
    // so an explicit column always wins over our reading of the text.
    if (property.floor_no == null && parsedAddr.floor != null) {
      property.floor_no = parsedAddr.floor;
      derived.push('floor_no');
    }

    /* ---- tenant ------------------------------------------------------- */
    const tenantName = r.get('tenant_name');
    let tenant: PlannedTenant | null = null;
    if (tenantName) {
      tenant = {
        full_name: tenantName,
        phone: take(parsePhone(r.get('tenant_phone')), 'tenant_phone', issues),
        email: take(parseText(r.get('tenant_email')), 'tenant_email', issues),
      };
      const rawPhone = r.get('tenant_phone');
      if (rawPhone && !tenant.phone) {
        // A phone we could not normalise is kept as a note rather than dropped:
        // the digits are still worth more to the user than nothing.
        property.notes = [property.notes, `טלפון מהקובץ: ${rawPhone}`].filter(Boolean).join(' · ');
      }
    } else if (r.has('tenant_phone') && r.get('tenant_phone')) {
      issues.push({ field: 'tenant_name', level: 'warn', text: 'יש טלפון אבל אין שם שוכר — לא ייווצר שוכר' });
    }

    /* ---- lease -------------------------------------------------------- */
    let lease: PlannedLease | null = null;
    const rentParsed = money(r.get('monthly_rent'), { min: 0, max: 1_000_000 });
    const rent = take(rentParsed, 'monthly_rent', issues);
    const startParsed = parseDate(r.get('lease_start'), dateOrder.order);
    const start = take(startParsed, 'lease_start', issues);
    const endRead = take(parseDate(r.get('lease_end'), dateOrder.order), 'lease_end', issues);

    if (tenant && rent != null && rent > 0 && start) {
      let end = endRead;
      let endAssumed = false;
      if (!end) { end = addMonths(start, 12); endAssumed = true; }
      if (end <= start) {
        issues.push({ field: 'lease_end', level: 'warn', text: 'תאריך הסיום אינו אחרי ההתחלה — הוארך בשנה מההתחלה' });
        end = addMonths(start, 12);
        endAssumed = true;
      }
      lease = {
        monthly_rent: rent,
        start_date: start,
        end_date: end,
        payment_day: take(int(r.get('payment_day'), { min: 1, max: 31 }), 'payment_day', issues) ?? 1,
        deposit: take(money(r.get('deposit'), { min: 0, max: 1_000_000 }), 'deposit', issues),
        linked_to_cpi: take(bool(r.get('linked_to_cpi')), 'linked_to_cpi', issues) ?? false,
        endAssumed,
      };
      if (endAssumed) derived.push('lease_end');
      if (!r.has('payment_day')) derived.push('payment_day');
    } else if (tenant && (rent == null || !start)) {
      const missing = [rent == null ? 'שכר דירה' : null, !start ? 'תאריך תחילת חוזה' : null]
        .filter(Boolean).join(' ו');
      issues.push({ field: 'lease_start', level: 'warn', text: `יש שוכר אבל חסר ${missing} — ייווצר נכס בלי חוזה` });
    }

    /* ---- status ------------------------------------------------------- */
    // A lease whose term ran out last month does NOT make the property rented
    // today. It is imported as history, and the property goes back to whatever
    // the file said about it — or to vacant, which is what it actually is.
    if (lease && !leaseHasEnded(lease.end_date)) {
      property.status = 'rented';
      if (statusParsed.state === 'ok' && statusParsed.value !== 'rented') {
        issues.push({ field: 'status', level: 'info', text: `בקובץ כתוב „${r.get('status')}” אבל יש חוזה פעיל — הנכס יסומן כמושכר` });
      }
    } else if (lease) {
      property.status = statusParsed.state === 'ok' ? statusParsed.value : 'vacant';
      issues.push({
        field: 'lease_end',
        level: 'info',
        text: `החוזה כבר הסתיים (${lease.end_date}) — הוא יישמר כהיסטוריה, והנכס לא יסומן כמושכר`,
      });
    } else if (statusParsed.state === 'ok') {
      property.status = statusParsed.value;
    } else if (statusParsed.state === 'unreadable') {
      issues.push({ field: 'status', level: 'warn', text: `„${statusParsed.raw}” אינו סטטוס מוכר — נשמר כפנוי` });
      derived.push('status');
    } else {
      derived.push('status');
    }
    // A vacant property with a rent figure and no tenant: that figure is what
    // he WANTS for it, which is exactly what asking_rent means.
    if (!lease && property.asking_rent == null && rent != null && rent > 0) {
      property.asking_rent = rent;
      derived.push('asking_rent');
    }

    /* ---- duplicates --------------------------------------------------- */
    const key = normalizeAddress(address, city);
    const already = address && city ? existingByAddress.get(key) : undefined;
    const earlier = address && city ? seenInFile.get(key) : undefined;
    if (address && city && earlier == null) seenInFile.set(key, index);

    const hasError = issues.some((i) => i.level === 'error');

    rows.push({
      index,
      sourceRow: headerRow + 2 + index,
      raw,
      property,
      tenant,
      lease,
      issues,
      derived,
      // A row we cannot save, or one that already exists, defaults to skipped —
      // the safe default is never to write.
      decision: hasError || already || earlier != null ? 'skip' : 'create',
      duplicateOf: already ? { id: already.id, name: already.name } : null,
      duplicateOfRow: earlier ?? null,
      autoBuilding: null,
    });
  });

  /* ---- buildings the addresses imply ---------------------------------- */
  // Grouped on the address WITHOUT its unit, which is a different key from the
  // one duplicate detection uses on purpose: two flats in one building are two
  // properties AND one building, and both facts have to survive.
  const byBuilding = new Map<string, { name: string; rows: number[] }>();
  for (const row of rows) {
    const { address: a, city: c } = row.property;
    if (!a || !c || row.decision === 'skip') continue;
    // Only an address that actually names a unit implies a building; two
    // unrelated properties that merely share a street would be a false group.
    if (!parseAddress(a).hasUnit) continue;
    const key = buildingKey(a, c);
    const g = byBuilding.get(key) ?? { name: buildingNameFor(a, c), rows: [] };
    g.rows.push(row.index);
    byBuilding.set(key, g);
  }

  const detectedBuildings: DetectedBuilding[] = [];
  for (const g of byBuilding.values()) {
    if (g.rows.length < 2) continue;   // one flat is not a building

    const members = g.rows
      .map((i) => rows.find((r) => r.index === i))
      .filter((r): r is PlannedRow => !!r);

    /* If ANY flat in the group was given a building name by a column, that name
       is the building's name for all of them. Deriving a second name from the
       address for the flats the column left blank would split one physical
       building into two — which is exactly what it did before this. */
    const named = members.find((r) => r.property.buildingName)?.property.buildingName;
    const name = named ?? g.name;

    detectedBuildings.push({ name, rows: g.rows });
    for (const row of members) {
      if (!row.property.buildingName) row.autoBuilding = name;
    }
  }

  return { rows, dateOrder, detectedBuildings };
}

/**
 * Payment schedule for a planned lease — the same shape LeaseForm generates,
 * so an imported lease and a hand-entered one are indistinguishable after.
 *
 * Every date here is an ISO string and nothing is ever parsed into a Date.
 * That is not tidiness: `new Date('2026-03-01')` is midnight UTC, and comparing
 * it against a locally-built date east of Greenwich makes the first due date
 * look EARLIER than the lease start — which silently dropped the first month of
 * every schedule. ISO strings compare lexicographically, which for this format
 * is chronologically, in every timezone.
 */
export function scheduleFor(
  lease: PlannedLease,
  markPastPaid: boolean,
  today = new Date(),
): { due_date: string; amount: number; paid: boolean }[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
  // Clamped to 28 so a "1st of the month" schedule never skips February.
  const dueDay = Math.min(Math.max(lease.payment_day, 1), 28);

  let [y, m] = lease.start_date.split('-').map(Number);
  let due = iso(y, m, dueDay);
  if (due < lease.start_date) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    due = iso(y, m, dueDay);
  }

  const firstOfThisMonth = iso(today.getFullYear(), today.getMonth() + 1, 1);
  const out: { due_date: string; amount: number; paid: boolean }[] = [];
  while (due <= lease.end_date && out.length < 36) {
    out.push({ due_date: due, amount: lease.monthly_rent, paid: markPastPaid && due < firstOfThisMonth });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    due = iso(y, m, dueDay);
  }
  return out;
}
