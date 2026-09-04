'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check, Loader2, Plus, Trash2, Wrench, Search, Circle, CircleCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { heDate, ILS } from '@/lib/format';
import {
  CHARGE_MODES, TRADES, ILSorDash, money, isOpen, isSplit, whoPaid, totals,
  type ChargeMode, type RepairRow,
} from '@/lib/repairs';
import { Group, Rows, EmptyState, StatCard } from '@/components/ui';
import { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/ConfirmDialog';

type Option = { id: string; name: string };
type VendorOption = { id: string; name: string; trade: string | null };

function isoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const SELECT =
  'id, property_id, vendor_id, title, trade, reported_on, done_on, cost, ' +
  'charge_mode, tenant_share, tenant_charge, owner_cost, notes, ' +
  'property:properties(id, name), vendor:vendors(id, name, trade)';

export default function RepairsList({
  repairs: initial, properties, vendors,
  heading = 'תיקונים',
  sub,
  lockedPropertyId,
}: {
  repairs: RepairRow[];
  properties: Option[];
  vendors: VendorOption[];
  heading?: string;
  sub?: string;
  /** On a property's own screen the property is not a choice. */
  lockedPropertyId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [rows, setRows] = useState(initial);
  const [title, setTitle] = useState('');
  const [propertyId, setPropertyId] = useState(lockedPropertyId ?? '');
  const [vendorId, setVendorId] = useState('');
  const [trade, setTrade] = useState('');
  const [cost, setCost] = useState('');
  const [mode, setMode] = useState<ChargeMode>('owner');
  const [share, setShare] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RepairRow | null>(null);

  const sums = useMemo(() => totals(rows), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.title} ${r.trade ?? ''} ${r.property?.name ?? ''} ${r.vendor?.name ?? ''}`
        .includes(needle));
  }, [rows, q]);

  const open = shown.filter(isOpen);
  const done = shown.filter((r) => !isOpen(r));

  /* The invoice decides what choices are even meaningful. You cannot charge a
     tenant an amount nobody knows yet, and the database refuses it — so the
     form refuses it too, rather than letting the save fail with a message
     nobody can act on. */
  const costNum = money(cost.trim() === '' ? null : cost.trim());
  const costKnown = costNum != null;
  const shareNum = money(share.trim() === '' ? null : share.trim());
  const shareValid =
    mode !== 'split' || (shareNum != null && shareNum >= 0 && (!costKnown || shareNum <= costNum));
  const canSave = title.trim() !== '' && propertyId !== ''
    && (mode !== 'tenant' || costKnown) && shareValid;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const chosenVendor = vendors.find((v) => v.id === vendorId);
    const { data, error: insErr } = await supabase
      .from('repairs')
      .insert({
        title: title.trim(),
        property_id: propertyId,
        vendor_id: vendorId || null,
        // The trade typed on the form wins; the vendor's own trade is only a
        // starting point, because a שיפוצניק can perfectly well fix a tap.
        trade: trade.trim() || chosenVendor?.trade || null,
        cost: costKnown ? costNum : null,
        charge_mode: mode,
        tenant_share: mode === 'split' ? shareNum : null,
        reported_on: isoToday(),
      })
      .select(SELECT)
      .single();

    setSaving(false);
    if (insErr || !data) {
      setError('שמירת התיקון נכשלה — נסה שוב');
      return;
    }
    setRows((prev) => [data as unknown as RepairRow, ...prev]);
    setTitle(''); setVendorId(''); setTrade(''); setCost(''); setShare('');
    setMode('owner');
    if (!lockedPropertyId) setPropertyId('');
    toast('התיקון נרשם');
    router.refresh();
  }

  async function toggleDone(r: RepairRow) {
    const next = isOpen(r) ? isoToday() : null;
    setBusyId(r.id);
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, done_on: next } : x)));
    const { error: uErr } = await supabase
      .from('repairs').update({ done_on: next }).eq('id', r.id);
    setBusyId(null);
    if (uErr) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, done_on: r.done_on } : x)));
      setError('העדכון נכשל');
      return;
    }
    router.refresh();
  }

  async function reallyDelete(r: RepairRow) {
    setPendingDelete(null);
    setBusyId(r.id);
    const { error: dErr } = await supabase.from('repairs').delete().eq('id', r.id);
    setBusyId(null);
    if (dErr) { setError('המחיקה נכשלה'); return; }
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    toast('התיקון נמחק');
    router.refresh();
  }

  const input =
    'bg-surface-sunken rounded-xl px-3.5 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30';

  const row = (r: RepairRow) => (
    <div key={r.id} className="flex items-start gap-3 px-4 py-3">
      <button
        type="button"
        onClick={() => toggleDone(r)}
        disabled={busyId === r.id}
        aria-label={isOpen(r) ? `סמן שהתיקון "${r.title}" טופל` : `החזר את "${r.title}" לפתוחים`}
        className="press touch-target shrink-0 mt-0.5 text-label-tertiary"
      >
        {busyId === r.id
          ? <Loader2 size={20} className="animate-spin" />
          : isOpen(r)
            ? <Circle size={20} />
            : <CircleCheck size={20} className="text-success" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-[15px] font-semibold truncate ${isOpen(r) ? 'text-label' : 'text-label-tertiary line-through'}`}>
          {r.title}
        </p>
        <p className="text-[13px] text-label-tertiary truncate">
          {[
            r.trade,
            r.vendor ? r.vendor.name : null,
            r.property ? r.property.name : null,
            heDate(r.reported_on),
          ].filter(Boolean).join(' · ')}
        </p>
        <p className="text-[13px] mt-0.5">
          <span className="text-label-secondary font-medium">{ILSorDash(r.cost)}</span>
          <span className="text-label-tertiary"> · {whoPaid(r)}</span>
          {isSplit(r) && money(r.owner_cost) != null && (
            <span className="text-label-tertiary"> · מהרווח {ILS(money(r.owner_cost)!)}</span>
          )}
          {money(r.cost) == null && (
            <span className="text-warning"> · טרם התקבלה חשבונית</span>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPendingDelete(r)}
        disabled={busyId === r.id}
        aria-label={`מחיקת ${r.title}`}
        className="press touch-target shrink-0 rounded-full text-label-tertiary hover:text-danger"
      >
        <Trash2 size={17} />
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">{heading}</h1>
        <p className="text-[13px] text-label-tertiary mt-0.5">
          {sub ?? (rows.length === 0
            ? 'חשמלאי, אינסטלטור, נזילה — ומי בסוף שילם על זה'
            : `${rows.length} תיקונים · ${sums.open} פתוחים`)}
        </p>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            title="ירד מהרווח" value={ILS(sums.fromProfit)}
            sub={sums.unknown ? `${sums.unknown} ללא חשבונית עדיין` : undefined}
            icon={Wrench} tone="danger"
          />
          <StatCard
            title="נגבה מהדיירים" value={ILS(sums.fromTenants)}
            sub={sums.recharged
              ? `${sums.recharged} מתוך ${rows.length} הושתו על הדייר`
              : 'עוד לא הושת דבר על דייר'}
            icon={Check} tone="success"
          />
        </div>
      )}

      <form onSubmit={add} className="bg-surface rounded-2xl border border-separator p-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="מה קרה? למשל: נזילה בדוד"
            aria-label="מה קרה" className={`${input} flex-[2] min-w-[190px]`} />

          {!lockedPropertyId && (
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
              aria-label="באיזה נכס" className={`${input} flex-1 min-w-[150px]`}>
              <option value="">באיזה נכס…</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <select value={vendorId}
            onChange={(e) => {
              setVendorId(e.target.value);
              const v = vendors.find((x) => x.id === e.target.value);
              if (v?.trade && !trade.trim()) setTrade(v.trade);
            }}
            aria-label="מי ביצע" className={`${input} flex-1 min-w-[150px]`}>
            <option value="">מי ביצע…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}{v.trade ? ` · ${v.trade}` : ''}</option>
            ))}
          </select>

          <input value={trade} onChange={(e) => setTrade(e.target.value)}
            placeholder="סוג עבודה" aria-label="סוג עבודה" list="repair-trades"
            className={`${input} flex-1 min-w-[130px]`} />
          <datalist id="repair-trades">{TRADES.map((t) => <option key={t} value={t} />)}</datalist>

          <input value={cost} onChange={(e) => setCost(e.target.value)}
            placeholder="עלות ₪" aria-label="עלות" inputMode="decimal"
            className={`${input} flex-1 min-w-[110px]`} />
        </div>

        {/* Who pays. This is the only decision the system stores — both amounts
            are computed from it, so they can never contradict each other. */}
        <div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="מי משלם">
            {CHARGE_MODES.map((m) => {
              const blocked = m.value === 'tenant' && !costKnown;
              const on = mode === m.value;
              return (
                <button
                  key={m.value} type="button" role="radio" aria-checked={on}
                  disabled={blocked}
                  title={blocked ? 'צריך להזין עלות כדי לגבות מהדייר' : m.hint}
                  onClick={() => setMode(m.value)}
                  className={`chip-target press rounded-full px-3.5 py-2 text-[14px] font-semibold border transition-colors disabled:opacity-40 ${
                    on
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface-sunken text-label-secondary border-transparent'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
            {mode === 'split' && (
              <input value={share} onChange={(e) => setShare(e.target.value)}
                placeholder="כמה מהדייר ₪" aria-label="חלק הדייר" inputMode="decimal"
                className={`${input} min-w-[150px]`} />
            )}
          </div>
          <p className="text-[12px] text-label-tertiary mt-1.5 px-1">
            {mode === 'owner' && 'הסכום המלא יירד מהרווח.'}
            {mode === 'tenant' && (costKnown
              ? 'הסכום המלא ייגבה מהדייר — הרווח לא נפגע.'
              : 'כדי לגבות מהדייר צריך לדעת כמה זה עלה.')}
            {mode === 'split' && (shareValid && shareNum != null && costKnown
              ? `${ILS(shareNum)} מהדייר, ${ILS(costNum - shareNum)} מהרווח.`
              : 'כמה מזה משלם הדייר, והשאר יורד מהרווח.')}
          </p>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving || !canSave}
            className="press flex items-center gap-1.5 rounded-xl bg-accent text-white px-4 py-2.5 text-[15px] font-semibold disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.5} />}
            <span>רישום תיקון</span>
          </button>
        </div>
        {error && <p className="text-[13px] text-danger font-medium px-1">{error}</p>}
      </form>

      {rows.length > 5 && (
        <div className="relative">
          <Search size={17} className="absolute top-1/2 -translate-y-1/2 start-3.5 text-label-tertiary pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי תקלה, נכס או בעל מקצוע" aria-label="חיפוש תיקונים"
            className="w-full bg-surface rounded-2xl border border-separator ps-10 pe-3.5 py-3 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30" />
        </div>
      )}

      <Group title="פתוחים">
        {open.length === 0
          ? <EmptyState icon={Wrench}
              text={rows.length === 0
                ? 'אין תיקונים רשומים. כשמשהו מתקלקל — תרשום כאן מי תיקן, כמה זה עלה, ומי שילם.'
                : 'אין תיקונים פתוחים.'} />
          : <Rows>{open.map(row)}</Rows>}
      </Group>

      {done.length > 0 && (
        <Group
          title={`טופלו (${done.length})`}
          action={
            <button type="button" onClick={() => setShowDone((v) => !v)}
              className="press text-[13px] font-semibold text-accent">
              {showDone ? 'הסתרה' : 'הצגה'}
            </button>
          }
        >
          {showDone ? <Rows>{done.map(row)}</Rows> : null}
        </Group>
      )}

      {rows.length > 0 && !lockedPropertyId && (
        <p className="text-[13px] text-label-tertiary px-1">
          בעלי המקצוע נשמרים ב<Link href="/vendors" className="press text-accent font-medium">בעלי מקצוע</Link>,
          וכל תיקון מופיע גם בעמוד הנכס עצמו.
        </p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="למחוק את התיקון?"
        message={pendingDelete ? `"${pendingDelete.title}" יימחק מהרשימה ומעמוד הנכס.` : undefined}
        confirmLabel="מחק"
        danger
        onConfirm={() => pendingDelete && reallyDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
