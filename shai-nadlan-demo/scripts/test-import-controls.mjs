#!/usr/bin/env node
/**
 * Negative controls for the importer suite.
 *
 * A green test suite is evidence about the suite, not about the code. Each
 * control below reintroduces one real defect into a COPY of the source, runs
 * the suite against that copy, and requires it to FAIL naming the right test.
 * A control that passes means the guard is not guarding anything.
 *
 * Run with `npm run test:import:controls`.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
// Not under node_modules: tsc emits nothing for sources it finds there.
const stage = join(root, '.tmp-import-control-src');

/** Each control: the file, the exact text to replace, what to replace it with,
 *  and the test whose failure proves the guard fired. */
/* Removed deliberately, not forgotten: a control that flipped `ratio`'s
   minimum sample from 1 to 2 kept PASSING, because once the sample weight moved
   out of the hit rate that line stopped deciding anything observable. A control
   that passes is evidence about the control, so it was withdrawn rather than
   propped up with a test written backwards from it. */
const CONTROLS = [
  {
    name: 'a Hebrew word boundary written as \\b (matches nothing)',
    file: 'import/plan.ts',
    from: `      .split(/\\s+/)
      .filter((w) => w && !STREET_WORDS.has(w))
      .join(' ')`,
    to: `      .replace(/\\bרחוב\\b|\\bרח\\b|\\bשדרות\\b|\\bשד\\b/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim()`,
    expect: 'already in the system',
  },
  {
    name: 'an unreadable number falling back to 0',
    file: 'import/coerce.ts',
    from: `  if (!/^\\d*\\.?\\d+$/.test(s) && !/^\\d+\\.$/.test(s)) return bad(s0);`,
    to: `  if (!/^\\d*\\.?\\d+$/.test(s) && !/^\\d+\\.$/.test(s)) return ok(Number(s) || 0);`,
    expect: 'does not become 0',
  },
  {
    name: 'an invalid calendar day accepted because the regex matched',
    file: 'import/coerce.ts',
    from: `  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;`,
    to: `  return true;`,
    expect: 'DATABASE would reject',
  },
  {
    name: '"these values are the wrong kind" scored as "no opinion"',
    file: 'import/fields.ts',
    from: `  if (ratio(vals, numeric) > 0.7) return -0.6;
      const r = ratio(vals, looksLikeCity);`,
    to: `  if (ratio(vals, numeric) > 0.7) return 0;
      const r = ratio(vals, looksLikeCity);`,
    expect: 'contradict the header',
  },
  {
    name: 'one epoch for every Excel serial (the 1900 leap bug ignored)',
    file: 'import/xlsx.ts',
    from: `    : days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);`,
    to: `    : Date.UTC(1899, 11, 30);`,
    expect: 'imaginary 29 Feb 1900',
  },
  {
    // Timezone-pinned: the defect only appears east of Greenwich, so the control
    // forces a timezone rather than depending on where the machine happens to be.
    // The FIX needs no such pinning — it never parses a date at all.
    name: 'the payment schedule rebuilt on Date objects (drops the first month)',
    tz: 'Asia/Jerusalem',
    file: 'import/plan.ts',
    from: `  let [y, m] = lease.start_date.split('-').map(Number);
  let due = iso(y, m, dueDay);
  if (due < lease.start_date) {`,
    to: `  const startD = new Date(lease.start_date);
  let [y, m] = [startD.getFullYear(), startD.getMonth() + 1];
  let due = iso(y, m, dueDay);
  if (new Date(y, m - 1, dueDay) < startD) {`,
    expect: 'FIRST month is never dropped',
  },
  {
    name: 'any lease at all marking the property rented, expired or not',
    file: 'import/plan.ts',
    // Written so the mutated source still COMPILES: dropping the whole
    // condition leaves the `else if (lease)` branch narrowed to null and tsc
    // refuses it, and a control that cannot build tests nothing.
    from: `    if (lease && !leaseHasEnded(lease.end_date)) {`,
    to: `    if (lease && lease.end_date !== '') {`,
    expect: 'does NOT mark the property rented',
  },
  {
    name: 'a headerless table having its first row eaten as a header',
    file: 'import/grid.ts',
    from: `      if (s > best && pureLabelRatio(rows[i]) >= HEADER_BAR) { best = s; headerRow = i; }`,
    to: `      if (s > best) { best = s; headerRow = i; }`,
    expect: 'keeps its first row as data',
  },
  {
    name: 'one physical building split in two by a derived second name',
    file: 'import/plan.ts',
    from: `    const named = members.find((r) => r.property.buildingName)?.property.buildingName;
    const name = named ?? g.name;`,
    to: `    const name = g.name;`,
    expect: 'one name for one building',
  },
  {
    name: 'a single flat at an address forming a "building" of one',
    file: 'import/plan.ts',
    from: `    if (g.rows.length < 2) continue;   // one flat is not a building`,
    to: `    if (g.rows.length < 1) continue;`,
    expect: 'NOT turned into a building of one',
  },
  {
    name: 'the address floor overwriting a floor the file actually gave',
    file: 'import/plan.ts',
    from: `    if (property.floor_no == null && parsedAddr.floor != null) {`,
    to: `    if (parsedAddr.floor != null) {`,
    expect: 'beats a floor read out of the address',
  },
  {
    name: 'grouping on the FULL address, so no building is ever detected',
    file: 'import/address.ts',
    from: `  const { base } = parseAddress(address);
  const strip = (v: string) =>`,
    to: `  const base = address;
  const strip = (v: string) =>`,
    expect: 'become a building AND stay separate',
  },
  {
    name: 'a missing lease end silently invented without a flag',
    file: 'import/plan.ts',
    from: `      if (endAssumed) derived.push('lease_end');`,
    to: ``,
    expect: 'FLAGGED, never silently',
  },
  {
    name: 'a derived name passed off as read from the file',
    file: 'import/plan.ts',
    from: `if (address) { name = city ? \`\${address}, \${city}\` : address; derived.push('name'); }`,
    to: `if (address) { name = city ? \`\${address}, \${city}\` : address; }`,
    expect: 'SAID to be derived',
  },
];

let held = 0;
const missed = [];

for (const c of CONTROLS) {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  cpSync(join(root, 'src/lib'), stage, { recursive: true });

  const target = join(stage, c.file);
  const before = readFileSync(target, 'utf8');
  if (!before.includes(c.from)) {
    missed.push(`${c.name}\n      the control could not be applied — its anchor text is gone from ${c.file}`);
    continue;
  }
  writeFileSync(target, before.replace(c.from, c.to));

  let output = '';
  let failed = false;
  try {
    output = execFileSync(process.execPath, [join(root, 'scripts/test-import.mjs')], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, IMPORT_SRC: stage, IMPORT_OUT: '.tmp-import-control-out', ...(c.tz ? { TZ: c.tz } : {}) },
    });
  } catch (e) {
    failed = true;
    output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }

  if (!failed) {
    missed.push(`${c.name}\n      the suite still PASSED with this defect present`);
  } else if (!output.includes(c.expect)) {
    // A control that fails for a different reason proves nothing about the
    // guard it was written for.
    missed.push(`${c.name}\n      the suite failed, but not on "${c.expect}" — the wrong check fired`);
  } else {
    held++;
    console.log(`  ✓ caught: ${c.name}`);
  }
}

rmSync(stage, { recursive: true, force: true });
console.log(`\n${held}/${CONTROLS.length} defects were caught by the suite`);
if (missed.length) {
  for (const m of missed) console.error(`\n  ✗ NOT caught: ${m}`);
  process.exit(1);
}
