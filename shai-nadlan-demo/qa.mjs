// Full-system QA for shai-nadlan-demo, run against PRODUCTION.
// Prints PASS/FAIL per check; exits 1 on any FAIL. Never prints secrets.
// All mutations are tagged "בדיקת-QA" and cleaned up in a finally block;
// the cleanup manifest is written BEFORE each mutation, not after.
//
//   node qa.mjs <session.env> [base-url]
//
// The session file holds SUPABASE_ACCESS_TOKEN / SUPABASE_REFRESH_TOKEN and is
// refreshed on every run — see scripts/qa-session.mjs. It replaces the
// service-role key this suite used to demand: the key is not in .env.local and
// not in Vercel, so the whole suite simply could not run, which is worse than
// having no suite at all. Everything here now reads through the OWNER's own
// RLS-scoped session, which is also a better test — it exercises the same path
// the app takes.
//
// One section still genuinely needs the service key, because it creates a
// second user: set SHAI_SERVICE_KEY to run it, or it reports itself SKIPPED by
// name rather than passing quietly. The anonymous half of that boundary is
// covered without any key by scripts/qa-auth.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { loadSession, projectEnv } from './scripts/qa-session.mjs';

const dir = new URL('.', import.meta.url).pathname;
const SESSION_FILE = process.argv[2];
if (!SESSION_FILE || SESSION_FILE.startsWith('http')) {
  console.error('usage: node qa.mjs <session.env> [base-url]');
  process.exit(2);
}
const { url: SUPA, key: ANON } = projectEnv();
const KEY = process.env.SHAI_SERVICE_KEY ?? null;   // optional, one section only
const BASE = process.argv[3] || 'https://shai-nadlan-demo-three.vercel.app';
const OWNER_EMAIL = 'royiargamanx@gmail.com';
const MANIFEST = dir + '../../qa-manifest.json';

const session = await loadSession(SESSION_FILE);

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${!cond && extra ? `  [${extra}]` : ''}`);
};

const svcHeaders = KEY
  ? { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  : null;
/* Reads run as the owner. RLS scopes them to the same rows the app sees, so a
   policy that quietly stopped returning data would fail this suite instead of
   being masked by a key that ignores RLS entirely. */
const ownerHeaders = {
  apikey: ANON, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json',
};
const rest = async (path) => {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: ownerHeaders });
  return r.ok ? r.json() : [];
};

const skip = (name, why) => {
  results.push({ name, ok: true, skipped: true });
  console.log(`SKIP — ${name}  [${why}]`);
};

/** Only used by the foreign-user section, which needs the service key. */
async function mintSession(email) {
  if (!svcHeaders) return null;
  const lj = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: svcHeaders,
    body: JSON.stringify({ type: 'magiclink', email }),
  })).json();
  const th = lj.properties?.hashed_token ?? lj.hashed_token;
  if (!th) return null;
  const s2 = await (await fetch(`${SUPA}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: th }),
  })).json();
  return s2.access_token ? s2 : null;
}

/* The owner's cookie is built once, by the session helper. The old version
   JSON-stringified whatever it was handed, which quietly worked while that was
   a plain session object from the admin API and threw the moment it was a
   client-backed one. Building it in one place removes the question. */
const ownerCookie = {
  name: session.cookieName, value: session.cookieValue,
  domain: new URL(BASE).hostname, path: '/',
};
/* Only the foreign-user section still builds its own, from a plain session. */
const cookieOf = (raw) => ({
  name: session.cookieName,
  value: 'base64-' + Buffer.from(JSON.stringify(raw), 'utf8').toString('base64url'),
  domain: new URL(BASE).hostname, path: '/',
});
const digits = (s) => (s ?? '').replace(/\D/g, '');

// ── Ground truth from the DB (service key, read-only) ─────────
const props = await rest('properties?select=id,name,status,current_value,cover_image_url,rooms');
const leases = await rest('leases?select=id,end_date,monthly_rent,status&status=eq.active');
const tenants0 = await rest('tenants?select=id');
const todayIso0 = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const unpaidDue0 = await rest('lease_payments?select=id&paid=eq.false&due_date=lte.' + todayIso0);
const today = new Date(); today.setHours(0, 0, 0, 0);
const dUntil = (d) => Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86400000);
const GT = {
  propCount: props.length,
  totalValue: props.reduce((s, p) => s + (Number(p.current_value) || 0), 0),
  monthly: leases.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0),
  activeLeases: leases.length,
  attention90: leases.filter((l) => dUntil(l.end_date) <= 90).length,
  vacant: props.filter((p) => p.status === 'vacant').length,
  tenantCount: tenants0.length,
  unpaidDue: unpaidDue0.length,
  rented: props.filter((p) => p.status === 'rented').length,
};
console.log(`ground truth: ${GT.propCount} props, value ${GT.totalValue}, monthly ${GT.monthly}, active ${GT.activeLeases}, ≤90d ${GT.attention90}`);

const browser = await chromium.launch();
let foreignUserId = null;
let qaPropertyId = null;

try {
  // ════ 1. UNAUTHENTICATED ═══════════════════════════════════
  const anonCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const anon = await anonCtx.newPage();

  let resp = await anon.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  check('1.1 unauth / redirects to /login', anon.url().includes('/login'));
  resp = await anon.goto(BASE + '/properties', { waitUntil: 'domcontentloaded' });
  check('1.2 unauth /properties redirects to /login', anon.url().includes('/login'));

  const apiNoAuth = await fetch(BASE + '/api/assistant', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'כמה נכסים?' }),
  });
  check('1.3 /api/assistant without session → 401', apiNoAuth.status === 401, `got ${apiNoAuth.status}`);

  await anon.goto(BASE + '/login', { waitUntil: 'networkidle' });
  check('1.4 login page renders', await anon.getByText('שי עובדיה').count() > 0);

  // Wrong email is refused client-side, without burning an OTP email.
  await anon.locator('input[type=email], input[dir=ltr]').first().fill('someone-else@example.com');
  await anon.getByText('שליחת קוד').click();
  await anon.waitForTimeout(600);
  check('1.5 foreign email blocked in login form', await anon.getByText('אינה מורשית').count() > 0);

  resp = await anon.goto(BASE + '/no-such-page-qa', { waitUntil: 'domcontentloaded' });
  const notFoundOk = (resp?.status() === 404) || (await anon.getByText('העמוד לא נמצא').count()) > 0 || anon.url().includes('/login');
  check('1.6 unknown route → 404/redirect (not a crash)', notFoundOk, `status ${resp?.status()}`);

  // REST with anon key and no user: RLS must return nothing.
  const anonRest = await fetch(`${SUPA}/rest/v1/properties?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const anonRows = anonRest.ok ? await anonRest.json() : [];
  check('1.7 RLS: anon REST sees 0 properties', Array.isArray(anonRows) && anonRows.length === 0, `got ${anonRows.length ?? anonRest.status}`);
  await anonCtx.close();

  // ════ 2. FOREIGN USER (security) ═══════════════════════════
  // Creating a second user is the one thing here that cannot be done as the
  // owner. Without the key this reports itself skipped BY NAME — a security
  // check that silently passes when it did not run is worse than none.
  if (!svcHeaders) {
    skip('2.1 foreign user session kicked to /login by middleware', 'no SHAI_SERVICE_KEY — cannot create a second user');
    skip('2.2 RLS: foreign user sees 0 properties', 'no SHAI_SERVICE_KEY — cannot create a second user');
  } else {
  writeFileSync(MANIFEST, JSON.stringify({ foreignEmail: 'qa-foreign@example.com' }));
  const cu = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: 'POST', headers: svcHeaders,
    body: JSON.stringify({ email: 'qa-foreign@example.com', email_confirm: true }),
  })).json();
  foreignUserId = cu.id ?? null;
  writeFileSync(MANIFEST, JSON.stringify({ foreignUserId }));
  const fs = foreignUserId ? await mintSession('qa-foreign@example.com') : null;
  if (fs) {
    const fCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await fCtx.addCookies([cookieOf(fs)]);
    const fp = await fCtx.newPage();
    await fp.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    check('2.1 foreign user session kicked to /login by middleware', fp.url().includes('/login'));
    const fRest = await fetch(`${SUPA}/rest/v1/properties?select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${fs.access_token}` },
    });
    const fRows = fRest.ok ? await fRest.json() : [];
    check('2.2 RLS: foreign user sees 0 properties', Array.isArray(fRows) && fRows.length === 0, `got ${fRows.length}`);
    await fCtx.close();
  } else {
    check('2.1 foreign user session kicked to /login by middleware', false, 'could not create/mint foreign user');
  }
  }

  // ════ 3. OWNER — DESKTOP ═══════════════════════════════════
  check('3.0 owner session loaded', !!session.access_token && session.email === OWNER_EMAIL, session.email ?? 'no email');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await ctx.addCookies([ownerCookie]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedReqs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('_next/image')) failedReqs.push(`${r.status()} ${r.url().slice(0, 120)}`); });

  // 3.1 Dashboard
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500); // welcome overlay
  check('3.1a dashboard renders (סקירה)', await page.getByText('סקירה').count() > 0);
  const body = await page.locator('body').innerText();
  check('3.1b portfolio value tile matches DB', body.includes(GT.totalValue.toLocaleString('he-IL')), `expect ${GT.totalValue}`);
  check('3.1c monthly income tile matches DB', body.includes(GT.monthly.toLocaleString('he-IL')), `expect ${GT.monthly}`);
  check('3.1d attention badge matches ≤90d count', body.includes(`${GT.attention90}`) && (await page.getByText('דורש טיפול').count()) > 0);
  await page.screenshot({ path: dir + '../../qa-1-dashboard.png' });

  // 3.2 Properties list + filters + search
  await page.goto(BASE + '/properties', { waitUntil: 'networkidle' });
  check('3.2a properties count line matches DB', (await page.locator('body').innerText()).includes(`${GT.propCount} נכסים`));
  /* Count real property cards, which are the links whose href ends in a uuid.
     The old selector was "anything under /properties/ that is not /new", so the
     moment a second header link appeared — ייבוא מאקסל — every count on this
     screen was one too high and the detail test clicked the import screen
     instead of a property. Matching the SHAPE of a property link cannot drift
     when another button is added next to it. */
  const CARD = /\/properties\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const cards = () => page.evaluate(
    (re) => [...document.querySelectorAll('a[href^="/properties/"]')]
      .filter((a) => new RegExp(re).test(a.getAttribute('href') ?? '')).length,
    CARD.source);
  const firstCardHref = () => page.evaluate(
    (re) => [...document.querySelectorAll('a[href^="/properties/"]')]
      .map((a) => a.getAttribute('href') ?? '')
      .find((h) => new RegExp(re).test(h)) ?? null,
    CARD.source);
  const allCards = await cards();
  check('3.2b grid shows all properties', allCards === GT.propCount, `${allCards} vs ${GT.propCount}`);
  await page.getByRole('button', { name: 'פנויים', exact: true }).click();
  await page.waitForTimeout(400);
  check('3.2c filter פנויים shows exactly the vacant ones', (await cards()) === GT.vacant, `${await cards()} vs ${GT.vacant}`);
  await page.getByRole('button', { name: 'הכל', exact: true }).click();
  /* How many the search SHOULD find is a property of the data, not a constant.
     "1" was true of the seed deleted in August and is 6 today. */
  const TERM = 'רוטשילד';
  const searchable = await rest('properties?select=name,address,city');
  const expectHits = searchable.filter(
    (r) => `${r.name} ${r.address} ${r.city}`.includes(TERM)).length;
  await page.getByLabel('חיפוש נכס').fill(TERM);
  await page.waitForTimeout(400);
  const hits = await cards();
  check(`3.2d search ${TERM} finds what the DB says it should`,
    hits === expectHits, `${hits} vs ${expectHits}`);
  const brokenImgs = await page.evaluate(() =>
    [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).length);
  check('3.2e no broken images on properties grid', brokenImgs === 0, `${brokenImgs} broken`);
  await page.screenshot({ path: dir + '../../qa-2-properties.png' });

  // 3.3 Property detail — wait for the client-side navigation itself,
  // not for network idle (which is satisfied by the list page).
  await page.goto(BASE + (await firstCardHref()), { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  const detailBody = await page.locator('body').innerText();
  /* Assert against THIS property's own stored value, read back by id. The
     literal that used to sit here — 4,500,000 — belonged to seed data deleted
     in August, so the check could only ever fail once the data moved on. A
     number typed into a test is a second copy of the truth. */
  const detailId = page.url().split('/').pop();
  const [detailRow] = await rest(`properties?select=current_value,rooms&id=eq.${detailId}`);
  const expectValue = detailRow?.current_value != null
    ? Number(detailRow.current_value).toLocaleString('he-IL') : null;
  check('3.3a detail shows facts (rooms, value)',
    detailBody.includes('חדרים') && (expectValue === null || detailBody.includes(expectValue)),
    `expected ${expectValue ?? '(no value stored)'}`);
  check('3.3b active lease panel with tenant + contact', detailBody.includes('חוזה שכירות') && (await page.locator('a[href^="tel:"]').count()) > 0 && (await page.locator('a[href*="wa.me"]').count()) > 0);
  await page.screenshot({ path: dir + '../../qa-3-detail.png' });
  const nf = await page.goto(BASE + '/properties/00000000-0000-0000-0000-000000000000', { waitUntil: 'domcontentloaded' });
  check('3.3c bad property id → not-found page', (await page.getByText('העמוד לא נמצא').count()) > 0 || nf?.status() === 404);

  // 3.4 Create property (validation → create → verify → image upload)
  await page.goto(BASE + '/properties/new', { waitUntil: 'networkidle' });
  await page.getByText('שמור נכס').click();
  await page.waitForTimeout(400);
  check('3.4a empty form shows required-field errors', (await page.getByText('חובה').count()) >= 3);
  writeFileSync(MANIFEST, JSON.stringify({ foreignUserId, qaPropertyName: 'בדיקת QA אוטומטית' }));
  await page.locator('#name').fill('בדיקת QA אוטומטית');
  await page.locator('#address').fill('רחוב הבדיקה 1');
  await page.locator('#city').fill('תל אביב');
  await page.locator('#rooms').fill('3');
  await page.locator('#current_value').fill('1000000');
  await page.getByText('שמור נכס').click();
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}/, { timeout: 15000 });
  qaPropertyId = page.url().match(/properties\/([0-9a-f-]{36})/)?.[1] ?? null;
  writeFileSync(MANIFEST, JSON.stringify({ foreignUserId, qaPropertyId }));
  const dbRow = qaPropertyId ? await rest(`properties?select=name,rooms,current_value&id=eq.${qaPropertyId}`) : [];
  check('3.4b property created via UI and stored correctly',
    dbRow[0]?.name === 'בדיקת QA אוטומטית' && Number(dbRow[0]?.rooms) === 3 && Number(dbRow[0]?.current_value) === 1000000,
    JSON.stringify(dbRow[0] ?? null));

  // Image upload on the QA property (storage + RLS path)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  /* Name the gallery's own input. `input[type=file]` matched exactly one
     control when this was written; the documents cloud added a second, and the
     locator then refused to act at all rather than picking the wrong one —
     which is the good failure mode, but it stops the suite dead. */
  const fileInput = page.locator('input[type=file][accept="image/*"]');
  if (await fileInput.count()) {
    await fileInput.setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(5000);
    const imgs = await rest(`property_images?select=id,storage_path&property_id=eq.${qaPropertyId}`);
    check('3.4c image upload stored (storage + DB row)', imgs.length === 1, `rows: ${imgs.length}`);
  } else {
    check('3.4c image upload stored (storage + DB row)', false, 'no file input found on detail page');
  }

  // New property visible in list and dashboard count updates
  await page.goto(BASE + '/properties', { waitUntil: 'networkidle' });
  check('3.4d new property appears in the list', (await page.locator('body').innerText()).includes('בדיקת QA אוטומטית'));

  // 3.45 Lease lifecycle through the UI: rent → renew at a new price → end → delete
  await page.goto(`${BASE}/properties/${qaPropertyId}`, { waitUntil: 'networkidle' });
  await page.getByText('השכרת הנכס').click();
  await page.waitForURL(/\/lease/, { timeout: 15000 });
  await page.getByText('שוכר חדש', { exact: true }).click();
  await page.locator('#fullName').fill('שוכר בדיקת QA');
  await page.locator('#phone').fill('050-1112233');
  await page.locator('#rent').fill('5000');
  await page.getByText('השכרת הנכס', { exact: true }).last().click();
  await page.waitForURL(new RegExp(`/properties/${qaPropertyId}$`), { timeout: 20000 });
  await page.waitForTimeout(800);
  let dbLease = await rest(`leases?select=id,monthly_rent,status,tenant:tenants(full_name)&property_id=eq.${qaPropertyId}&status=eq.active`);
  let dbProp = await rest(`properties?select=status&id=eq.${qaPropertyId}`);
  check('3.45a rent to a NEW tenant via UI (lease active, tenant created, property rented)',
    dbLease.length === 1 && Number(dbLease[0].monthly_rent) === 5000 && dbLease[0].tenant?.full_name === 'שוכר בדיקת QA' && dbProp[0]?.status === 'rented',
    JSON.stringify({ lease: dbLease.length, rent: dbLease[0]?.monthly_rent, prop: dbProp[0]?.status }));

  // payment schedule born with the lease + one-tap mark-as-paid
  const sched = await rest(`lease_payments?select=id,paid&lease_id=eq.${dbLease[0].id}`);
  /* One row per due month, from the first payment day on or after the start
     through to the end. Twelve was right for the lease the old seed happened
     to create and is wrong for any other, so the rule is applied rather than
     its answer remembered. */
  const [schedLease] = await rest(`leases?select=start_date,end_date,payment_day&id=eq.${dbLease[0].id}`);
  const expectedSchedule = (() => {
    if (!schedLease) return null;
    const pad = (n) => String(n).padStart(2, '0');
    const day = Math.min(Math.max(schedLease.payment_day ?? 1, 1), 28);
    let [y, m] = schedLease.start_date.split('-').map(Number);
    let due = `${y}-${pad(m)}-${pad(day)}`;
    if (due < schedLease.start_date) { m += 1; if (m > 12) { m = 1; y += 1; } due = `${y}-${pad(m)}-${pad(day)}`; }
    let n = 0;
    while (due <= schedLease.end_date && n < 36) {
      n += 1; m += 1; if (m > 12) { m = 1; y += 1; }
      due = `${y}-${pad(m)}-${pad(day)}`;
    }
    return n;
  })();
  check('3.45a2 monthly payment schedule generated with the lease',
    expectedSchedule !== null && sched.length === expectedSchedule,
    `rows: ${sched.length}, expected ${expectedSchedule}`);
  await page.getByRole('button', { name: 'שולם', exact: true }).first().click();
  await page.waitForTimeout(1200);
  const paidNow = await rest(`lease_payments?select=id&lease_id=eq.${dbLease[0].id}&paid=eq.true`);
  check('3.45a3 mark-as-paid via UI persists', paidNow.length === 1, `paid: ${paidNow.length}`);

  // tenants screen lists the new tenant with contact buttons
  await page.goto(`${BASE}/tenants`, { waitUntil: 'networkidle' });
  const tenantsBody = await page.locator('body').innerText();
  check('3.45a4 tenants screen shows the new tenant', tenantsBody.includes('שוכר בדיקת QA') && tenantsBody.includes('שוכרים'));
  await page.goto(`${BASE}/properties/${qaPropertyId}`, { waitUntil: 'networkidle' });

  // renew at a new price
  await page.getByText('שוכר חדש / מחיר חדש').click();
  await page.waitForURL(/renew=1/, { timeout: 15000 });
  const prefilled = await page.locator('#rent').inputValue();
  await page.locator('#rent').fill('6000');
  await page.waitForTimeout(300);
  const deltaShown = (await page.locator('body').innerText()).includes('20.0%');
  await page.getByText('סיום הישן והחתמת החדש').click();
  await page.waitForURL(new RegExp(`/properties/${qaPropertyId}$`), { timeout: 20000 });
  await page.waitForTimeout(800);
  const activeNow = await rest(`leases?select=monthly_rent,status&property_id=eq.${qaPropertyId}&status=eq.active`);
  const endedNow = await rest(`leases?select=monthly_rent,status&property_id=eq.${qaPropertyId}&status=eq.ended`);
  check('3.45b renewal prefills the old rent and shows the price delta', prefilled === '5000' && deltaShown, `prefill=${prefilled} delta=${deltaShown}`);
  check('3.45c renew at new price: old lease ended, one active at ₪6,000',
    activeNow.length === 1 && Number(activeNow[0].monthly_rent) === 6000 && endedNow.length === 1,
    JSON.stringify({ active: activeNow, ended: endedNow.length }));

  // end the lease
  await page.getByText('סיום חוזה', { exact: true }).click();
  await page.getByText('סיום חוזה', { exact: true }).last().click(); // the confirm button
  await page.waitForTimeout(1500);
  const afterEnd = await rest(`leases?select=status&property_id=eq.${qaPropertyId}&status=eq.active`);
  dbProp = await rest(`properties?select=status&id=eq.${qaPropertyId}`);
  check('3.45d end lease via UI: no active lease, property vacant',
    afterEnd.length === 0 && dbProp[0]?.status === 'vacant', JSON.stringify({ active: afterEnd.length, prop: dbProp[0]?.status }));

  // delete the property (also removes its storage files)
  const imgPaths = await rest(`property_images?select=storage_path&property_id=eq.${qaPropertyId}`);
  await page.getByLabel('מחיקת נכס').click();
  await page.getByText('מחיקה', { exact: true }).click();
  await page.waitForURL(/\/properties$/, { timeout: 20000 });
  await page.waitForTimeout(1000);
  const goneProp = await rest(`properties?select=id&id=eq.${qaPropertyId}`);
  const goneLeases = await rest(`leases?select=id&property_id=eq.${qaPropertyId}`);
  let storageGone = true;
  for (const im of imgPaths) {
    if (!im.storage_path) continue;
    const r = await fetch(`${SUPA}/storage/v1/object/public/property-images/${im.storage_path}`);
    if (r.ok) storageGone = false;
  }
  check('3.45e delete property via UI: row, leases and storage files gone',
    goneProp.length === 0 && goneLeases.length === 0 && storageGone,
    JSON.stringify({ prop: goneProp.length, leases: goneLeases.length, storageGone }));
  qaPropertyId = null; // already deleted through the UI

  // 3.5 Leases page
  await page.goto(BASE + '/leases', { waitUntil: 'networkidle' });
  const leasesBody = await page.locator('body').innerText();
  check('3.5a leases header matches DB (count + monthly)',
    leasesBody.includes(`${GT.activeLeases} פעילים`) && leasesBody.includes(GT.monthly.toLocaleString('he-IL')));
  check('3.5b attention section present with rows', leasesBody.includes('דורש טיפול') && leasesBody.includes('תקינים'));
  check('3.5d overdue-payment badge shown on lease rows', GT.unpaidDue === 0 || leasesBody.includes('תשלום ממתין'), `unpaidDue=${GT.unpaidDue}`);
  const contactLinks = await page.locator('a[href*="wa.me"]').count();
  check('3.5c desktop shows WhatsApp actions on lease rows', contactLinks >= GT.attention90, `${contactLinks}`);
  await page.screenshot({ path: dir + '../../qa-4-leases.png' });

  // 3.6 Assistant spot-check (canned rent == DB)
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(700);
  await page.getByText('כמה שכר דירה נכנס בחודש').click();
  await page.waitForTimeout(800);
  const rentSummary = await page.locator('.bg-accent-tint.rounded-2xl').first().textContent();
  check('3.6a assistant rent answer matches DB', (rentSummary ?? '').includes(GT.monthly.toLocaleString('he-IL')), rentSummary?.slice(0, 60));
  await page.getByTitle('חזרה').click();
  await page.getByText('מי לא שילם', { exact: true }).click();
  await page.waitForTimeout(800);
  const debtsBody = await page.locator('body').innerText();
  check('3.6b assistant "מי לא שילם" matches DB unpaid-due state',
    GT.unpaidDue === 0 ? debtsBody.includes('הכול שולם') : (debtsBody.includes('לגבייה') && debtsBody.includes('ממתינ')),
    `unpaidDue=${GT.unpaidDue}`);
  await page.keyboard.press('Escape');

  // 3.7 Dark mode
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByLabel('מצב כהה').click();
  await page.waitForTimeout(400);
  const darkOn = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('3.7a dark mode toggles and paints black canvas', darkOn && darkBg === 'rgb(0, 0, 0)', darkBg);
  await page.screenshot({ path: dir + '../../qa-5-dark.png' });
  await page.reload({ waitUntil: 'networkidle' });
  check('3.7b dark mode persists after reload', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.getByLabel('מצב בהיר').click();

  // 3.8 Header nav works
  await page.getByRole('link', { name: 'חוזים' }).first().click();
  await page.waitForURL(/\/leases/);
  check('3.8 header navigation works', page.url().includes('/leases'));

  check('3.9 no console errors across desktop pass', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('3.10 no failed HTTP requests (≥400)', failedReqs.length === 0, failedReqs.slice(0, 3).join(' | '));
  await ctx.close();

  // ════ 4. OWNER — MOBILE ════════════════════════════════════
  const mCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await mCtx.addCookies([ownerCookie]);
  const mp = await mCtx.newPage();
  await mp.goto(BASE + '/', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(3500);
  check('4.1 mobile: tab bar with 4 items', (await mp.locator('nav.material a').count()) === 4);
  await mp.locator('nav.material a[href="/properties"]').click();
  await mp.waitForURL(/\/properties/);
  check('4.2 mobile: tab navigation works', mp.url().includes('/properties'));
  check('4.3 mobile: assistant FAB present', (await mp.getByTitle('עוזר חכם (⌘K)').count()) === 1);
  await mp.getByTitle('עוזר חכם (⌘K)').click();
  await mp.waitForTimeout(700);
  check('4.4 mobile: assistant opens as dialog', (await mp.getByRole('dialog').count()) === 1);
  await mp.screenshot({ path: dir + '../../qa-6-mobile.png' });
  await mCtx.close();

  // ════ 5. STORAGE / IMAGES ══════════════════════════════════
  let badCovers = 0;
  for (const p of props) {
    if (!p.cover_image_url) continue;
    const r = await fetch(p.cover_image_url, { method: 'HEAD' }).catch(() => null);
    if (!r || !r.ok) badCovers++;
  }
  check('5.1 all cover images reachable (HEAD 200)', badCovers === 0, `${badCovers} unreachable`);

} finally {
  // ════ CLEANUP — always runs ════════════════════════════════
  /* The cleanup deletes as the OWNER. It used to use the service key, and when
     that key stopped being available the cleanup did not fail loudly — it threw
     inside `finally` on a null headers object and left a QA property sitting in
     the live portfolio. A cleanup that depends on a credential the run does not
     otherwise need is a cleanup that will one day not run. */
  if (qaPropertyId) {
    const imgs = await rest(`property_images?select=storage_path&property_id=eq.${qaPropertyId}`).catch(() => []);
    for (const im of imgs) {
      if (im.storage_path) {
        await fetch(`${SUPA}/storage/v1/object/property-images/${im.storage_path}`,
          { method: 'DELETE', headers: ownerHeaders }).catch(() => {});
      }
    }
    await fetch(`${SUPA}/rest/v1/properties?id=eq.${qaPropertyId}`,
      { method: 'DELETE', headers: ownerHeaders }).catch(() => {});
  }
  /* Sweep by NAME as well as by id: a run that died between creating the row
     and recording its id would otherwise leave it behind forever, which is
     exactly what happened once. */
  await fetch(`${SUPA}/rest/v1/properties?name=eq.${encodeURIComponent('בדיקת QA אוטומטית')}`,
    { method: 'DELETE', headers: ownerHeaders }).catch(() => {});
  await fetch(`${SUPA}/rest/v1/tenants?full_name=eq.${encodeURIComponent('שוכר בדיקת QA')}`,
    { method: 'DELETE', headers: ownerHeaders }).catch(() => {});
  if (foreignUserId && svcHeaders) {
    await fetch(`${SUPA}/auth/v1/admin/users/${foreignUserId}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  }
  // Verify the system is exactly as we found it.
  const after = await rest('properties?select=id');
  const leftover = await rest('properties?select=id&name=eq.בדיקת QA אוטומטית');
  check('9.1 cleanup: property count restored', after.length === GT.propCount, `${after.length} vs ${GT.propCount}`);
  check('9.2 cleanup: no QA rows left', leftover.length === 0);
  const tenantsAfter = await rest('tenants?select=id');
  check('9.3 cleanup: tenant count restored', tenantsAfter.length === GT.tenantCount, `${tenantsAfter.length} vs ${GT.tenantCount}`);
  await browser.close();

  const fails = results.filter((r) => !r.ok);
  console.log(`\n══ QA SUMMARY: ${results.length - fails.length}/${results.length} passed ══`);
  if (fails.length) { console.log('FAILED:', fails.map((f) => f.name).join(' ; ')); process.exitCode = 1; }
}
