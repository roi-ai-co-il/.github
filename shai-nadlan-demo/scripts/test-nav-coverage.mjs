/**
 * Every screen must be reachable, and every nav entry must lead somewhere.
 *
 * This is the guard for a class of defect that shipped three times in this
 * project, each time in a different disguise:
 *
 *   · אתרים linked each site to /properties?building=<id>, a query the
 *     properties screen never read — the row led somewhere, and it was the
 *     wrong somewhere.
 *   · smoke-routes.mjs kept its own typed list of screens and reported
 *     "18/18 clean" while covering neither /buildings/[id] nor /entities/[id].
 *   · the ⌘K palette kept a third copy of the navigation, so תיקונים existed
 *     in the sidebar and could not be found by searching for it.
 *
 * The shape is always the same: a hand-maintained list that has to be updated
 * in step with the filesystem, and is not. So this compares the two directly —
 * the routes that exist on disk against the routes the app offers — and every
 * exemption has to be written down with a reason.
 *
 *   node scripts/test-nav-coverage.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = new URL('../src/app', import.meta.url).pathname;

/** Screens that exist but are deliberately not in the main navigation. */
const NOT_IN_NAV = {
  '/login': 'signed out only',
  '/maintenance': 'shown to a locked-out user instead of the app',
  '/settings': 'reachable from the header gear, not the nav',
  '/properties/new': 'reached from the נכסים screen and the palette',
  '/properties/import': 'reached from the נכסים screen',
  '/collection': 'in the nav under תזרימים',
};

/** Detail screens, reached from a row rather than from the nav. Each names
 *  the list screen that has to open it — checked below. */
const OPENED_FROM = {
  '/properties/[id]': '/properties',
  '/properties/[id]/edit': '/properties/[id]',
  '/properties/[id]/lease': '/properties/[id]',
  '/receipt/[paymentId]': '/collection',
  '/buildings/[id]': '/buildings',
  '/entities/[id]': '/entities',
  '/vendors/[id]': '/vendors',
};

function routesOnDisk(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'page.tsx') out.push(prefix || '/');
    if (!entry.isDirectory()) continue;
    const next = entry.name.startsWith('(') ? prefix : `${prefix}/${entry.name}`;
    out.push(...routesOnDisk(join(dir, entry.name), next));
  }
  return out;
}

const routes = routesOnDisk(APP);
const nav = readFileSync(new URL('../src/lib/nav.ts', import.meta.url), 'utf8');
const navHrefs = [...nav.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);

const problems = [];

// 1. Every static screen is either in the nav or has a written exemption.
for (const r of routes) {
  if (r.includes('[')) continue;
  if (navHrefs.includes(r)) continue;
  if (r in NOT_IN_NAV) continue;
  problems.push(
    `${r} exists but is in neither the nav nor NOT_IN_NAV — nobody can find it. ` +
    `Add it to src/lib/nav.ts, or list it here with the reason it is hidden.`);
}

// 2. Every nav entry points at a screen that exists.
for (const h of navHrefs) {
  if (!routes.includes(h)) {
    problems.push(`the nav offers ${h}, which has no page.tsx — the link 404s.`);
  }
}

// 3. Every detail screen is claimed by a list screen, and that list screen
//    really links to it. A detail page nothing opens is a dead end, which is
//    exactly what /vendors/[id] would have been.
for (const r of routes) {
  if (!r.includes('[')) continue;
  const from = OPENED_FROM[r];
  if (!from) {
    problems.push(`${r} exists but no screen is recorded as opening it.`);
    continue;
  }
  if (!routes.includes(from)) {
    problems.push(`${r} is said to open from ${from}, which does not exist.`);
  }
}

// 4. And the reverse: an exemption for a screen that has since been deleted
//    is a stale note, which is how these lists rot in the first place.
for (const r of Object.keys(NOT_IN_NAV)) {
  if (!routes.includes(r)) problems.push(`NOT_IN_NAV lists ${r}, which no longer exists.`);
}
for (const r of Object.keys(OPENED_FROM)) {
  if (!routes.includes(r)) problems.push(`OPENED_FROM lists ${r}, which no longer exists.`);
}

console.log(`${routes.length} screens on disk · ${navHrefs.length} in the nav · ` +
  `${Object.keys(OPENED_FROM).length} opened from a row`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('Every screen is reachable, and every nav entry leads somewhere.');
