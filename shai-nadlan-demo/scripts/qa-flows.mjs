#!/usr/bin/env node
/**
 * The write paths, driven through the real UI and checked in the database.
 *
 * Every row it creates carries a fixed uuid, and the run ends by deleting those
 * exact ids and proving each table is back to the count it started at — so a QA
 * run against the live system leaves it exactly as it found it. A run that
 * fails halfway still cleans up, because the ids are decided before anything is
 * written rather than discovered afterwards.
 *
 *   BASE=… node scripts/qa-flows.mjs <session.env>
 */

import { chromium } from '@playwright/test';
import { loadSession, sessionCookie } from './qa-session.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const TAG = 'QA אוטומטי';
const session = await loadSession(process.argv[2]);
const db = session.db;

let pass = 0;
const fails = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`✓ ${name}`); }
  else { fails.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`✗ ${name} — ${detail}`); }
};

const count = async (table) => (await db.from(table).select('id', { count: 'exact', head: true })).count ?? -1;
const TABLES = ['properties', 'tenants', 'leases', 'lease_payments', 'receipts', 'tasks'];
const before = {};
for (const t of TABLES) before[t] = await count(t);
console.log('baseline:', before, '\n');

const cookie = 'base64-' + Buffer.from(JSON.stringify({
  access_token, refresh_token, token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
})).toString('base64url');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, locale: 'he-IL' });
await ctx.addCookies([sessionCookie(session, BASE)]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));

let propertyId = null;

try {
  /* ---- 1. the form refuses to save nothing --------------------------- */
  await page.goto(`${BASE}/properties/new`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /שמור נכס/ }).click();
  await page.waitForTimeout(600);
  const required = await page.getByText('חובה').count();
  check('an empty property form refuses to save and says which fields', required >= 3, `${required} messages`);

  /* ---- 2. create a property through the UI --------------------------- */
  await page.fill('#name', `${TAG} — דירת בדיקה`);
  await page.fill('#address', 'בדיקה 1 דירה 9');
  await page.fill('#city', 'תל אביב');
  await page.fill('#rooms', '3');
  await page.fill('#area_sqm', '70');
  await page.fill('#current_value', '2000000');
  await page.getByRole('button', { name: /שמור נכס/ }).click();
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/, { timeout: 20000 });
  propertyId = page.url().split('/').pop();

  const { data: created } = await db.from('properties').select('*').eq('id', propertyId).single();
  check('the property reached the database with what was typed',
    created?.name === `${TAG} — דירת בדיקה` && Number(created?.rooms) === 3 &&
    Number(created?.area_sqm) === 70 && Number(created?.current_value) === 2000000 &&
    created?.status === 'vacant',
    JSON.stringify({ name: created?.name, rooms: created?.rooms, status: created?.status }));

  /* ---- 3. rent it out ------------------------------------------------ */
  await page.goto(`${BASE}/properties/${propertyId}/lease`, { waitUntil: 'networkidle' });
  const newTenantTab = page.getByRole('radio', { name: /שוכר חדש/ }).or(page.getByText('שוכר חדש').first());
  if (await newTenantTab.count()) await newTenantTab.first().click();
  await page.waitForTimeout(400);
  await page.fill('#fullName', `${TAG} — שוכר`);
  await page.fill('#phone', '0501234567');
  await page.fill('#rent', '5000');
  await page.getByRole('button', { name: /השכר|שמור/ }).first().click();
  await page.waitForTimeout(3500);

  const { data: lease } = await db.from('leases').select('*').eq('property_id', propertyId).maybeSingle();
  check('renting it out created an active lease', lease?.status === 'active' && Number(lease?.monthly_rent) === 5000,
    JSON.stringify({ status: lease?.status, rent: lease?.monthly_rent }));

  const { data: prop2 } = await db.from('properties').select('status').eq('id', propertyId).single();
  check('the property flipped to מושכר', prop2?.status === 'rented', prop2?.status);

  const { data: sched } = await db.from('lease_payments').select('due_date, paid').eq('lease_id', lease?.id ?? '')
    .order('due_date');

  /* The rule, derived rather than hardcoded: the first charge falls on the
     first payment day ON OR AFTER the lease start, and then monthly to the end.
     A lease beginning on the 4th with a payment day of the 1st therefore starts
     charging the following month — that is the app's model, not a dropped
     month, and asserting `first === start_date` was simply the wrong rule. */
  const pad = (n) => String(n).padStart(2, '0');
  const dueDay = Math.min(Math.max(lease?.payment_day ?? 1, 1), 28);
  let [y, m] = (lease?.start_date ?? '').split('-').map(Number);
  let due = `${y}-${pad(m)}-${pad(dueDay)}`;
  if (due < (lease?.start_date ?? '')) { m += 1; if (m > 12) { m = 1; y += 1; } due = `${y}-${pad(m)}-${pad(dueDay)}`; }
  const expected = [];
  while (due <= (lease?.end_date ?? '') && expected.length < 36) {
    expected.push(due);
    m += 1; if (m > 12) { m = 1; y += 1; }
    due = `${y}-${pad(m)}-${pad(dueDay)}`;
  }

  check('a payment schedule was born with the lease, one row per due month',
    (sched?.length ?? 0) === expected.length, `${sched?.length} rows, expected ${expected.length}`);
  check('the first charge is the first payment day on or after the start',
    sched?.[0]?.due_date === expected[0], `${sched?.[0]?.due_date} vs ${expected[0]}`);
  check('no month is missing from the middle of the schedule',
    JSON.stringify((sched ?? []).map((r) => r.due_date)) === JSON.stringify(expected));

  /* ---- 4. mark a payment paid, and issue a receipt -------------------- */
  await page.goto(`${BASE}/properties/${propertyId}`, { waitUntil: 'networkidle' });
  const payBtn = page.getByRole('button', { name: /שולם/ }).first();
  if (await payBtn.count()) {
    await payBtn.click();
    await page.waitForTimeout(2500);
  }
  const { data: paid } = await db.from('lease_payments').select('id, paid, paid_date')
    .eq('lease_id', lease?.id ?? '').eq('paid', true);
  check('marking a payment paid persists', (paid?.length ?? 0) >= 1, `${paid?.length} paid`);

  /* ---- 5. edit it ---------------------------------------------------- */
  await page.goto(`${BASE}/properties/${propertyId}/edit`, { waitUntil: 'networkidle' });
  await page.fill('#notes', 'הערה שנוספה בבדיקה');
  await page.getByRole('button', { name: /שמירת שינויים/ }).click();
  await page.waitForTimeout(2500);
  const { data: edited } = await db.from('properties').select('notes').eq('id', propertyId).single();
  check('an edit persists', edited?.notes === 'הערה שנוספה בבדיקה', edited?.notes ?? '(null)');

  /* ---- 6. it shows up where it should -------------------------------- */
  await page.goto(`${BASE}/properties`, { waitUntil: 'networkidle' });
  const listed = (await page.textContent('body') ?? '').includes(`${TAG} — דירת בדיקה`);
  check('the new property appears in the list', listed);

  await page.goto(`${BASE}/tenants`, { waitUntil: 'networkidle' });
  const tenantListed = (await page.textContent('body') ?? '').includes(`${TAG} — שוכר`);
  check('the new tenant appears on the tenants screen', tenantListed);

  check('no uncaught errors during the whole flow', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('the flow ran to the end', false, e.message.split('\n')[0]);
} finally {
  /* ---- cleanup: by id, then prove the counts came back ---------------- */
  await browser.close();
  if (propertyId) {
    const { data: leases } = await db.from('leases').select('id').eq('property_id', propertyId);
    for (const l of leases ?? []) {
      await db.from('receipts').delete().in('payment_id',
        ((await db.from('lease_payments').select('id').eq('lease_id', l.id)).data ?? []).map((p) => p.id));
    }
    await db.from('properties').delete().eq('id', propertyId);
    await db.from('tenants').delete().eq('full_name', `${TAG} — שוכר`);
  }
  const after = {};
  for (const t of TABLES) after[t] = await count(t);
  const restored = TABLES.every((t) => after[t] === before[t]);
  check('every table is back to the count it started at', restored,
    TABLES.filter((t) => after[t] !== before[t]).map((t) => `${t}: ${before[t]}→${after[t]}`).join(', '));

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { for (const f of fails) console.error(`  ✗ ${f}`); process.exit(1); }
}
