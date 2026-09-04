'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, Trash2, CircleCheck, Circle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { heDate, daysUntil } from '@/lib/format';
import { Group, Rows, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

export interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  done: boolean;
  property_id: string | null;
  property: { id: string; name: string } | null;
}

type PropertyOption = { id: string; name: string };

function isoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** How a due date reads at a glance. Overdue is the only red thing on the
 *  screen, so it cannot be missed among a long list. */
function dueLabel(due: string | null): { text: string; tone: string } | null {
  if (!due) return null;
  const d = daysUntil(due);
  if (d < 0) return { text: `באיחור ${Math.abs(d)} ימים`, tone: 'text-danger' };
  if (d === 0) return { text: 'היום', tone: 'text-warning font-semibold' };
  if (d === 1) return { text: 'מחר', tone: 'text-warning' };
  if (d <= 7) return { text: `בעוד ${d} ימים`, tone: 'text-label-secondary' };
  return { text: heDate(due), tone: 'text-label-tertiary' };
}

export default function TasksList({
  tasks: initial, properties,
}: { tasks: TaskRow[]; properties: PropertyOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [tasks, setTasks] = useState(initial);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    setError(null);
    const { data, error: insErr } = await supabase
      .from('tasks')
      .insert({ title: t, due_date: due || null, property_id: propertyId || null })
      .select('id, title, due_date, done, property_id, property:properties(id, name)')
      .single();
    setSaving(false);
    if (insErr || !data) { setError('שמירת המשימה נכשלה — נסה שוב'); return; }
    setTasks((prev) => [data as unknown as TaskRow, ...prev]);
    setTitle(''); setDue(''); setPropertyId('');
    toast('המשימה נוספה');
    router.refresh();
  }

  async function toggle(t: TaskRow) {
    setBusyId(t.id);
    // Optimistic: a checkbox that waits for the network feels broken.
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    const { error: uErr } = await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id);
    setBusyId(null);
    if (uErr) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
      setError('העדכון נכשל');
      return;
    }
    router.refresh();
  }

  async function remove(t: TaskRow) {
    setBusyId(t.id);
    const { error: dErr } = await supabase.from('tasks').delete().eq('id', t.id);
    setBusyId(null);
    if (dErr) { setError('המחיקה נכשלה'); return; }
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    toast('המשימה נמחקה');
    router.refresh();
  }

  const row = (t: TaskRow) => {
    const due = dueLabel(t.due_date);
    return (
      <div key={t.id} className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => toggle(t)}
          disabled={busyId === t.id}
          aria-label={t.done ? `לבטל סימון: ${t.title}` : `לסמן כבוצע: ${t.title}`}
          className="press shrink-0 touch-target flex items-center justify-center"
        >
          {busyId === t.id
            ? <Loader2 size={21} className="animate-spin text-label-tertiary" />
            : t.done
              ? <CircleCheck size={21} strokeWidth={2.2} className="text-success" />
              : <Circle size={21} strokeWidth={1.9} className="text-label-tertiary" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className={`text-[15px] truncate ${t.done ? 'text-label-tertiary line-through' : 'text-label font-medium'}`}>
            {t.title}
          </p>
          {(t.property || due) && (
            <p className="text-[13px] truncate mt-0.5 flex items-center gap-1.5">
              {t.property && (
                <Link href={`/properties/${t.property.id}`} className="press text-accent">
                  {t.property.name}
                </Link>
              )}
              {t.property && due && <span className="text-label-tertiary">·</span>}
              {due && <span className={t.done ? 'text-label-tertiary' : due.tone}>{due.text}</span>}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => remove(t)}
          disabled={busyId === t.id}
          aria-label={`מחק את ${t.title}`}
          className="press touch-target shrink-0 rounded-full text-label-tertiary hover:text-danger"
        >
          <Trash2 size={17} strokeWidth={2} />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">משימות</h1>
        <p className="text-[13px] text-label-tertiary mt-0.5">
          {open.length === 0 ? 'אין משימות פתוחות' : open.length === 1 ? 'משימה אחת פתוחה' : `${open.length} משימות פתוחות`}
        </p>
      </div>

      {/* Add — one line, always visible, no modal. */}
      <form onSubmit={add} className="bg-surface rounded-2xl border border-separator p-3 space-y-2.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="מה צריך לעשות?"
          aria-label="משימה חדשה"
          className="w-full bg-surface-sunken rounded-xl px-3.5 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="תאריך יעד"
            dir="ltr"
            className="flex-1 min-w-[150px] bg-surface-sunken rounded-xl px-3.5 py-2.5 text-[15px] text-label outline-none focus:ring-2 focus:ring-accent/30"
          />
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            aria-label="נכס"
            className="flex-1 min-w-[150px] bg-surface-sunken rounded-xl px-3.5 py-2.5 text-[15px] text-label outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">ללא נכס</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="press flex items-center gap-1.5 rounded-xl bg-accent text-white px-4 py-2.5 text-[15px] font-semibold disabled:opacity-40"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.5} />}
            <span>הוספה</span>
          </button>
        </div>
        {error && <p className="text-[13px] text-danger font-medium px-1">{error}</p>}
      </form>

      {open.length === 0 ? (
        <Group title="פתוחות">
          <EmptyState icon={Check} text="הכול סגור — אין משימות פתוחות" />
        </Group>
      ) : (
        <Group title="פתוחות"><Rows>{open.map(row)}</Rows></Group>
      )}

      {done.length > 0 && (
        <Group
          title="בוצעו"
          action={
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="press text-[13px] font-semibold text-accent"
            >
              {showDone ? 'הסתרה' : `הצגה (${done.length})`}
            </button>
          }
        >
          {showDone && <Rows>{done.map(row)}</Rows>}
        </Group>
      )}
    </div>
  );
}
