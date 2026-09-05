/**
 * The delete warning must name everything the delete destroys.
 *
 * Deleting a property cascades further than the button suggests: through its
 * leases to every rent payment, and through those to every receipt issued.
 * The confirmation used to say "including its contracts and images" — true,
 * and missing the rent history, the receipts, the uploaded documents and the
 * repairs. A warning that understates is worse than none, because the person
 * reads it and believes they know what they are about to lose.
 *
 * The graph is read from the LIVE catalog, through public.cascade_children().
 * The first version of this gate derived it from the migrations in the repo
 * and returned the wrong answer — it declared that receipts and
 * property_documents do not cascade from a property, which the database
 * flatly contradicts. The repo holds 9 migrations and the database has
 * recorded 29, so the checked-in set is a stale snapshot and cannot be the
 * source of truth for anything. That drift has its own gate:
 * scripts/test-migration-drift.mjs.
 *
 *   node scripts/test-delete-impact.mjs <session.env>
 */

import { readFileSync } from 'node:fs';
import { loadSession, projectEnv } from './qa-session.mjs';

const envFile = process.argv[2];
if (!envFile) throw new Error('usage: test-delete-impact.mjs <session.env>');

const session = await loadSession(envFile);
const { url: api, key } = projectEnv();

const resp = await fetch(`${api}/rest/v1/rpc/cascade_children`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ p_table: 'properties' }),
});
if (!resp.ok) {
  console.error(`could not read the cascade graph: ${resp.status} ${await resp.text()}`);
  process.exit(2); // could not tell is not a pass
}
const rows = await resp.json();
const destroyed = new Set(rows.map((r) => r.child));
if (!destroyed.size) {
  console.error('the cascade graph came back empty — the function is broken, not the schema.');
  process.exit(2);
}

const lib = readFileSync(new URL('../src/lib/delete-impact.ts', import.meta.url), 'utf8');
const named = new Set([...lib.matchAll(/table: '([a-z_]+)'/g)].map((m) => m[1]));

const problems = [];
for (const t of destroyed) {
  if (!named.has(t)) {
    problems.push(
      `deleting a property destroys rows in "${t}", and the warning never mentions it. ` +
      `Add it to PROPERTY_CASCADE in src/lib/delete-impact.ts.`);
  }
}
for (const t of named) {
  if (!destroyed.has(t)) {
    problems.push(`the warning mentions "${t}", which no longer cascades from a property.`);
  }
}

console.log(`cascade from properties → ${[...destroyed].sort().join(', ')}`);
console.log(`warning names          → ${[...named].sort().join(', ')}`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\nThe delete warning names every table the delete destroys.');
