// Full-system QA for shai-nadlan-demo, run against PRODUCTION.
// Prints PASS/FAIL per check; exits 1 on any FAIL. Never prints secrets.
// All mutations are tagged "בדיקת-QA" and cleaned up in a finally block;
// the cleanup manifest is written BEFORE each mutation, not after.
// Requirements: `.env.local` with the two public Supabase vars (vercel env
// pull), and the service-role key in env SHAI_SERVICE_KEY (or a file path in
// SHAI_SERVICE_KEY_FILE containing `SHAI_SERVICE_KEY=...`).
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const dir = new URL('.', import.meta.url).pathname;
const envLocal = readFileSync(dir + '.env.local', 'utf8');
const get = (s, n) => s.match(new RegExp(`^${n}="?([^"\n]+)"?$`, 'm'))?.[1];
const SUPA = get(envLocal, 'NEXT_PUBLIC_SUPABASE_URL');
const ANON = get(envLocal, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
const KEY = process.env.SHAI_SERVICE_KEY
  ?? get(readFileSync(process.env.SHAI_SERVICE_KEY_FILE ?? dir + '../../shai-service.env', 'utf8'), 'SHAI_SERVICE_KEY');
const BASE = process.argv[2] || 'https://shai-nadlan-demo-three.vercel.app';
const OWNER_EMAIL = 'royiargamanx@gmail.com';
const MANIFEST = dir + '../../qa-manifest.json';

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${!cond && extra ? `  [${extra}]` : ''}`);
};

const svcHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const rest = async (path) => (await fetch(`${SUPA}/rest/v1/${path}`, { headers: svcHeaders })).json();

async function mintSession(email) {
  const lj = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: svcHeaders,
    body: JSON.stringify({ type: 'magiclink', email }),
  })).json();
  const th = lj.properties?.hashed_token ?? lj.hashed_token;
  if (!th) return null;
  const s = await (await fetch(`${SUPA}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: th }),
  })).json();
  return s.access_token ? s : null;
}
const cookieOf = (session) => ({
  name: `sb-${new URL(SUPA).hostname.split('.')[0]}-auth-token`,
  value: 'base64-' + Buffer.from(JSON.stringify(session), 'utf8').toString('base64url'),
  domain: new URL(BASE).hostname, path: '/',
});
const digits = (s) => (s ?? '').replace(/\D/g, '');

// ── Ground truth from the DB (service key, read-only) ─────────
const props = await rest('properties?select=id,name,status,current_value,cover_image_url,rooms');
const leases = await rest('leases?select=id,end_date,monthly_rent,status&status=eq.active');
const today = new Date(); today.setHours(0, 0, 0, 0);
const dUntil = (d) => Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86400000);
const GT = {
  propCount: props.length,
  totalValue: props.reduce((s, p) => s + (Number(p.current_value) || 0), 0),
  monthly: leases.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0),
  activeLeases: leases.length,
  attention90: leases.filter((l) => dUntil(l.end_date) <= 90).length,
  vacant: props.filter((p) => p.status === 'vacant').length,
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

  // ════ 3. OWNER — DESKTOP ═══════════════════════════════════
  const session = await mintSession(OWNER_EMAIL);
  check('3.0 owner session minted', !!session);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await ctx.addCookies([cookieOf(session)]);
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
  const cards = () => page.locator('a[href^="/properties/"]:not([href$="/new"])').count();
  const allCards = await cards();
  check('3.2b grid shows all properties', allCards === GT.propCount, `${allCards} vs ${GT.propCount}`);
  await page.getByRole('button', { name: 'פנויים', exact: true }).click();
  await page.waitForTimeout(400);
  check('3.2c filter פנויים shows exactly the vacant ones', (await cards()) === GT.vacant, `${await cards()} vs ${GT.vacant}`);
  await page.getByRole('button', { name: 'הכל', exact: true }).click();
  await page.getByLabel('חיפוש נכס').fill('רוטשילד');
  await page.waitForTimeout(400);
  check('3.2d search רוטשילד finds 1', (await cards()) === 1, `${await cards()}`);
  const brokenImgs = await page.evaluate(() =>
    [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).length);
  check('3.2e no broken images on properties grid', brokenImgs === 0, `${brokenImgs} broken`);
  await page.screenshot({ path: dir + '../../qa-2-properties.png' });

  // 3.3 Property detail — wait for the client-side navigation itself,
  // not for network idle (which is satisfied by the list page).
  await page.locator('a[href^="/properties/"]:not([href$="/new"])').first().click();
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  const detailBody = await page.locator('body').innerText();
  check('3.3a detail shows facts (rooms, value)', detailBody.includes('חדרים') && detailBody.includes('4,500,000'));
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
  const fileInput = page.locator('input[type=file]');
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

  // 3.5 Leases page
  await page.goto(BASE + '/leases', { waitUntil: 'networkidle' });
  const leasesBody = await page.locator('body').innerText();
  check('3.5a leases header matches DB (count + monthly)',
    leasesBody.includes(`${GT.activeLeases} פעילים`) && leasesBody.includes(GT.monthly.toLocaleString('he-IL')));
  check('3.5b attention section present with rows', leasesBody.includes('דורש טיפול') && leasesBody.includes('תקינים'));
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
  await mCtx.addCookies([cookieOf(session)]);
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
  if (qaPropertyId) {
    const imgs = await rest(`property_images?select=storage_path&property_id=eq.${qaPropertyId}`).catch(() => []);
    for (const im of imgs) {
      if (im.storage_path) {
        await fetch(`${SUPA}/storage/v1/object/property-images/${im.storage_path}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
      }
    }
    await fetch(`${SUPA}/rest/v1/properties?id=eq.${qaPropertyId}`, { method: 'DELETE', headers: svcHeaders });
  }
  if (foreignUserId) {
    await fetch(`${SUPA}/auth/v1/admin/users/${foreignUserId}`, { method: 'DELETE', headers: svcHeaders });
  }
  // Verify the system is exactly as we found it.
  const after = await rest('properties?select=id');
  const leftover = await rest('properties?select=id&name=eq.בדיקת QA אוטומטית');
  check('9.1 cleanup: property count restored', after.length === GT.propCount, `${after.length} vs ${GT.propCount}`);
  check('9.2 cleanup: no QA rows left', leftover.length === 0);
  await browser.close();

  const fails = results.filter((r) => !r.ok);
  console.log(`\n══ QA SUMMARY: ${results.length - fails.length}/${results.length} passed ══`);
  if (fails.length) { console.log('FAILED:', fails.map((f) => f.name).join(' ; ')); process.exitCode = 1; }
}
