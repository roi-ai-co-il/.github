/**
 * Every migration the database has run must exist in the repository.
 *
 * When this was written the database had recorded 29 migrations and the repo
 * held 9. Twenty of them — the ones that created property_documents, vendors,
 * tasks, receipts, buildings, owner_entities and the whole weekly-digest
 * machinery — existed nowhere but inside the running database.
 *
 * Two consequences, and the second is the one that bites daily:
 *
 *   · The schema could not be rebuilt from git. A restore would have to come
 *     from a Supabase backup, and nothing in version control described what
 *     the database was supposed to look like.
 *   · Any reasoning about the schema done by reading the repo is reasoning
 *     about a stale copy. That is not hypothetical: the first version of the
 *     delete-impact gate derived the cascade graph from these files and
 *     confidently reported the wrong answer.
 *
 * The fix is to write every applied migration into the repo. This gate exists
 * so the gap cannot reopen quietly — the next one applied without being
 * committed fails here, by name.
 *
 *   node scripts/test-migration-drift.mjs <session.env>
 *
 * Reads the applied list through public.applied_migrations(), which returns
 * versions and names only — no SQL, no data.
 */

import { readdirSync } from 'node:fs';
import { loadSession, projectEnv } from './qa-session.mjs';

const envFile = process.argv[2];
if (!envFile) throw new Error('usage: test-migration-drift.mjs <session.env>');

const session = await loadSession(envFile);
const { url: api, key } = projectEnv();

const resp = await fetch(`${api}/rest/v1/rpc/applied_migrations`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});
if (!resp.ok) {
  console.error(`could not read the applied migrations: ${resp.status} ${await resp.text()}`);
  process.exit(2); // could not tell is never a pass
}
const applied = await resp.json();
if (!applied.length) {
  console.error('the applied list came back empty — the function is broken, not the schema.');
  process.exit(2);
}

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir.pathname).filter((f) => f.endsWith('.sql'));

/* The two oldest files predate the timestamped naming and carry the versions
 * the database recorded for them. Everything since is named <version>_<name>. */
const LEGACY = { '0001_init.sql': '20260827195516', '0002_policies_initplan.sql': '20260827200703' };
const inRepo = new Set(files.map((f) => LEGACY[f] ?? f.split('_')[0]));

const missing = applied.filter((m) => !inRepo.has(m.version));
const extra = [...inRepo].filter((v) => !applied.some((m) => m.version === v));

console.log(`applied in the database: ${applied.length} · present in the repo: ${inRepo.size}`);

const problems = [];
for (const m of missing) {
  problems.push(`${m.version}_${m.name} ran against the database and is not in the repo.`);
}
for (const v of extra) {
  problems.push(`${v} is in the repo and was never applied — it will run on the next push.`);
}

if (problems.length) {
  console.log(`\n${problems.length} migration(s) out of step:\n`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\nThe repository describes exactly the schema the database is running.');
