#!/usr/bin/env node
/**
 * Seed the demo portfolio.
 *
 * Everything it writes carries one `import_batch_id`, so the whole demo is a
 * single row in "ייבואים אחרונים" and one button removes it — which is the only
 * safe way to put demo data into a system that is about to receive real data.
 *
 * It writes through the ordinary anon key plus a signed-in session, not a
 * service key, so it goes through exactly the RLS the app goes through. Storage
 * needs that session too: the images bucket only accepts a path whose first
 * folder is the uploader's own user id.
 *
 *   node scripts/seed-demo.mjs --images <dir> [--dry]
 *   node scripts/seed-demo.mjs --undo <batch-id>
 *
 * The session comes from SUPABASE_ACCESS_TOKEN / SUPABASE_REFRESH_TOKEN in the
 * environment so no token is ever written into a file or an argument list.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { BUILDINGS, DOCUMENTS, ENTITIES, PROPERTIES, TASKS, VENDORS, day, month } from './demo-portfolio.mjs';
import { renderDocuments } from './demo-documents.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? true) : fallback;
};
const DRY = process.argv.includes('--dry');

/* ------------------------------------------------------------------ client */

function env() {
  const text = readFileSync(join(root, '.env.local'), 'utf8');
  const pick = (k) => text.match(new RegExp(`^${k}="?(.*?)"?$`, 'm'))?.[1];
  const url = pick('NEXT_PUBLIC_SUPABASE_URL');
  const key = pick('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('.env.local is missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY');
  return { url, key };
}

async function connect() {
  const { url, key } = env();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const access_token = process.env.SUPABASE_ACCESS_TOKEN;
  const refresh_token = process.env.SUPABASE_REFRESH_TOKEN;
  if (!access_token) throw new Error('SUPABASE_ACCESS_TOKEN is not set — sign in first');
  const { data, error } = await db.auth.setSession({ access_token, refresh_token: refresh_token ?? '' });
  if (error || !data.user) throw new Error(`the session was refused: ${error?.message ?? 'no user'}`);
  return { db, uid: data.user.id, email: data.user.email };
}

const ok = (label, { error }) => { if (error) throw new Error(`${label}: ${error.message}`); };
const uuid = () => crypto.randomUUID();

/* --------------------------------------------------------------- payments */

/** The collection history behind a lease, as one row per due month. */
function schedule(lease, pattern, today = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const dueDay = Math.min(Math.max(lease.payment_day, 1), 28);
  let [y, m] = lease.start.split('-').map(Number);
  let due = iso(y, m, dueDay);
  if (due < lease.start) { m += 1; if (m > 12) { m = 1; y += 1; } due = iso(y, m, dueDay); }

  const all = [];
  while (due <= lease.end && all.length < 36) {
    all.push(due);
    m += 1; if (m > 12) { m = 1; y += 1; }
    due = iso(y, m, dueDay);
  }

  const todayIso = iso(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const past = all.filter((d) => d <= todayIso);
  // How many of the months already due were NOT paid.
  const unpaid = pattern === 'late2' ? 2 : pattern === 'late1' ? 1 : pattern === 'none' ? past.length : 0;
  const unpaidFrom = past.length - unpaid;

  return all.map((due_date, i) => {
    const isPast = due_date <= todayIso;
    const paid = isPast && i < unpaidFrom;
    return { due_date, amount: lease.rent, paid, paid_date: paid ? due_date : null };
  });
}

/* ------------------------------------------------------------------- undo */

async function undo(db, batchId) {
  for (const table of ['properties', 'tenants']) {
    const { error } = await db.from(table).delete().eq('import_batch_id', batchId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log('removed every property and tenant of batch', batchId);
  console.log('entities, buildings and vendors are shared objects and were left in place');
}

/* ------------------------------------------------------------------- seed */

async function seed(db, uid, imagesDir) {
  const say = (s) => console.log(' ·', s);

  say('opening the batch');
  const { data: batch, error: bErr } = await db.from('import_batches')
    .insert({ source: 'file', filename: 'תיק הדגמה', counts: {} })
    .select('id').single();
  ok('import_batches', { error: bErr });
  const batchId = batch.id;
  console.log('   batch', batchId);

  /* --- images ------------------------------------------------------- */
  say('uploading images');
  const files = readdirSync(imagesDir).filter((f) => extname(f) === '.jpg');
  const publicUrl = new Map();
  for (const f of files) {
    const name = basename(f, '.jpg');
    const path = `${uid}/demo/${batchId}/${name}.jpg`;
    const { error } = await db.storage.from('property-images')
      .upload(path, readFileSync(join(imagesDir, f)), { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`upload ${f}: ${error.message}`);
    publicUrl.set(name, db.storage.from('property-images').getPublicUrl(path).data.publicUrl);
  }
  console.log(`   ${publicUrl.size} images`);

  /* --- entities and buildings --------------------------------------- */
  say('entities and buildings');
  const entityId = new Map();
  for (const e of ENTITIES) {
    const id = uuid();
    ok('owner_entities', await db.from('owner_entities').insert({
      id, name: e.name, entity_type: e.entity_type, tax_id: e.tax_id ?? null, notes: e.notes ?? null,
    }));
    entityId.set(e.key, id);
  }
  const buildingId = new Map();
  for (const b of BUILDINGS) {
    const id = uuid();
    ok('buildings', await db.from('buildings').insert({
      id, name: b.name, address: b.address, city: b.city,
      entity_id: entityId.get(b.entity) ?? null, notes: b.notes ?? null,
    }));
    buildingId.set(b.key, id);
  }

  /* --- properties, tenants, leases, payments ------------------------ */
  say('properties');
  const propertyId = new Map();
  const tenantId = new Map();
  const propertyRows = [];
  const imageRows = [];

  for (const p of PROPERTIES) {
    const id = uuid();
    propertyId.set(p.name, id);
    propertyRows.push({
      id, name: p.name, address: p.address, city: p.city,
      property_type: p.property_type,
      status: p.status ?? (p.lease ? 'rented' : 'vacant'),
      rooms: p.rooms ?? null, area_sqm: p.area_sqm ?? null, floor_no: p.floor_no ?? null,
      asking_rent: p.asking_rent ?? null,
      purchase_price: p.purchase_price ?? null, purchase_date: p.purchase_date ?? null,
      current_value: p.current_value ?? null,
      insurer: p.insurer ?? null, insurance_expires_on: p.insurance_expires_on ?? null,
      notes: p.notes ?? null,
      entity_id: p.entity ? entityId.get(p.entity) ?? null : null,
      building_id: p.building ? buildingId.get(p.building) ?? null : null,
      cover_image_url: publicUrl.get(p.image) ?? null,
      import_batch_id: batchId,
    });
    // The cover is also the first gallery image, so the property page has a
    // gallery rather than a lone header picture.
    [p.image, ...(p.gallery ?? [])].forEach((img, i) => {
      const url = publicUrl.get(img);
      if (url) imageRows.push({ property_id: id, url, sort_order: i });
    });
  }
  ok('properties', await db.from('properties').insert(propertyRows));
  ok('property_images', await db.from('property_images').insert(imageRows));
  console.log(`   ${propertyRows.length} properties, ${imageRows.length} images attached`);

  say('tenants, leases and payment schedules');
  const leaseRows = [];
  const paymentRows = [];
  const makeTenant = async (t) => {
    if (tenantId.has(t.tenant)) return tenantId.get(t.tenant);
    const id = uuid();
    ok('tenants', await db.from('tenants').insert({
      id, full_name: t.tenant, phone: t.phone ?? null, email: t.email ?? null,
      import_batch_id: batchId,
    }));
    tenantId.set(t.tenant, id);
    return id;
  };

  for (const p of PROPERTIES) {
    for (const [lease, status] of [[p.lease, 'active'], [p.endedLease, 'ended']]) {
      if (!lease) continue;
      const tId = await makeTenant(lease);
      const leaseId = uuid();
      leaseRows.push({
        id: leaseId, property_id: propertyId.get(p.name), tenant_id: tId,
        start_date: lease.start, end_date: lease.end, monthly_rent: lease.rent,
        payment_day: lease.payment_day ?? 1,
        deposit: lease.deposit ?? null, deposit_received: !!lease.deposit_received,
        linked_to_cpi: !!lease.cpi,
        cpi_updated_on: lease.cpiUpdatedMonthsAgo != null ? month(-lease.cpiUpdatedMonthsAgo, 1) : null,
        status, notes: lease.notes ?? null, import_batch_id: batchId,
      });
      const rows = status === 'ended'
        ? schedule(lease, 'ontime').map((r) => ({ ...r, paid: true, paid_date: r.due_date }))
        : schedule(lease, lease.payments ?? 'ontime');
      for (const r of rows) paymentRows.push({ lease_id: leaseId, ...r });
    }
  }
  ok('leases', await db.from('leases').insert(leaseRows));
  for (let i = 0; i < paymentRows.length; i += 200) {
    ok('lease_payments', await db.from('lease_payments').insert(paymentRows.slice(i, i + 200)));
  }
  console.log(`   ${tenantId.size} tenants, ${leaseRows.length} leases, ${paymentRows.length} payments`);

  /* --- vendors and tasks -------------------------------------------- */
  say('vendors and tasks');
  ok('vendors', await db.from('vendors').insert(VENDORS.map((v) => ({
    name: v.name, trade: v.trade, phone: v.phone ?? null, email: v.email ?? null, notes: v.notes ?? null,
  }))));
  ok('tasks', await db.from('tasks').insert(TASKS.map((t) => ({
    title: t.title, notes: t.notes ?? null, due_date: t.due ?? null,
    done: !!t.done, done_at: t.done ? day(-2) : null,
    property_id: t.property ? propertyId.get(t.property) ?? null : null,
  }))));
  console.log(`   ${VENDORS.length} vendors, ${TASKS.length} tasks`);

  /* --- documents ----------------------------------------------------- */
  say('printing and uploading documents');
  const byName = new Map(PROPERTIES.map((p) => [p.name, p]));
  const landlord = 'שי עובדיה';
  const printed = await renderDocuments(DOCUMENTS, (d) => {
    const p = byName.get(d.property);
    const l = p.lease ?? p.endedLease ?? {};
    return {
      property: p.name, city: p.city, landlord,
      tenant: l.tenant, phone: l.phone, start: l.start, end: l.end,
      rent: l.rent, paymentDay: l.payment_day ?? 1, deposit: l.deposit, cpi: !!l.cpi,
      insurer: p.insurer, policy: `PL-${String(Math.abs(hash(p.name)) % 900000 + 100000)}`,
      sum: Math.round((p.current_value ?? 1000000) * 0.42), excess: 3500,
      area: p.area_sqm, value: p.current_value, date: month(d.dateOffsetMonths, 12),
      account: `${String(Math.abs(hash(p.address)) % 90000 + 10000)}-4`,
      period: 'רבעון נוכחי', amount: Math.round((p.area_sqm ?? 60) * 38), due: day(20),
      monthly: 240,
    };
  });
  const docRows = [];
  for (const { doc, bytes } of printed) {
    const p = byName.get(doc.property);
    const path = `${uid}/demo/${batchId}/${uuid()}.pdf`;
    const { error } = await db.storage.from('property-documents')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(`document upload: ${error.message}`);
    docRows.push({
      property_id: propertyId.get(doc.property), title: doc.title, doc_type: doc.doc_type,
      storage_path: path, mime_type: 'application/pdf', size_bytes: bytes.length,
      doc_date: month(doc.dateOffsetMonths, 12), notes: null,
    });
    void p;
  }
  ok('property_documents', await db.from('property_documents').insert(docRows));
  console.log(`   ${docRows.length} documents`);

  /* --- receipts ------------------------------------------------------ */
  // A couple of אסמכתאות already issued, so the receipts screen is not empty.
  say('receipts');
  const { data: paidSample } = await db
    .from('lease_payments')
    .select('id, amount, due_date, paid_date, lease:leases(property:properties(name,address), tenant:tenants(full_name))')
    .eq('paid', true)
    .order('due_date', { ascending: false })
    .limit(3);
  const receiptRows = (paidSample ?? []).map((p) => ({
    payment_id: p.id, amount: p.amount, paid_date: p.paid_date,
    issuer_name: landlord,
    property_name: p.lease?.property?.name ?? 'נכס',
    property_address: p.lease?.property?.address ?? null,
    tenant_name: p.lease?.tenant?.full_name ?? 'שוכר',
    period_label: new Date(p.due_date).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
  }));
  if (receiptRows.length) ok('receipts', await db.from('receipts').insert(receiptRows));
  console.log(`   ${receiptRows.length} receipts`);

  const counts = {
    properties: propertyRows.length, tenants: tenantId.size, leases: leaseRows.length,
    payments: paymentRows.length, entities: ENTITIES.length, buildings: BUILDINGS.length,
    images: imageRows.length, documents: docRows.length, tasks: TASKS.length,
    vendors: VENDORS.length, receipts: receiptRows.length,
  };
  await db.from('import_batches').update({ counts }).eq('id', batchId);
  return { batchId, counts };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/* ------------------------------------------------------------------- main */

const { db, uid, email } = await connect();
console.log(`signed in as ${email}`);

const undoId = arg('undo');
if (undoId && undoId !== true) {
  await undo(db, undoId);
  process.exit(0);
}

if (DRY) {
  console.log('dry run — nothing was written');
  console.log(`${PROPERTIES.length} properties, ${PROPERTIES.filter((p) => p.lease).length} active leases`);
  process.exit(0);
}

const imagesDir = arg('images');
if (!imagesDir) throw new Error('--images <dir> is required');
const result = await seed(db, uid, imagesDir);
console.log('\nseeded batch', result.batchId);
console.log(result.counts);
