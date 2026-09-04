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

const BASE = process.env.BASE ?? 'http://localhost:3100';
const PROJECT_REF = 'thmkokzalrgwzhdbiabi';

const ROUTES = [
  '/', '/calendar', '/tasks', '/entities', '/buildings', '/properties',
  '/tenants', '/collection', '/leases', '/vendors', '/documents', '/settings',
  '/properties/new', '/properties/import',
];

/* React shouts about these in dev and they are not what this gate is for. */
const IGNORE = [/Download the React DevTools/i, /Fast Refresh/i];

const envFile = process.argv[2];
if (!envFile) throw new Error('usage: smoke-routes.mjs <session.env>');
const env = readFileSync(envFile, 'utf8');
const access_token = env.match(/SUPABASE_ACCESS_TOKEN='(.*)'/)?.[1];
const refresh_token = env.match(/SUPABASE_REFRESH_TOKEN='(.*)'/)?.[1];
if (!access_token) throw new Error('the session file has no SUPABASE_ACCESS_TOKEN');

const cookie = 'base64-' + Buffer.from(JSON.stringify({
  access_token, refresh_token, token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
})).toString('base64url');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
await ctx.addCookies([{
  name: `sb-${PROJECT_REF}-auth-token`, value: cookie,
  domain: new URL(BASE).hostname, path: '/', sameSite: 'Lax',
  expires: Math.floor(Date.now() / 1000) + 86400,
}]);

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
