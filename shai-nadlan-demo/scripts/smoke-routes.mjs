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
import { readFileSync } from 'node:fs';
import { loadSession, sessionCookie, projectEnv } from './qa-session.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';

const STATIC_ROUTES = [
  '/', '/calendar', '/tasks', '/entities', '/buildings', '/properties',
  '/tenants', '/collection', '/leases', '/vendors', '/documents', '/settings',
  '/properties/new', '/properties/import',
];

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
  const routes = [];
  if (prop) routes.push(`/properties/${prop.id}`, `/properties/${prop.id}/edit`, `/properties/${prop.id}/lease`);
  if (payment) routes.push(`/receipt/${payment.id}`);
  return routes;
}

/* React shouts about these in dev and they are not what this gate is for. */
const IGNORE = [/Download the React DevTools/i, /Fast Refresh/i];

const envFile = process.argv[2];
if (!envFile) throw new Error('usage: smoke-routes.mjs <session.env>');
const session = await loadSession(envFile);
const access_token = session.access_token;

const extra = await parameterisedRoutes({ apikey: projectEnv().key, Authorization: `Bearer ${access_token}` });
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
if (failures.length) {
  for (const f of failures) for (const p of f.problems) console.error(`  ✗ ${f.route}: ${p}`);
  process.exit(1);
}
