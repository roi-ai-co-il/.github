#!/usr/bin/env node
/**
 * What someone WITHOUT a session can reach.
 *
 * Every table is probed with the plain anon key, the same key that ships in the
 * browser bundle. A misspelled column is used as the positive control: if that
 * comes back 200 the probe itself is broken and a clean "0 rows" would mean
 * nothing.
 *
 *   BASE=… node scripts/qa-auth.mjs
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const local = readFileSync(join(root, '.env.local'), 'utf8');
const pick = (k) => local.match(new RegExp(`^${k}="?(.*?)"?$`, 'm'))[1];
const URL_ = pick('NEXT_PUBLIC_SUPABASE_URL');
const KEY = pick('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const BASE = process.env.BASE ?? 'http://localhost:3100';

let pass = 0;
const fails = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`✓ ${name}`); }
  else { fails.push(`${name} — ${detail}`); console.log(`✗ ${name} — ${detail}`); }
};

const rest = (path) =>
  fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });

const TABLES = [
  'properties', 'tenants', 'leases', 'lease_payments', 'owner_entities',
  'buildings', 'property_documents', 'property_images', 'tasks', 'vendors',
  'receipts', 'digest_settings', 'import_batches', 'portfolio_members',
];

for (const t of TABLES) {
  const r = await rest(`${t}?select=*&limit=5`);
  const body = r.ok ? await r.json() : null;
  const empty = r.status === 401 || r.status === 403 || (Array.isArray(body) && body.length === 0);
  check(`anon cannot read ${t}`, empty, `HTTP ${r.status}${Array.isArray(body) ? ` · ${body.length} rows` : ''}`);
}

/* The control: the same probe against a column that does not exist must FAIL.
   Without it, "0 rows everywhere" could just mean the probe never ran. */
const control = await rest('properties?select=column_that_does_not_exist&limit=1');
check('the probe itself works (a bad column is rejected)', control.status >= 400, `HTTP ${control.status}`);

/* Writing is the half that matters most: reading nothing is no comfort if
   anyone can insert. */
const w = await fetch(`${URL_}/rest/v1/properties`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'anon write probe', address: 'x', city: 'y', property_type: 'apartment' }),
});
check('anon cannot INSERT a property', w.status >= 400, `HTTP ${w.status}`);

/* And the app's own surfaces. */
for (const [name, path, want] of [
  ['the app redirects an anonymous visitor to /login', '/', '/login'],
  ['a deep link redirects too', '/properties', '/login'],
  ['the maintenance notice is not reachable without a session', '/maintenance', '/login'],
]) {
  const r = await fetch(BASE + path, { redirect: 'manual' });
  const to = r.headers.get('location') ?? '';
  check(name, r.status >= 300 && r.status < 400 && to.includes(want), `HTTP ${r.status} → ${to || '(no redirect)'}`);
}

const api = await fetch(`${BASE}/api/assistant`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x' }),
});
check('the assistant API answers 401 without a session, not a login redirect', api.status === 401, `HTTP ${api.status}`);

const version = await fetch(`${BASE}/api/version`);
check('/api/version stays public (the freshness guard needs it)', version.ok, `HTTP ${version.status}`);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.error(`  ✗ ${f}`); process.exit(1); }
