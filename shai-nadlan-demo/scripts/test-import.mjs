#!/usr/bin/env node
/**
 * The importer's test suite.
 *
 * It compiles src/lib/import to a temp directory with the project's own tsc and
 * then exercises the COMPILED code, so what is tested is what ships rather than
 * a re-implementation of it. Run with `npm run test:import`.
 *
 * Two fixtures matter and are deliberately different:
 *   - a workbook built here from raw XML, which exercises the awkward branches
 *     (skipped columns, rich-text shared strings, inline strings, 1904 dates)
 *   - a workbook written by a real Excel writer when one is available, as a
 *     positive control that the reader is not merely agreeing with itself
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
/* The suite normally compiles the real source. A negative control points it at
   a patched COPY instead, so a defect can be reintroduced and the suite's
   reaction measured without ever touching the shipped files. */
const srcDir = process.env.IMPORT_SRC ?? 'src/lib';
/* Compiled INSIDE the project so `require('fflate')` resolves the same way it
   does at runtime — a temp directory elsewhere cannot see node_modules. Not
   UNDER node_modules though: tsc treats anything in there as an external
   library and silently emits nothing for it. */
const out = join(root, process.env.IMPORT_OUT ?? '.tmp-import-test');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log('compiling…');
execFileSync(
  join(root, 'node_modules/.bin/tsc'),
  [
    ...['coerce', 'csv', 'xlsx', 'grid', 'fields', 'match', 'plan']
      .map((m) => `${srcDir}/import/${m}.ts`),
    '--outDir', out, '--rootDir', srcDir,
    '--module', 'commonjs', '--moduleResolution', 'node',
    '--target', 'es2022', '--lib', 'es2022,dom',
    '--strict', '--skipLibCheck', '--esModuleInterop', '--noEmitOnError',
  ],
  { cwd: root, stdio: 'inherit' },
);

const require_ = createRequire(join(out, 'x.cjs'));
const load = (m) => require_(join(out, 'import', m));
const coerce = load('coerce.js');
const csv = load('csv.js');
const xlsx = load('xlsx.js');
const grid = load('grid.js');
const match = load('match.js');
const plan = load('plan.js');
const fields = load('fields.js');

/* ------------------------------------------------------------- test runner */

let pass = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function eq(actual, expected, what = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}expected ${b}, got ${a}`);
}

/* ============================================================ coerce: number */

t('num: money decorations are removed, not guessed at', () => {
  eq(coerce.num('₪ 5,400').value, 5400);
  eq(coerce.num('5400 ש"ח').value, 5400);
  eq(coerce.num('1.234.567').value, 1234567, 'european grouping: ');
  eq(coerce.num('(1,200)').value, -1200, 'parenthesised negative: ');
  eq(coerce.num('12.5').value, 12.5);
});

t('num: an empty cell is EMPTY, never zero', () => {
  eq(coerce.num('').state, 'empty');
  eq(coerce.num('   ').state, 'empty');
  eq(coerce.num(null).state, 'empty');
  eq(coerce.num(undefined).state, 'empty');
});

t('num: an unreadable cell is UNREADABLE, never zero', () => {
  for (const v of ['לפי הסכם', 'n/a', '—', '#REF!', 'שלוש']) {
    eq(coerce.num(v).state, 'unreadable', `${v}: `);
  }
});

t('num: invisible characters do not make a number unreadable', () => {
  eq(coerce.num('‏5,400‎').value, 5400, 'RTL marks: ');
  eq(coerce.num('5 400').value, 5400, 'NBSP separator: ');
});

t('money: a figure outside the band is unreadable, not clamped', () => {
  // 2019 is a perfectly plausible monthly rent, so the RENT band cannot reject
  // a year — the purchase-price band is where that number is obviously wrong.
  eq(coerce.money('2019', { min: 50_000, max: 1e9 }).state, 'unreadable');
  eq(coerce.money('5400', { min: 300, max: 200_000 }).value, 5400);
  eq(coerce.money('-100', { min: 0, max: 1e9 }).state, 'unreadable');
});

/* ============================================================== coerce: date */

t('date: ISO and Israeli forms', () => {
  eq(coerce.date('2026-03-04').value, '2026-03-04');
  eq(coerce.date('4/3/2026', 'dmy').value, '2026-03-04');
  eq(coerce.date('04.03.2026', 'dmy').value, '2026-03-04');
  eq(coerce.date('4-3-26', 'dmy').value, '2026-03-04');
});

t('date: the order is applied, not guessed per cell', () => {
  eq(coerce.date('03/04/2026', 'dmy').value, '2026-04-03');
  eq(coerce.date('03/04/2026', 'mdy').value, '2026-03-04');
});

t('date: a component above 12 settles the order whatever was asked for', () => {
  eq(coerce.date('25/12/2026', 'mdy').value, '2026-12-25');
});

t('date: a date the DATABASE would reject is unreadable here', () => {
  eq(coerce.date('2026-02-31').state, 'unreadable', '31 Feb: ');
  eq(coerce.date('31/02/2026', 'dmy').state, 'unreadable');
  eq(coerce.date('2026-13-01').state, 'unreadable', 'month 13: ');
});

t('date: a partial date is never completed with an invented day', () => {
  eq(coerce.date('3/2026').state, 'unreadable');
  eq(coerce.date('2026').state, 'unreadable');
});

t('detectDateOrder: proven from evidence, otherwise honestly assumed', () => {
  eq(coerce.detectDateOrder(['25/12/2026', '3/4/2026']), { order: 'dmy', evidence: 'proven' });
  eq(coerce.detectDateOrder(['12/25/2026', '4/3/2026']), { order: 'mdy', evidence: 'proven' });
  eq(coerce.detectDateOrder(['3/4/2026', '5/6/2026']), { order: 'dmy', evidence: 'assumed' });
});

/* ============================================================= coerce: phone */

t('phone: normalised to the local form the app stores', () => {
  eq(coerce.phone('054-123-4567').value, '0541234567');
  eq(coerce.phone('+972 54 1234567').value, '0541234567');
  eq(coerce.phone('972541234567').value, '0541234567');
  eq(coerce.phone('03-6123456').value, '036123456');
});

t('phone: a number we cannot read is NOT half-repaired', () => {
  eq(coerce.phone('12345').state, 'unreadable');
  eq(coerce.phone('צור קשר דרך המשרד').state, 'unreadable');
});

/* ============================================================ coerce: vocab */

t('vocab: an unknown word is unreadable, never the first option', () => {
  eq(coerce.vocab('מושכר', fields.STATUS_WORDS).value, 'rented');
  eq(coerce.vocab('פנוי', fields.STATUS_WORDS).value, 'vacant');
  eq(coerce.vocab('בבדיקה משפטית', fields.STATUS_WORDS).state, 'unreadable');
});

/* ================================================================== csv/tsv */

t('csv: delimiter is sniffed from consistency, not from the first line', () => {
  eq(csv.sniffDelimiter('a,b,c\n1,2,3\n4,5,6'), ',');
  eq(csv.sniffDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  eq(csv.sniffDelimiter('a;b;c\n1;2;3'), ';');
});

t('csv: a comma inside a quoted address does not split the row', () => {
  const rows = csv.parseDelimited('שם,כתובת,עיר\nדירה,"רוטשילד 12, קומה 3",תל אביב');
  eq(rows[1], ['דירה', 'רוטשילד 12, קומה 3', 'תל אביב']);
});

t('csv: escaped quotes, CRLF, and a last line with no newline', () => {
  const rows = csv.parseDelimited('a,b\r\n"say ""hi""",2\r\nx,y');
  eq(rows, [['a', 'b'], ['say "hi"', '2'], ['x', 'y']]);
});

t('csv: Excel\'s UTF-8 BOM does not become part of the first header', () => {
  const rows = csv.parseDelimited('﻿שם,עיר\nא,ב');
  eq(rows[0][0], 'שם');
});

/* ==================================================================== xlsx */

/** A workbook assembled from raw XML, holding on purpose every shape that a
 *  naive reader gets wrong. */
function buildAwkwardXlsx(zipSync, strToU8) {
  const f = (s) => strToU8(s);
  const sheet = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>
<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" s="1"><v>46388</v></c><c r="D3"><v>5400</v></c></row>
<row r="4"><c r="A4" t="inlineStr"><is><t>דירה ב</t></is></c><c r="B4" s="1"><v>46023</v></c><c r="D4"><v>4800.5</v></c></row>
</sheetData></worksheet>`;
  const shared = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
<si><t>שם</t></si><si><t>תאריך</t></si><si><t>שכר דירה</t></si>
<si><r><t>דירה </t></r><r><t>א</t></r></si>
</sst>`;
  const styles = `<?xml version="1.0"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="200" formatCode="dd/mm/yyyy"/></numFmts>
<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="200" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;
  const workbook = `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="נכסים" sheetId="1" r:id="rId1"/><sheet name="עזר" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`;
  const rels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="x"/>
<Relationship Id="rId2" Target="worksheets/sheet2.xml" Type="x"/>
</Relationships>`;
  return zipSync({
    '[Content_Types].xml': f('<?xml version="1.0"?><Types/>'),
    'xl/workbook.xml': f(workbook),
    'xl/_rels/workbook.xml.rels': f(rels),
    'xl/sharedStrings.xml': f(shared),
    'xl/styles.xml': f(styles),
    'xl/worksheets/sheet1.xml': f(sheet),
    'xl/worksheets/sheet2.xml': f('<?xml version="1.0"?><worksheet><sheetData/></worksheet>'),
  });
}

t('xlsx: column letters to indices', () => {
  eq(xlsx.colIndex('A1'), 0);
  eq(xlsx.colIndex('D3'), 3);
  eq(xlsx.colIndex('AA7'), 26);
  eq(xlsx.colIndex('BC1'), 54);
});

t('xlsx: serial dates, including Excel\'s imaginary 29 Feb 1900', () => {
  eq(xlsx.serialToIso(46388, false), '2027-01-01');
  eq(xlsx.serialToIso(1, false), '1900-01-01');
  eq(xlsx.serialToIso(59, false), '1900-02-28');
  eq(xlsx.serialToIso(60, false), null, 'the fictional 29 Feb 1900: ');
  eq(xlsx.serialToIso(61, false), '1900-03-01');
  eq(xlsx.serialToIso(0, true), null);
  eq(xlsx.serialToIso(1, true), '1904-01-02');
});

t('xlsx: skipped columns, blank rows, rich text, inline strings, hidden sheets', () => {
  const { zipSync, strToU8 } = require_('fflate');
  const buf = buildAwkwardXlsx(zipSync, strToU8);
  const sheets = xlsx.readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  eq(sheets.length, 1, 'a hidden sheet is not offered: ');
  eq(sheets[0].name, 'נכסים');
  const rows = sheets[0].rows;
  eq(rows[0], ['שם', 'תאריך', '', 'שכר דירה'], 'header with a skipped column C: ');
  eq(rows[1], [], 'row 2 is blank and must stay blank: ');
  eq(rows[2][0], 'דירה א', 'rich-text shared string is joined: ');
  eq(rows[2][1], '2027-01-01', 'a styled serial reads as a date: ');
  eq(rows[2][3], '5400');
  eq(rows[3][0], 'דירה ב', 'inline string: ');
  eq(rows[3][3], '4800.5', 'a plain number keeps its decimals and gains no float tail: ');
});

/* =================================================================== grid */

t('grid: the header is found below a title and a blank row', () => {
  const g = grid.buildGrid([
    ['דוח נכסים 2026', '', ''],
    ['', '', ''],
    ['כתובת', 'עיר', 'שכר דירה'],
    ['רוטשילד 12', 'תל אביב', '5400'],
    ['ביאליק 3', 'רמת גן', '4800'],
  ]);
  // Only fully-empty EDGE rows are trimmed; the title and the interior blank
  // row are still there, so the header sits at index 2.
  eq(g.headerRow, 2);
  eq(g.headers, ['כתובת', 'עיר', 'שכר דירה']);
  eq(g.body.length, 2);
  eq(g.headerEvidence, 'detected');
});

t('grid: empty edge columns are trimmed away', () => {
  const g = grid.buildGrid([
    ['', 'שם', 'עיר', ''],
    ['', 'א', 'חיפה', ''],
    ['', 'ב', 'חדרה', ''],
  ]);
  eq(g.headers, ['שם', 'עיר']);
  eq(g.body, [['א', 'חיפה'], ['ב', 'חדרה']]);
});

t('grid: a table with NO header keeps its first row as data', () => {
  // The shape of a paste straight out of a selection in Excel. Treating the
  // first row as a header here does not degrade the import — it DELETES a
  // property, silently, and the count still looks plausible.
  const g = grid.buildGrid([
    ['רוטשילד 12', 'תל אביב', 'דנה כהן', '054-1234567', '6200'],
    ['ביאליק 3', 'רמת גן', 'יוסי לוי', '052-7654321', '4800'],
    ['הרצל 45', 'חיפה', 'מיכל אברהם', '053-1112222', '5100'],
  ]);
  eq(g.headerRow, -1);
  eq(g.headerEvidence, 'none');
  eq(g.body.length, 3, 'every row is data: ');
  eq(g.headers, ['עמודה 1', 'עמודה 2', 'עמודה 3', 'עמודה 4', 'עמודה 5']);
});

t('grid: a real header is still found above the same data', () => {
  const g = grid.buildGrid([
    ['כתובת', 'עיר', 'שוכר', 'טלפון', 'שכר דירה'],
    ['רוטשילד 12', 'תל אביב', 'דנה כהן', '054-1234567', '6200'],
    ['ביאליק 3', 'רמת גן', 'יוסי לוי', '052-7654321', '4800'],
  ]);
  eq(g.headerRow, 0);
  eq(g.headerEvidence, 'detected');
  eq(g.body.length, 2);
});

t('plan: a headerless paste maps and plans every row', () => {
  const p = planFrom([
    ['רוטשילד 12', 'תל אביב', 'דנה כהן', '054-1234567', '6200', '01/01/2026'],
    ['ביאליק 3', 'רמת גן', 'יוסי לוי', '052-7654321', '4800', '15/03/2026'],
    ['הרצל 45', 'חיפה', '', '', '', ''],
  ]);
  eq(p.rows.length, 3, 'no row was eaten as a header: ');
  eq(p.rows[0].property.address, 'רוטשילד 12');
  eq(p.rows[0].tenant?.full_name, 'דנה כהן');
  eq(p.rows[0].tenant?.phone, '0541234567');
  eq(p.rows[0].lease?.monthly_rent, 6200);
  eq(p.rows[2].property.city, 'חיפה', 'the row with no tenant still imports: ');
  eq(p.rows[2].tenant, null);
});

t('grid: two columns with the same title stay distinguishable', () => {
  const g = grid.buildGrid([['תאריך', 'תאריך'], ['1/1/2026', '1/1/2027'], ['2/2/2026', '2/2/2027']]);
  eq(g.headers, ['תאריך', 'תאריך (2)']);
});

/* ================================================================== match */

t('match: plain Hebrew headers map to the right fields', () => {
  const g = grid.buildGrid([
    ['כתובת', 'עיר', 'שוכר', 'טלפון', 'שכר דירה', 'תחילת חוזה', 'סיום חוזה'],
    ['רוטשילד 12', 'תל אביב', 'דנה כהן', '054-1234567', '5,400', '1/1/2026', '31/12/2026'],
    ['ביאליק 3', 'רמת גן', 'יוסי לוי', '052-7654321', '4,800', '1/3/2026', '28/2/2027'],
  ]);
  const { mappings } = match.autoMap(g.headers, g.body);
  const got = Object.fromEntries(mappings.map((m) => [m.header, m.fieldKey]));
  eq(got, {
    'כתובת': 'address', 'עיר': 'city', 'שוכר': 'tenant_name', 'טלפון': 'tenant_phone',
    'שכר דירה': 'monthly_rent', 'תחילת חוזה': 'lease_start', 'סיום חוזה': 'lease_end',
  });
});

t('match: "שכר דירה מבוקש" beats "שכר דירה" for asking_rent', () => {
  const g = grid.buildGrid([
    ['כתובת', 'עיר', 'שכר דירה מבוקש'],
    ['רוטשילד 12', 'תל אביב', '5400'],
    ['ביאליק 3', 'רמת גן', '4800'],
  ]);
  const { mappings } = match.autoMap(g.headers, g.body);
  eq(mappings[2].fieldKey, 'asking_rent');
});

t('match: a column with NO usable header is mapped from its values alone', () => {
  const g = grid.buildGrid([
    ['עמודה 1', 'עמודה 2', 'עמודה 3'],
    ['רוטשילד 12', 'תל אביב', '054-1234567'],
    ['ביאליק 3', 'רמת גן', '052-7654321'],
    ['הרצל 45', 'חיפה', '053-1112222'],
  ]);
  const { mappings } = match.autoMap(g.headers, g.body);
  eq(mappings[1].fieldKey, 'city', 'Israeli cities identify a city column: ');
  eq(mappings[1].basis, 'values');
  eq(mappings[2].fieldKey, 'tenant_phone', 'phone shapes identify a phone column: ');
});

t('match: English headers work too', () => {
  const g = grid.buildGrid([
    ['Address', 'City', 'Tenant', 'Monthly Rent'],
    ['Rothschild 12', 'תל אביב', 'Dana Cohen', '5400'],
    ['Bialik 3', 'רמת גן', 'Yossi Levi', '4800'],
  ]);
  const { mappings } = match.autoMap(g.headers, g.body);
  eq(mappings.map((m) => m.fieldKey), ['address', 'city', 'tenant_name', 'monthly_rent']);
});

t('match: one field is never claimed by two columns', () => {
  const g = grid.buildGrid([
    ['עיר', 'ישוב'],
    ['תל אביב', 'רמת גן'],
    ['חיפה', 'חדרה'],
  ]);
  const { mappings } = match.autoMap(g.headers, g.body);
  const cityCols = mappings.filter((m) => m.fieldKey === 'city');
  eq(cityCols.length, 1);
});

t('match: values that contradict the header suppress it', () => {
  // A column titled "עיר" holding rents must not be mapped to city.
  const g = grid.buildGrid([
    ['כתובת', 'עיר'],
    ['רוטשילד 12', '5400'],
    ['ביאליק 3', '4800'],
    ['הרצל 45', '6200'],
  ]);
  const { mappings } = match.autoMap(g.headers, g.body);
  if (mappings[1].fieldKey === 'city') throw new Error('a rent column was mapped to city');
});

t('setMapping: choosing a field another column holds MOVES it', () => {
  const g = grid.buildGrid([['כתובת', 'עיר'], ['רוטשילד 12', 'תל אביב'], ['ביאליק 3', 'חיפה']]);
  let { mappings } = match.autoMap(g.headers, g.body);
  mappings = match.setMapping(mappings, 0, 'city');
  eq(mappings[0].fieldKey, 'city');
  eq(mappings[1].fieldKey, null, 'the previous holder was released: ');
});

/* =================================================================== plan */

function planFrom(rows, existing = [], options) {
  const g = grid.buildGrid(rows);
  const { mappings } = match.autoMap(g.headers, g.body);
  return plan.buildPlan({
    headers: g.headers, body: g.body, headerRow: g.headerRow,
    mappings, existing, options,
  });
}

t('plan: a full row becomes property + tenant + lease', () => {
  const p = planFrom([
    ['כתובת', 'עיר', 'שוכר', 'טלפון', 'שכר דירה', 'תחילת חוזה', 'סיום חוזה'],
    ['רוטשילד 12', 'תל אביב', 'דנה כהן', '054-1234567', '5,400', '1/1/2026', '31/12/2026'],
    ['ביאליק 3', 'רמת גן', 'יוסי לוי', '052-7654321', '4,800', '1/3/2026', '28/2/2027'],
  ]);
  const r = p.rows[0];
  eq(r.property.address, 'רוטשילד 12');
  eq(r.property.city, 'תל אביב');
  eq(r.property.status, 'rented', 'a property with a lease is rented: ');
  eq(r.tenant.full_name, 'דנה כהן');
  eq(r.tenant.phone, '0541234567');
  eq(r.lease.monthly_rent, 5400);
  eq(r.lease.start_date, '2026-01-01');
  eq(r.lease.end_date, '2026-12-31');
  eq(r.lease.endAssumed, false);
  eq(r.decision, 'create');
});

t('plan: a missing name is derived from the address and SAID to be derived', () => {
  const p = planFrom([
    ['כתובת', 'עיר'],
    ['רוטשילד 12', 'תל אביב'],
    ['ביאליק 3', 'רמת גן'],
  ]);
  eq(p.rows[0].property.name, 'רוטשילד 12, תל אביב');
  if (!p.rows[0].derived.includes('name')) throw new Error('a derived name was passed off as given');
});

t('plan: one address column carrying the city is split, and marked', () => {
  const p = planFrom([
    ['כתובת'],
    ['רוטשילד 12, תל אביב'],
    ['ביאליק 3, רמת גן'],
  ]);
  eq(p.rows[0].property.address, 'רוטשילד 12');
  eq(p.rows[0].property.city, 'תל אביב');
  if (!p.rows[0].derived.includes('city')) throw new Error('a split city was not marked derived');
});

t('plan: a row that cannot be saved is an ERROR and defaults to skipped', () => {
  const p = planFrom([
    ['כתובת', 'עיר', 'שכר דירה'],
    ['רוטשילד 12', 'תל אביב', '5400'],
    ['', '', '4800'],
  ]);
  const bad = p.rows[1];
  eq(bad.decision, 'skip');
  if (!bad.issues.some((i) => i.level === 'error')) throw new Error('a row with no address raised no error');
});

t('plan: a missing lease end is filled in and FLAGGED, never silently', () => {
  const p = planFrom([
    ['כתובת', 'עיר', 'שוכר', 'שכר דירה', 'תחילת חוזה'],
    ['רוטשילד 12', 'תל אביב', 'דנה כהן', '5400', '31/1/2026'],
    ['ביאליק 3', 'רמת גן', 'יוסי לוי', '4800', '1/3/2026'],
  ]);
  eq(p.rows[0].lease.end_date, '2027-01-31');
  eq(p.rows[0].lease.endAssumed, true);
  if (!p.rows[0].derived.includes('lease_end')) throw new Error('an assumed end date was not marked');
});

t('plan: an unreadable rent does not become 0 — it becomes an issue', () => {
  const p = planFrom([
    ['כתובת', 'עיר', 'שוכר', 'שכר דירה', 'תחילת חוזה'],
    ['רוטשילד 12', 'תל אביב', 'דנה כהן', 'לפי הסכם', '1/1/2026'],
    ['ביאליק 3', 'רמת גן', 'יוסי לוי', '4800', '1/3/2026'],
  ]);
  const r = p.rows[0];
  eq(r.lease, null, 'no lease is invented from an unreadable rent: ');
  if (!r.issues.some((i) => i.field === 'monthly_rent')) throw new Error('the unreadable rent was swallowed');
  eq(r.decision, 'create', 'the property itself is still importable: ');
});

t('plan: a property already in the system is detected and defaults to skipped', () => {
  const p = planFrom(
    [['כתובת', 'עיר'], ['רח׳ רוטשילד 12', 'תל אביב'], ['ביאליק 3', 'רמת גן']],
    [{ id: 'p1', name: 'הדירה ברוטשילד', address: 'רוטשילד 12', city: 'תל אביב' }],
  );
  eq(p.rows[0].duplicateOf, { id: 'p1', name: 'הדירה ברוטשילד' });
  eq(p.rows[0].decision, 'skip');
  eq(p.rows[1].duplicateOf, null);
  eq(p.rows[1].decision, 'create');
});

t('plan: two units in ONE building are two properties, not a duplicate', () => {
  const p = planFrom([
    ['כתובת', 'עיר'],
    ['רוטשילד 12 דירה 4', 'תל אביב'],
    ['רוטשילד 12 דירה 7', 'תל אביב'],
  ]);
  eq(p.rows[1].duplicateOfRow, null, 'the apartment number distinguishes them: ');
  eq(p.rows[1].decision, 'create');
});

t('plan: the same address twice in one file is caught', () => {
  const p = planFrom([
    ['כתובת', 'עיר'],
    ['רוטשילד 12', 'תל אביב'],
    ['רוטשילד 12', 'תל אביב'],
  ]);
  eq(p.rows[1].duplicateOfRow, 0);
  eq(p.rows[1].decision, 'skip');
});

t('plan: a rent with no tenant becomes the ASKING rent on a vacant property', () => {
  const p = planFrom([
    ['כתובת', 'עיר', 'שכר דירה'],
    ['רוטשילד 12', 'תל אביב', '5400'],
    ['ביאליק 3', 'רמת גן', '4800'],
  ]);
  eq(p.rows[0].property.status, 'vacant');
  eq(p.rows[0].property.asking_rent, 5400);
});

t('plan: an unknown status is reported, not silently defaulted', () => {
  const p = planFrom([
    ['כתובת', 'עיר', 'סטטוס'],
    ['רוטשילד 12', 'תל אביב', 'מושכר'],
    ['ביאליק 3', 'רמת גן', 'בבוררות'],
  ]);
  eq(p.rows[0].property.status, 'rented');
  eq(p.rows[1].property.status, 'vacant');
  if (!p.rows[1].issues.some((i) => i.field === 'status')) throw new Error('an unknown status was swallowed');
});

t('plan: a lease that already ended does NOT mark the property rented', () => {
  const p = planFrom([
    ['כתובת', 'עיר', 'שוכר', 'שכר דירה', 'תחילת חוזה', 'סיום חוזה'],
    ['רוטשילד 12', 'תל אביב', 'דנה כהן', '6200', '1/1/2020', '31/12/2020'],
    ['ביאליק 3', 'רמת גן', 'יוסי לוי', '4800', '1/1/2020', '31/12/2090'],
  ]);
  eq(p.rows[0].property.status, 'vacant', 'the term ran out years ago: ');
  eq(p.rows[1].property.status, 'rented', 'this one is still running: ');
  if (!p.rows[0].issues.some((i) => i.field === 'lease_end' && i.level === 'info')) {
    throw new Error('an expired lease was imported with nothing said about it');
  }
  // The lease itself is still created — it is history, not a lie.
  if (!p.rows[0].lease) throw new Error('an ended lease was dropped instead of kept as history');
});

t('plan: the date order is decided once for the whole file', () => {
  const p = planFrom([
    ['כתובת', 'עיר', 'תחילת חוזה'],
    ['רוטשילד 12', 'תל אביב', '25/12/2025'],
    ['ביאליק 3', 'רמת גן', '3/4/2026'],
  ]);
  eq(p.dateOrder, { order: 'dmy', evidence: 'proven' });
  eq(p.rows[1].property.status, 'vacant');
});

/* ------------------------------------------------------ payment schedules */

t('schedule: the FIRST month is never dropped by a timezone', () => {
  // The regression this exists for: `new Date('2026-03-01')` is midnight UTC and
  // `new Date(2026, 2, 1)` is midnight local, so east of Greenwich the first due
  // date compared as EARLIER than the start and the whole first month vanished.
  const s = plan.scheduleFor(
    { monthly_rent: 8100, start_date: '2026-03-01', end_date: '2027-03-01', payment_day: 1, linked_to_cpi: false, deposit: null, endAssumed: true },
    false, new Date('2026-09-04T12:00:00'),
  );
  eq(s[0].due_date, '2026-03-01', 'first due date: ');
  eq(s.length, 13, 'Mar 2026 through Mar 2027 inclusive: ');
});

t('schedule: a due day past the end of a short month is clamped, not skipped', () => {
  const s = plan.scheduleFor(
    { monthly_rent: 5000, start_date: '2026-01-15', end_date: '2026-04-15', payment_day: 31, linked_to_cpi: false, deposit: null, endAssumed: false },
    false, new Date('2026-01-01T00:00:00'),
  );
  eq(s.map((x) => x.due_date), ['2026-01-28', '2026-02-28', '2026-03-28']);
});

t('schedule: one row per due month, clamped to 28', () => {
  const s = plan.scheduleFor(
    { monthly_rent: 5000, start_date: '2026-01-01', end_date: '2026-06-30', payment_day: 31, linked_to_cpi: false, deposit: null, endAssumed: false },
    false, new Date('2026-01-15T00:00:00Z'),
  );
  eq(s.length, 6);
  eq(s[0].due_date, '2026-01-28');
  eq(s[5].due_date, '2026-06-28');
  eq(s.every((x) => x.paid === false), true);
});

t('schedule: past months can be marked paid, and the CURRENT month never is', () => {
  const s = plan.scheduleFor(
    { monthly_rent: 5000, start_date: '2025-10-01', end_date: '2026-09-30', payment_day: 1, linked_to_cpi: false, deposit: null, endAssumed: false },
    true, new Date('2026-01-15T12:00:00'),
  );
  const jan = s.find((x) => x.due_date === '2026-01-01');
  const dec = s.find((x) => x.due_date === '2025-12-01');
  eq(dec.paid, true, 'a month before this one: ');
  eq(jan.paid, false, 'the current month stays open: ');
});

/* ------------------------------------- a real Excel file, when available */

const realXlsx = process.env.REAL_XLSX ?? join(root, 'e2e', 'fixtures', 'real-excel.xlsx');
if (existsSync(realXlsx)) {
  t('xlsx: a workbook written by a real Excel writer reads correctly', () => {
    const buf = readFileSync(realXlsx);
    const sheets = xlsx.readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const g = grid.buildGrid(sheets[0].rows);
    const { mappings } = match.autoMap(g.headers, g.body);
    const byKey = Object.fromEntries(mappings.filter((m) => m.fieldKey).map((m) => [m.fieldKey, m.column]));
    for (const k of ['address', 'city', 'tenant_name', 'monthly_rent', 'lease_start']) {
      if (byKey[k] == null) throw new Error(`real workbook: ${k} was not mapped`);
    }
    const p = plan.buildPlan({ headers: g.headers, body: g.body, headerRow: g.headerRow, mappings, existing: [] });
    if (p.rows.length < 3) throw new Error(`real workbook: only ${p.rows.length} rows planned`);
    // A native Excel date cell is a serial with a style, not text — the whole
    // point of this control is that it takes a different code path.
    if (!p.rows[0].lease || !/^\d{4}-\d{2}-\d{2}$/.test(p.rows[0].lease.start_date)) {
      throw new Error('real workbook: a native Excel date did not read as a date');
    }
  });
} else {
  console.log(`\n  (skipped the real-Excel control: ${realXlsx} not present)`);
}

/* ------------------------------------------------------------------ report */

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`\n  ✗ ${f}`);
  process.exit(1);
}
