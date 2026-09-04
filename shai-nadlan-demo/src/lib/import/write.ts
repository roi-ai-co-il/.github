/**
 * Writing an approved plan.
 *
 * Two decisions shape everything here:
 *
 * 1. Every id is generated on the CLIENT before anything is sent. Rows can then
 *    be inserted in batches without depending on PostgREST returning them in
 *    the order they were given, and a lease knows its property's id before that
 *    property has been acknowledged.
 *
 * 2. Every row carries the batch id. A half-finished import — the network drops
 *    after the properties and before the leases — is not a mess the user has to
 *    unpick by hand: it is one batch, and one button removes it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesInsert, TablesUpdate } from '../database.types';
import { leaseHasEnded, scheduleFor, type PlannedRow } from './plan';

type DB = SupabaseClient<Database>;

export interface WriteResult {
  batchId: string;
  properties: number;
  tenants: number;
  leases: number;
  payments: number;
  entities: number;
  buildings: number;
  merged: number;
  skipped: number;
}

export interface WriteOptions {
  source: 'file' | 'paste';
  filename: string | null;
  markPastPaid: boolean;
  /** Create the buildings the addresses imply. On by default; a scattered
   *  portfolio detects none, so the flag only matters when there is something
   *  to group. */
  groupBuildings: boolean;
  /**
   * Who holds these properties. Optional by design — the portfolio may be on
   * one name, and then this is a field nobody should have to think about.
   * A file that names an entity per row always overrules this.
   */
  entity: { id: string } | { newName: string } | null;
  onProgress?: (step: string) => void;
}

const CHUNK = 50;

/**
 * Insert in chunks. The caller passes the insert itself rather than a table
 * NAME, so every call site keeps its own exact row type and a wrong column is
 * a compile error there instead of an `any` swallowed here.
 */
async function inChunks<T>(
  rows: T[],
  insert: (batch: T[]) => PromiseLike<{ error: { message: string } | null }>,
  label: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`${label}: ${error.message}`);
  }
}

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    // A browser too old for randomUUID is not a reason to write a row with no
    // id — but it is a reason to say so rather than invent a weak one.
    (() => { throw new Error('הדפדפן הזה לא תומך ביצירת מזהים — נסה דפדפן עדכני'); })());

export async function writeImport(
  db: DB,
  rows: PlannedRow[],
  opts: WriteOptions,
): Promise<WriteResult> {
  const batch = await openBatch(db, opts);
  try {
    return await runImport(db, rows, opts, batch);
  } catch (err) {
    /* Half a portfolio is worse than none: the user cannot tell which half
       arrived. The batch id exists precisely so a failure can be unwound as one
       act, so it is unwound here rather than left for them to find. */
    try {
      await undoImport(db, batch);
      await db.from('import_batches').delete().eq('id', batch);
    } catch {
      throw new Error(
        `${err instanceof Error ? err.message : 'הייבוא נכשל'} — וגם הניקוי נכשל. ` +
        'הייבוא מופיע ברשימת הייבואים האחרונים ואפשר לבטל אותו משם.',
      );
    }
    throw new Error(
      `${err instanceof Error ? err.message : 'הייבוא נכשל'} — לא נשמר שום דבר, אפשר לתקן ולנסות שוב.`,
    );
  }
}

async function openBatch(db: DB, opts: WriteOptions): Promise<string> {
  const { data, error } = await db
    .from('import_batches')
    .insert({ source: opts.source, filename: opts.filename, counts: {} })
    .select('id')
    .single();
  if (error || !data) throw new Error(`פתיחת הייבוא נכשלה: ${error?.message ?? 'לא ידוע'}`);
  return data.id;
}

async function runImport(
  db: DB,
  rows: PlannedRow[],
  opts: WriteOptions,
  batchId: string,
): Promise<WriteResult> {
  const say = opts.onProgress ?? (() => {});
  const toCreate = rows.filter((r) => r.decision === 'create');
  const toMerge = rows.filter((r) => r.decision === 'merge' && r.duplicateOf);
  const skipped = rows.length - toCreate.length - toMerge.length;

  /* ---- entities and buildings the file refers to by name ---------------- */
  say('בודק ישויות ובניינים…');
  /* One place decides which building and which entity a row belongs to, so the
     review screen and the writer cannot disagree about it. */
  const buildingOf = (r: PlannedRow): string | null =>
    r.property.buildingName ?? (opts.groupBuildings ? r.autoBuilding : null);

  const chosenNewEntity = opts.entity && 'newName' in opts.entity ? opts.entity.newName.trim() : '';
  const chosenEntityId = opts.entity && 'id' in opts.entity ? opts.entity.id : null;

  const wantedEntities = [...new Set([
    ...toCreate.map((r) => r.property.entityName).filter(Boolean) as string[],
    ...(chosenNewEntity ? [chosenNewEntity] : []),
  ])];
  const wantedBuildings = [...new Set(toCreate.map(buildingOf).filter(Boolean))] as string[];

  const entityId = new Map<string, string>();
  const buildingId = new Map<string, string>();
  let newEntities = 0;
  let newBuildings = 0;

  if (wantedEntities.length) {
    const { data } = await db.from('owner_entities').select('id, name');
    for (const e of data ?? []) entityId.set(e.name.trim(), e.id);
    const missing = wantedEntities.filter((n) => !entityId.has(n.trim()));
    if (missing.length) {
      // entity_type is deliberately NOT set: the column defaults to 'יחיד' and
      // its CHECK constraint accepts only Hebrew values. Naming it here once
      // shipped 'individual', which the database rejected and which took the
      // whole import down — a value the column can supply itself is a value
      // that can never drift away from the constraint.
      const rowsToAdd = missing.map((name) => ({ id: newId(), name }));
      await inChunks(rowsToAdd, (b) => db.from('owner_entities').insert(b), 'ישויות');
      for (const r of rowsToAdd) entityId.set(r.name.trim(), r.id);
      newEntities = rowsToAdd.length;
    }
  }

  if (wantedBuildings.length) {
    const { data } = await db.from('buildings').select('id, name');
    for (const b of data ?? []) buildingId.set(b.name.trim(), b.id);
    const missing = wantedBuildings.filter((n) => !buildingId.has(n.trim()));
    if (missing.length) {
      const rowsToAdd = missing.map((name) => {
        const source = toCreate.find((r) => buildingOf(r) === name);
        return {
          id: newId(),
          name,
          city: source?.property.city ?? null,
          address: source?.property.address ?? null,
          entity_id: source?.property.entityName
            ? entityId.get(source.property.entityName.trim()) ?? null
            : chosenNewEntity ? entityId.get(chosenNewEntity) ?? null : chosenEntityId,
        };
      });
      await inChunks(rowsToAdd, (b) => db.from('buildings').insert(b), 'בניינים');
      for (const r of rowsToAdd) buildingId.set(r.name.trim(), r.id);
      newBuildings = rowsToAdd.length;
    }
  }

  /* ---- tenants ---------------------------------------------------------- */
  say('מכין שוכרים…');
  const { data: existingTenants } = await db.from('tenants').select('id, full_name, phone');
  const tenantByPhone = new Map<string, string>();
  const tenantByName = new Map<string, string>();
  for (const t of existingTenants ?? []) {
    if (t.phone) tenantByPhone.set(t.phone, t.id);
    tenantByName.set(t.full_name.trim(), t.id);
  }

  const tenantRows: { id: string; full_name: string; phone: string | null; email: string | null; import_batch_id: string }[] = [];
  const tenantIdForRow = new Map<number, string>();

  for (const r of toCreate) {
    if (!r.tenant) continue;
    // A phone identifies a person; a name alone does not, but it is the best we
    // have when no phone was given.
    const byPhone = r.tenant.phone ? tenantByPhone.get(r.tenant.phone) : undefined;
    const byName = byPhone ? undefined : tenantByName.get(r.tenant.full_name.trim());
    const found = byPhone ?? byName;
    if (found) { tenantIdForRow.set(r.index, found); continue; }

    const id = newId();
    tenantRows.push({
      id,
      full_name: r.tenant.full_name,
      phone: r.tenant.phone,
      email: r.tenant.email,
      import_batch_id: batchId,
    });
    tenantIdForRow.set(r.index, id);
    if (r.tenant.phone) tenantByPhone.set(r.tenant.phone, id);
    tenantByName.set(r.tenant.full_name.trim(), id);
  }
  if (tenantRows.length) await inChunks(tenantRows, (b) => db.from('tenants').insert(b), 'שוכרים');

  /* ---- properties ------------------------------------------------------- */
  say(`שומר ${toCreate.length} נכסים…`);
  const propertyIdForRow = new Map<number, string>();
  const propertyRows = toCreate.map((r) => {
    const id = newId();
    propertyIdForRow.set(r.index, id);
    const p = r.property;
    return {
      id,
      name: p.name,
      address: p.address,
      city: p.city,
      property_type: p.property_type,
      status: p.status,
      rooms: p.rooms,
      area_sqm: p.area_sqm,
      floor_no: p.floor_no,
      asking_rent: p.asking_rent,
      purchase_price: p.purchase_price,
      purchase_date: p.purchase_date,
      current_value: p.current_value,
      insurance_expires_on: p.insurance_expires_on,
      insurer: p.insurer,
      notes: p.notes,
      // A per-row entity from the file wins; otherwise the one chosen for the
      // whole import; otherwise none, which is a perfectly good answer.
      entity_id: p.entityName
        ? entityId.get(p.entityName.trim()) ?? null
        : chosenNewEntity ? entityId.get(chosenNewEntity) ?? null : chosenEntityId,
      building_id: (() => {
        const b = buildingOf(r);
        return b ? buildingId.get(b.trim()) ?? null : null;
      })(),
      import_batch_id: batchId,
    };
  });
  if (propertyRows.length) await inChunks(propertyRows, (b) => db.from('properties').insert(b), 'נכסים');

  /* ---- leases and their payment schedules ------------------------------- */
  say('יוצר חוזים ולוחות תשלומים…');
  const leaseRows: TablesInsert<'leases'>[] = [];
  const paymentRows: TablesInsert<'lease_payments'>[] = [];

  for (const r of toCreate) {
    if (!r.lease) continue;
    const propertyId = propertyIdForRow.get(r.index);
    const tenantId = tenantIdForRow.get(r.index);
    if (!propertyId || !tenantId) continue;

    const leaseId = newId();
    // A lease whose term has already run out is imported as history, not as a
    // live contract that would sit at the top of "דורש טיפול" forever. The same
    // helper decided the PROPERTY's status in the plan, so the two agree.
    const ended = leaseHasEnded(r.lease.end_date);
    leaseRows.push({
      id: leaseId,
      property_id: propertyId,
      tenant_id: tenantId,
      start_date: r.lease.start_date,
      end_date: r.lease.end_date,
      monthly_rent: r.lease.monthly_rent,
      payment_day: r.lease.payment_day,
      deposit: r.lease.deposit,
      deposit_received: false,
      linked_to_cpi: r.lease.linked_to_cpi,
      status: ended ? 'ended' : 'active',
      import_batch_id: batchId,
    });
    for (const s of scheduleFor(r.lease, opts.markPastPaid)) {
      paymentRows.push({
        lease_id: leaseId,
        due_date: s.due_date,
        amount: s.amount,
        paid: s.paid,
        paid_date: s.paid ? s.due_date : null,
      });
    }
  }
  if (leaseRows.length) await inChunks(leaseRows, (b) => db.from('leases').insert(b), 'חוזים');
  if (paymentRows.length) await inChunks(paymentRows, (b) => db.from('lease_payments').insert(b), 'תשלומים');

  /* ---- merges: fill the blanks on a property that already exists --------- */
  let merged = 0;
  if (toMerge.length) {
    say('משלים פרטים בנכסים קיימים…');
    const ids = toMerge.map((r) => r.duplicateOf!.id);
    const { data: current } = await db
      .from('properties')
      .select('id, rooms, area_sqm, floor_no, asking_rent, purchase_price, purchase_date, current_value, insurance_expires_on, insurer, notes')
      .in('id', ids);
    const byId = new Map((current ?? []).map((p) => [p.id, p]));

    for (const r of toMerge) {
      const existing = byId.get(r.duplicateOf!.id);
      if (!existing) continue;
      const patch: TablesUpdate<'properties'> = {};
      // Only ever fill a blank. Overwriting a value the user already has is a
      // different, destructive operation and this is not it.
      const fill = <K extends keyof typeof existing & keyof TablesUpdate<'properties'>>(
        key: K, value: TablesUpdate<'properties'>[K],
      ) => {
        if (value != null && value !== '' && existing[key] == null) patch[key] = value;
      };
      fill('rooms', r.property.rooms);
      fill('area_sqm', r.property.area_sqm);
      fill('floor_no', r.property.floor_no);
      fill('asking_rent', r.property.asking_rent);
      fill('purchase_price', r.property.purchase_price);
      fill('purchase_date', r.property.purchase_date);
      fill('current_value', r.property.current_value);
      fill('insurance_expires_on', r.property.insurance_expires_on);
      fill('insurer', r.property.insurer);
      fill('notes', r.property.notes);
      if (Object.keys(patch).length) {
        const { error } = await db.from('properties').update(patch).eq('id', r.duplicateOf!.id);
        if (error) throw new Error(`עדכון נכס קיים נכשל: ${error.message}`);
        merged++;
      }
    }
  }

  const result: WriteResult = {
    batchId,
    properties: propertyRows.length,
    tenants: tenantRows.length,
    leases: leaseRows.length,
    payments: paymentRows.length,
    entities: newEntities,
    buildings: newBuildings,
    merged,
    skipped,
  };

  // `counts` is a jsonb column, so the shape is ours to define; the cast is the
  // only honest way to say "this object IS the json we are storing".
  await db.from('import_batches')
    .update({ counts: result as unknown as Database['public']['Tables']['import_batches']['Row']['counts'] })
    .eq('id', batchId);
  return result;
}

/**
 * Undo. Properties and tenants cascade to leases, and leases cascade to their
 * payment schedules, so three deletes remove everything the batch created.
 *
 * Entities and buildings the batch created are deliberately LEFT: they are
 * shared objects that other properties may already point at, and the undo
 * dialog says so rather than quietly taking them too.
 */
export async function undoImport(db: DB, batchId: string): Promise<void> {
  const p = await db.from('properties').delete().eq('import_batch_id', batchId);
  if (p.error) throw new Error(`ביטול הייבוא נכשל: ${p.error.message}`);
  const t = await db.from('tenants').delete().eq('import_batch_id', batchId);
  if (t.error) throw new Error(`ביטול הייבוא נכשל: ${t.error.message}`);
  const b = await db.from('import_batches').update({ undone_at: new Date().toISOString() }).eq('id', batchId);
  if (b.error) throw new Error(`ביטול הייבוא נכשל: ${b.error.message}`);
}
