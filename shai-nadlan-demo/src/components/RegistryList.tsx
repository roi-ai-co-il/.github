'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ILS } from '@/lib/format';
import { Group, Rows, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/ConfirmDialog';

export interface RegistryRow {
  id: string;
  name: string;
  sub: string | null;      // entity type, or a building's city
  count: number;           // properties attached
  value: number;           // their combined current value
}

/** One screen shape for both ישויות and אתרים: a named list, an always-visible
 *  add line, and — because both exist only to group properties — how many
 *  properties each one holds and what they are worth.
 *
 *  Deleting never takes properties with it: both foreign keys are
 *  ON DELETE SET NULL, so a property simply stops being grouped. */
/* The icon is chosen HERE, not passed in. A lucide icon is a function, and a
   Server Component may not hand a function to a Client Component — doing so
   threw "Functions cannot be passed directly to Client Components" and took
   both /אתרים and /ישויות down with a 500 the moment either had a row to show.
   Keeping the choice inside the client component makes that impossible. */
const ICON = { buildings: Building, owner_entities: Users } as const;

export default function RegistryList({
  title, hint, table, rows: initial, placeholder, subPlaceholder, subLabel,
}: {
  title: string;
  hint: string;
  table: 'owner_entities' | 'buildings';
  rows: RegistryRow[];
  placeholder: string;
  subPlaceholder: string;
  subLabel: string;
}) {
  const Icon = ICON[table];
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [rows, setRows] = useState(initial);
  const [name, setName] = useState('');
  const [sub, setSub] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RegistryRow | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    setError(null);
    /* Split per table rather than one union payload: the generated types are
       per-table, and a union insert cannot be narrowed to either of them. */
    const { data, error: insErr } = table === 'buildings'
      ? await supabase.from('buildings')
          .insert({ name: n, city: sub.trim() || null }).select('id, name').single()
      : await supabase.from('owner_entities')
          .insert({ name: n, entity_type: sub.trim() || 'יחיד' }).select('id, name').single();
    setSaving(false);
    if (insErr || !data) { setError('השמירה נכשלה — נסה שוב'); return; }
    setRows((prev) => [{ id: data.id, name: data.name, sub: sub.trim() || null, count: 0, value: 0 }, ...prev]);
    setName(''); setSub('');
    toast('נוסף');
    router.refresh();
  }

  async function reallyDelete(r: RegistryRow) {
    setPendingDelete(null);
    setBusyId(r.id);
    const { error: dErr } = await supabase.from(table).delete().eq('id', r.id);
    setBusyId(null);
    if (dErr) { setError('המחיקה נכשלה'); return; }
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    toast('נמחק');
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">{title}</h1>
        <p className="text-[13px] text-label-tertiary mt-0.5">{hint}</p>
      </div>

      <form onSubmit={add} className="bg-surface rounded-2xl border border-separator p-3 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="flex-[2] min-w-[170px] bg-surface-sunken rounded-xl px-3.5 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30"
        />
        <input
          value={sub}
          onChange={(e) => setSub(e.target.value)}
          placeholder={subPlaceholder}
          aria-label={subLabel}
          className="flex-1 min-w-[140px] bg-surface-sunken rounded-xl px-3.5 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="press flex items-center gap-1.5 rounded-xl bg-accent text-white px-4 py-2.5 text-[15px] font-semibold disabled:opacity-40"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.5} />}
          <span>הוספה</span>
        </button>
      </form>
      {error && <p className="text-[13px] text-danger font-medium px-1">{error}</p>}

      {rows.length === 0 ? (
        <Group title={title}><EmptyState icon={Icon} text={hint} /></Group>
      ) : (
        <Group title={title}>
          <Rows>
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/properties?${table === 'buildings' ? 'building' : 'entity'}=${r.id}`}
                  className="press-row flex-1 min-w-0 -m-1 p-1 rounded-lg">
                  <p className="font-semibold text-[15px] text-label truncate">{r.name}</p>
                  <p className="text-[13px] text-label-secondary truncate mt-0.5">
                    {[r.sub, r.count === 0 ? 'אין נכסים' : r.count === 1 ? 'נכס אחד' : `${r.count} נכסים`]
                      .filter(Boolean).join(' · ')}
                  </p>
                </Link>
                {r.value > 0 && (
                  <span className="text-[15px] font-semibold text-label tabular-nums shrink-0">{ILS(r.value)}</span>
                )}
                <button
                  type="button"
                  onClick={() => setPendingDelete(r)}
                  disabled={busyId === r.id}
                  aria-label={`מחק את ${r.name}`}
                  className="press touch-target shrink-0 rounded-full text-label-tertiary hover:text-danger"
                >
                  {busyId === r.id ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} strokeWidth={2} />}
                </button>
              </div>
            ))}
          </Rows>
        </Group>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="למחוק?"
        message={pendingDelete
          ? `"${pendingDelete.name}" יימחק.${pendingDelete.count > 0 ? ` ${pendingDelete.count} נכסים פשוט יפסיקו להיות משויכים — הם לא יימחקו.` : ''}`
          : undefined}
        confirmLabel="מחק"
        danger
        onConfirm={() => pendingDelete && reallyDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
