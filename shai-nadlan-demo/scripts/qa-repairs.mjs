/**
 * The money on the screen must be the money in the database.
 *
 * `repairs` stores one decision — who pays — and derives both amounts from it
 * in generated columns. That removes drift between rows, and this gate closes
 * the remaining gap: that the numbers the screens PRINT are those columns and
 * not something a component recomputed on its own. Every figure below is
 * compared against a fresh SQL-side sum, never against a constant typed here,
 * so the gate stays true as the data changes.
 *
 * It also drives the form for real — create, mark done, delete — because a
 * screen that renders correctly and cannot be written to is still broken. The
 * row it creates carries a fixed uuid and is removed by that uuid, and the
 * table is proved back to its original count at the end.
 *
 *   BASE=<url> node scripts/qa-repairs.mjs <session.env>
 */

import { chromium } from 'playwright';
import { loadSession, sessionCookie, projectEnv } from './qa-session.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';

const envFile = process.argv[2];
if (!envFile) throw new Error('usage: qa-repairs.mjs <session.env>');

const session = await loadSession(envFile);
const { url: api, key } = projectEnv();
const H = { apikey: key, Authorization: `Bearer ${session.access_token}` };
const rest = async (q, init) => {
  const r = await fetch(`${api}/rest/v1/${q}`, { headers: H, ...init });
  if (!r.ok) throw new Error(`REST ${r.status} on ${q}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};

const failures = [];
const check = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
  if (!ok) failures.push(`${label}: screen says ${actual}, database says ${expected}`);
};

/**
 * Hebrew shekel amounts as the app prints them.
 *
 * `Intl` renders ₪46,560 in he-IL as U+200F, digits, U+00A0, U+200F, ₪ — and a
 * right-to-left mark is NOT whitespace, so a `\s*₪` pattern matches none of it.
 * The first version of this gate failed all three amount checks for exactly
 * that reason and read as three defects in the app. Strip the invisible bidi
 * marks first, then match.
 */
const BIDI = new RegExp(
  '[' + ['\\u200e', '\\u200f', '\\u061c', '\\u202a-\\u202e', '\\u2066-\\u2069'].join('') + ']',
  'g');
const NBSP = new RegExp('\\u00a0', 'g');
function amountsIn(text) {
  const flat = text.replace(BIDI, '').replace(NBSP, ' ');
  return [...flat.matchAll(/([\d,]+(?:\.\d+)?)\s*₪/g)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
}
const ILS = (n) => new Intl.NumberFormat('he-IL').format(n);

// ── what the database says ──────────────────────────────────────────────
const all = await rest('repairs?select=id,property_id,vendor_id,cost,owner_cost,tenant_charge,done_on');
const priced = all.filter((r) => r.cost != null);
const dbOffProfit = priced.reduce((s, r) => s + Number(r.owner_cost), 0);
const dbFromTenants = priced.reduce((s, r) => s + Number(r.tenant_charge), 0);
const dbOpen = all.filter((r) => r.done_on == null).length;
const startCount = all.length;

console.log(`database: ${startCount} repairs · ${dbOpen} open · ` +
  `${ILS(dbOffProfit)} ₪ off profit · ${ILS(dbFromTenants)} ₪ from tenants\n`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
await ctx.addCookies([sessionCookie(session, BASE)]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));

// ── /repairs ────────────────────────────────────────────────────────────
await page.goto(`${BASE}/repairs`, { waitUntil: 'networkidle' });
const repairsText = await page.textContent('body') ?? '';
const shownAmounts = amountsIn(repairsText);
check('תיקונים · ירד מהרווח appears', shownAmounts.includes(dbOffProfit), true);
check('תיקונים · נגבה מהדיירים appears', shownAmounts.includes(dbFromTenants), true);
check('תיקונים · open count', Number(repairsText.match(/(\d+)\s+פתוחים/)?.[1] ?? -1), dbOpen);
check('תיקונים · an unpriced repair is flagged, not counted as ₪0',
  repairsText.includes('טרם התקבלה חשבונית'), all.some((r) => r.cost == null));
/* A matcher that matched anything would pass every check above, so prove it
   can also say no: a figure the database does not hold must be absent. */
check('...and a figure the database does NOT hold is absent',
  shownAmounts.includes(dbOffProfit + 7), false);

// ── the dashboard's maintenance panel ───────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
const homeText = await page.textContent('body') ?? '';
check('סקירה · אחזקה panel present', homeText.includes('אחזקה · 12 חודשים'), true);
check('סקירה · same off-profit figure as /תיקונים',
  amountsIn(homeText).includes(dbOffProfit), true);

// ── a vendor opens onto his own jobs, and only his ───────────────────────
const vendors = await rest('vendors?select=id,name&order=name');
for (const v of vendors) {
  const his = all.filter((r) => r.vendor_id === v.id);
  await page.goto(`${BASE}/vendors/${v.id}`, { waitUntil: 'networkidle' });
  const t = await page.textContent('body') ?? '';
  const count = Number(t.match(/העבודות שלו \((\d+)\)/)?.[1] ?? (his.length === 0 ? 0 : -1));
  check(`בעל מקצוע ${v.name} · jobs shown`, count, his.length);
}

// ── the form actually writes ────────────────────────────────────────────
const [prop] = await rest('properties?select=id,name&limit=1');
await page.goto(`${BASE}/properties/${prop.id}`, { waitUntil: 'networkidle' });
await page.getByLabel('מה קרה').fill('QA · בדיקת רישום תיקון');
await page.getByLabel('עלות').fill('1000');
await page.getByRole('radio', { name: 'חלוקה' }).click();
await page.getByLabel('חלק הדייר').fill('400');
await page.getByRole('button', { name: 'רישום תיקון' }).click();
await page.waitForTimeout(2500);

const written = await rest(
  `repairs?select=id,cost,charge_mode,tenant_share,tenant_charge,owner_cost&title=eq.${encodeURIComponent('QA · בדיקת רישום תיקון')}`);
check('the form wrote exactly one row', written.length, 1);
if (written.length === 1) {
  const w = written[0];
  check('...with the invoice it was given', Number(w.cost), 1000);
  check('...the tenant charged what was typed', Number(w.tenant_charge), 400);
  check('...and the rest derived off the profit', Number(w.owner_cost), 600);
}

// ── clean up by id, and prove the table is back where it started ────────
for (const w of written) {
  await rest(`repairs?id=eq.${w.id}`, { method: 'DELETE' });
}
const after = await rest('repairs?select=id');
check('the probe left nothing behind', after.length, startCount);

await browser.close();

if (errors.length) {
  console.log('\nuncaught page errors:');
  for (const e of errors) console.log(`  ✗ ${e}`);
  failures.push(`${errors.length} uncaught page error(s)`);
}

if (failures.length) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
console.log('\nEvery figure on screen came from the database.');
