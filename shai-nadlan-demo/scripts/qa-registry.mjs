/**
 * A registry row must open onto the thing it names.
 *
 * The defect this exists to catch shipped once already: the אתרים list linked
 * each site to `/properties?building=<id>`, a query the properties screen never
 * read, so clicking a site showed the whole portfolio. Nothing threw and every
 * route loaded — the page was simply answering a different question.
 *
 * So the assertion is not "the link works". It is: the detail page shows
 * exactly the properties the database assigns to that record, no more and no
 * fewer. A page that renders the whole portfolio fails here despite its 200.
 *
 * Comparison is on ids read out of each card's href, never on the card's text:
 * a first pass compared visible text and failed all five screens, because a
 * card's textContent is the whole card — type, name, address, rooms, price —
 * and because the "נכס חדש" tile is also a /properties/ link. Both were faults
 * in this file, not in the app.
 *
 * Run:  BASE=<url> node scripts/qa-registry.mjs <session.env>
 */

import { chromium } from 'playwright';
import { loadSession, sessionCookie, projectEnv } from './qa-session.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const UUID = /^\/properties\/([0-9a-f-]{36})$/;

const envFile = process.argv[2];
if (!envFile) throw new Error('usage: qa-registry.mjs <session.env>');

const session = await loadSession(envFile);
const { url: api, key } = projectEnv();
const H = { apikey: key, Authorization: `Bearer ${session.access_token}` };
const get = async (q) => {
  const r = await fetch(`${api}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`REST ${r.status} on ${q}`);
  return r.json();
};

/* Each registry: where its rows live, the screen they open, and the column on
 * `properties` that says a property belongs to one. Adding a registry here is
 * the whole cost of covering it. */
const REGISTRIES = [
  { table: 'buildings', path: 'buildings', fk: 'building_id', label: 'אתר' },
  { table: 'owner_entities', path: 'entities', fk: 'entity_id', label: 'ישות' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
await ctx.addCookies([sessionCookie(session, BASE)]);
const page = await ctx.newPage();

const failures = [];
let checked = 0;
const portfolio = (await get('properties?select=id')).length;

/** The property ids a screen actually links to, in the order they appear. */
async function shownIds() {
  const hrefs = await page.$$eval('a[href^="/properties/"]', (els) =>
    els.map((e) => e.getAttribute('href')));
  return hrefs.map((h) => h?.match(UUID)?.[1]).filter(Boolean);
}

for (const reg of REGISTRIES) {
  const rows = await get(`${reg.table}?select=id,name&order=name`);
  if (!rows.length) {
    console.log(`(no ${reg.table} yet — skipped)`);
    continue;
  }

  for (const row of rows) {
    const expected = await get(`properties?select=id,name&${reg.fk}=eq.${row.id}`);
    const want = new Set(expected.map((p) => p.id));
    const nameOf = new Map(expected.map((p) => [p.id, p.name]));

    await page.goto(`${BASE}/${reg.path}/${row.id}`, { waitUntil: 'networkidle' });
    const ids = await shownIds();
    const seen = new Set(ids);

    checked += 1;
    const missing = [...want].filter((id) => !seen.has(id));
    const extra = [...seen].filter((id) => !want.has(id));

    if (!missing.length && !extra.length && ids.length === want.size) {
      console.log(
        `✓ ${reg.label} ${row.name} — ${ids.length} נכסים, בדיוק שלו` +
          `\n    ${ids.map((id) => nameOf.get(id)).join(' · ')}`);
    } else {
      /* The original bug's exact signature: the page shows the whole
       * portfolio. Worth naming, because it is the failure that most
       * resembles success. */
      const showedEverything = seen.size === portfolio && want.size !== portfolio;
      failures.push(
        `${reg.label} "${row.name}": DB assigns ${want.size}, page links ${seen.size}` +
          (missing.length ? ` · missing ${missing.length}` : '') +
          (extra.length ? ` · ${extra.length} that belong elsewhere` : '') +
          (ids.length !== seen.size ? ` · ${ids.length - seen.size} duplicated` : '') +
          (showedEverything ? ' — it rendered the WHOLE portfolio' : ''));
      console.log(`✗ ${reg.label} ${row.name}`);
    }
  }

  /* The list itself must point at the detail screen, not at a filtered list
   * whose filter nobody reads. */
  await page.goto(`${BASE}/${reg.path}`, { waitUntil: 'networkidle' });
  const hrefs = await page.$$eval('a[href]', (els) => els.map((e) => e.getAttribute('href')));
  const detail = hrefs.filter((h) => h?.startsWith(`/${reg.path}/`));
  if (detail.length < rows.length) {
    failures.push(
      `/${reg.path}: ${rows.length} rows but only ${detail.length} open a detail page`);
    console.log(`✗ /${reg.path}`);
  } else {
    console.log(`✓ /${reg.path} — ${detail.length}/${rows.length} rows open their own screen`);
  }
}

await browser.close();

if (!checked) {
  console.log('\nNothing to check — no registry rows exist.');
  process.exit(2); // inconclusive is never a pass
}

if (failures.length) {
  console.log(`\n${failures.length} registry screen(s) show the wrong rows:\n`);
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}

console.log(`\n${checked} registry screens each show exactly their own נכסים.`);
