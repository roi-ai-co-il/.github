'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Wrench, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Group, Rows, EmptyState } from '@/components/ui';
import ContactButtons from '@/components/ContactButtons';
import { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/ConfirmDialog';

export interface VendorRow {
  id: string;
  name: string;
  trade: string;
  phone: string | null;
  notes: string | null;
}

/** Suggestions, not a closed list: the column has no CHECK constraint, so a
 *  trade nobody thought of can still be typed in. */
const TRADES = ['אינסטלטור', 'חשמלאי', 'מזגנים', 'צבע', 'ניקיון', 'מנעולן', 'שיפוצניק', 'גנן', 'אחר'];

export default function VendorsList({ vendors: initial }: { vendors: VendorRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [vendors, setVendors] = useState(initial);
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('');
  const [phone, setPhone] = useState('');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VendorRow | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return vendors;
    return vendors.filter((v) =>
      `${v.name} ${v.trade} ${v.phone ?? ''}`.toLowerCase().includes(needle));
  }, [vendors, q]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    setError(null);
    const { data, error: insErr } = await supabase
      .from('vendors')
      .insert({ name: n, trade: trade.trim() || 'אחר', phone: phone.trim() || null })
      .select('id, name, trade, phone, notes')
      .single();
    setSaving(false);
    if (insErr || !data) { setError('השמירה נכשלה — נסה שוב'); return; }
    setVendors((prev) => [data as VendorRow, ...prev]);
    setName(''); setTrade(''); setPhone('');
    toast('נוסף');
    router.refresh();
  }

  async function reallyDelete(v: VendorRow) {
    setPendingDelete(null);
    setBusyId(v.id);
    const { error: dErr } = await supabase.from('vendors').delete().eq('id', v.id);
    setBusyId(null);
    if (dErr) { setError('המחיקה נכשלה'); return; }
    setVendors((prev) => prev.filter((x) => x.id !== v.id));
    toast('נמחק');
    router.refresh();
  }

  const input =
    'bg-surface-sunken rounded-xl px-3.5 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">בעלי מקצוע</h1>
        <p className="text-[13px] text-label-tertiary mt-0.5">
          {vendors.length === 0
            ? 'הטלפונים שאתה מחפש כשמשהו מתקלקל'
            : `${vendors.length} אנשי קשר · וואטסאפ או חיוג בלחיצה`}
        </p>
      </div>

      <form onSubmit={add} className="bg-surface rounded-2xl border border-separator p-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם"
            aria-label="שם" className={`${input} flex-[2] min-w-[150px]`} />
          <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="מקצוע"
            aria-label="מקצוע" list="trades" className={`${input} flex-1 min-w-[130px]`} />
          <datalist id="trades">{TRADES.map((t) => <option key={t} value={t} />)}</datalist>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון"
            aria-label="טלפון" inputMode="tel" dir="ltr" className={`${input} flex-1 min-w-[130px] text-start`} />
          <button type="submit" disabled={saving || !name.trim()}
            className="press flex items-center gap-1.5 rounded-xl bg-accent text-white px-4 py-2.5 text-[15px] font-semibold disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.5} />}
            <span>הוספה</span>
          </button>
        </div>
        {error && <p className="text-[13px] text-danger font-medium px-1">{error}</p>}
      </form>

      {vendors.length > 4 && (
        <div className="relative">
          <Search size={17} className="absolute top-1/2 -translate-y-1/2 start-3.5 text-label-tertiary pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או מקצוע"
            aria-label="חיפוש בעלי מקצוע"
            className="w-full bg-surface rounded-2xl border border-separator ps-10 pe-3.5 py-3 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30" />
        </div>
      )}

      <Group title="אנשי קשר">
        {shown.length === 0 ? (
          <EmptyState icon={vendors.length === 0 ? Wrench : Search}
            text={vendors.length === 0
              ? 'עוד אין אף אחד — הוסף את האינסטלטור שאתה תמיד מחפש'
              : 'אין מי שמתאים לחיפוש'} />
        ) : (
          <Rows>
            {shown.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-label truncate">{v.name}</p>
                  <p className="text-[13px] text-label-secondary truncate mt-0.5">
                    {[v.trade, v.phone].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {v.phone && <ContactButtons phone={v.phone} name={v.name} compact />}
                <button type="button" onClick={() => setPendingDelete(v)} disabled={busyId === v.id}
                  aria-label={`מחק את ${v.name}`}
                  className="press touch-target shrink-0 rounded-full text-label-tertiary hover:text-danger">
                  {busyId === v.id ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} strokeWidth={2} />}
                </button>
              </div>
            ))}
          </Rows>
        )}
      </Group>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="למחוק?"
        message={pendingDelete ? `"${pendingDelete.name}" יימחק מרשימת בעלי המקצוע.` : undefined}
        confirmLabel="מחק"
        danger
        onConfirm={() => pendingDelete && reallyDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
