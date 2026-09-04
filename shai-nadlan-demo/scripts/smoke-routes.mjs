#!/usr/bin/env node
/**
 * Load every screen as a signed-in user and fail on anything that breaks.
 *
 * This exists because /אתרים and /ישויות shipped broken and nobody noticed:
 * both handed a lucide icon — a function — from a Server Component to a Client
 * Component, which React refuses, and both answered 500. With an empty database
 * nobody had opened them; the first row of demo data made it obvious.
 *
 * A type check cannot see that error and neither can a build. Only loading the
 * page can, so that is what this does.
 *
 *   BASE=https://shai-nadlan-demo-three.vercel.app node scripts/smoke-routes.mjs <session.env>
 *
 * The session file holds SUPABASE_ACCESS_TOKEN / SUPABASE_REFRESH_TOKEN and is
 * never printed.
 */

import { chromium } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadSession, sessionCookie, projectEnv } from './qa-session.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';

/**
 * The route list is read off the filesystem, never typed here.
 *
 * It used to be a hand-written array, and the two screens added most recently
 * — /buildings/<id> and /entities/<id> — were simply absent from it: the gate
 * reported "18/18 screens loaded cleanly" while covering neither. A list of
 * what to test that a human maintains is a list that goes stale exactly when
 * new code arrives, which is when it matters. Walking `src/app` means a new
 * page.tsx is covered the moment it exists.
 */
function routesOnDisk(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'page.tsx') out.push(prefix || '/');
    if (!entry.isDirectory()) continue;
    const seg = entry.name;
    /* (app) and the like are grouping folders — they carry no URL segment. */
    const next = seg.startsWith('(') ? prefix : `${prefix}/${seg}`;
    out.push(...routesOnDisk(join(dir, seg), next));
  }
  return out;
}

const APP_DIR = new URL('../src/app', import.meta.url);
const discovered = routesOnDisk(APP_DIR.pathname);

/* /login and /maintenance are the two screens a signed-in user must NOT see —
 * they redirect, so loading them here proves nothing about them. They have
 * their own gate in qa-auth.mjs. */
const NOT_FOR_A_SIGNED_IN_USER = ['/login', '/maintenance'];

const STATIC_ROUTES = discovered
  .filter((r) => !r.includes('['))
  .filter((r) => !NOT_FOR_A_SIGNED_IN_USER.includes(r))
  .sort();

/* Every dynamic segment must be filled in by parameterisedRoutes() below. A
 * new [id] screen that nobody taught this script about is a gap in the gate,
 * so it is named and the run fails rather than passing quietly. */
const DYNAMIC_ROUTES = discovered.filter((r) => r.includes('['));

/**
 * The screens that only exist for a specific row — a property, its edit form,
 * its lease form, a receipt. They are the ones most likely to break on real
 * data and the ones a fixed list of paths cannot reach, so the ids are looked
 * up at run time. A run against an empty system simply skips them and says so.
 */
async function parameterisedRoutes(headers) {
  const local = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const pick = (k) => local.match(new RegExp(`^${k}="?(.*?)"?$`, 'm'))?.[1];
  const api = pick('NEXT_PUBLIC_SUPABASE_URL');
  const get = async (q) => {
    const r = await fetch(`${api}/rest/v1/${q}`, { headers });
    return r.ok ? r.json() : [];
  };
  const [prop] = await get('properties?select=id&limit=1');
  const [payment] = await get('lease_payments?select=id&paid=eq.true&limit=1');
  const [building] = await get('buildings?select=id&limit=1');
  const [entity] = await get('owner_entities?select=id&limit=1');
  const [vendor] = await get('vendors?select=id&limit=1');

  /* Keyed by the template path, so the coverage check below can tell three
   * states apart: a screen reached, a screen this script knows how to reach
   * but has no row for yet, and a screen nobody taught it about at all. Only
   * the last one is a bug in the gate. */
  const filled = new Map();
  const empty = new Set();
  const put = (template, url) => (url ? filled.set(template, url) : empty.add(template));
  put('/properties/[id]', prop && `/properties/${prop.id}`);
  put('/properties/[id]/edit', prop && `/properties/${prop.id}/edit`);
  put('/properties/[id]/lease', prop && `/properties/${prop.id}/lease`);
  put('/receipt/[paymentId]', payment && `/receipt/${payment.id}`);
  put('/buildings/[id]', building && `/buildings/${building.id}`);
  put('/entities/[id]', entity && `/entities/${entity.id}`);
  put('/vendors/[id]', vendor && `/vendors/${vendor.id}`);
  return { filled, empty };
}

/* React shouts about these in dev and they are not what this gate is for. */
const IGNORE = [/Download the React DevTools/i, /Fast Refresh/i];

const envFile = process.argv[2];
if (!envFile) throw new Error('usage: smoke-routes.mjs <session.env>');
const session = await loadSession(envFile);
const access_token = session.access_token;

const { filled, empty } = await parameterisedRoutes({
  apikey: projectEnv().key, Authorization: `Bearer ${access_token}`,
});

/* A dynamic screen this script has no way to build a URL for is uncovered, and
 * an uncovered screen must not read as a pass — that is exactly how
 * /buildings/[id] slipped through while the run printed 18/18. No DATA is a
 * skip; no recipe is a failure of the gate itself. */
const noRecipe = DYNAMIC_ROUTES.filter((t) => !filled.has(t) && !empty.has(t));
const extra = [...filled.values()];
const ROUTES = [...STATIC_ROUTES, ...extra];
if (!extra.length) console.log('(no rows yet — the per-row screens were skipped)');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
await ctx.addCookies([sessionCookie(session, BASE)]);

const failures = [];
let passed = 0;

for (const route of ROUTES) {
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${String(e).split('\n')[0]}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORE.some((re) => re.test(text))) return;
    problems.push(`console: ${text.slice(0, 160)}`);
  });

  try {
    const res = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    const status = res?.status() ?? 0;
    const body = (await page.textContent('body')) ?? '';

    if (status >= 400) problems.push(`HTTP ${status}`);
    // Next renders its own error page with a 200, so the status alone is not enough.
    if (/Application error: a (server-side|client-side) exception/i.test(body)) {
      problems.push('Next.js rendered its error page');
    }
    if (new URL(page.url()).pathname === '/login' && route !== '/login') {
      problems.push('redirected to /login — the session was refused');
    }
  } catch (e) {
    problems.push(`navigation failed: ${e.message.split('\n')[0]}`);
  }
  await page.close();

  if (problems.length) failures.push({ route, problems });
  else passed++;
  console.log(`${problems.length ? '✗' : '✓'} ${route}${problems.length ? ' — ' + problems[0] : ''}`);
}

await browser.close();
console.log(`\n${passed}/${ROUTES.length} screens loaded cleanly against ${BASE}`);
if (empty.size) {
  console.log(`(skipped for lack of a row: ${[...empty].join(', ')})`);
}
if (failures.length) {
  for (const f of failures) for (const p of f.problems) console.error(`  ✗ ${f.route}: ${p}`);
  process.exit(1);
}
if (noRecipe.length) {
  console.error(
    `\nUNCOVERED — ${noRecipe.length} dynamic screen(s) exist that this gate ` +
    `cannot reach:\n${noRecipe.map((r) => `  ✗ ${r}`).join('\n')}\n` +
    `Teach parameterisedRoutes() how to build a URL for each.`);
  process.exit(1);
}
