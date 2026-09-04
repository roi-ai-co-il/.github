'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleCheck, Circle, Loader2, CircleDollarSign, Receipt } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ILS, heDate, daysUntil, heDays, waLink } from '@/lib/format';
import { Group, Rows, EmptyState, StatCard } from '@/components/ui';
import { WhatsAppIcon } from '@/components/ContactButtons';
import SwipeActions from '@/components/SwipeActions';
import { useToast } from '@/components/Toast';

export interface DueRow {
  id: string;
  due_date: string;
  amount: number;
  paid: boolean;
  paid_date: string | null;
  propertyId: string | null;
  propertyName: string;
  tenantName: string;
  tenantPhone: string | null;
  hasReceipt: boolean;
}

const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function monthLabel(iso: string): string {
  return `${HE_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** What you send a tenant who is late. Deliberately short and not accusing —
 *  most late rent is a forgotten standing order, not a refusal. */
function reminderText(r: DueRow): string {
  return `היי ${r.tenantName}, תזכורת ידידותית על שכר הדירה של ${r.propertyName} ל${monthLabel(r.due_date)} — ${ILS(r.amount)}. תודה!`;
}

export default function CollectionBoard({ rows: initial, monthIso, todayIso }: {
  rows: DueRow[]; monthIso: string; todayIso: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const late = useMemo(() => rows.filter((r) => !r.paid && r.due_date < todayIso), [rows, todayIso]);
  const thisMonth = useMemo(
    () => rows.filter((r) => r.due_date.slice(0, 7) === monthIso && r.due_date >= todayIso),
    [rows, monthIso, todayIso],
  );
  const paidThisMonth = useMemo(
    () => rows.filter((r) => r.paid && r.due_date.slice(0, 7) === monthIso),
    [rows, monthIso],
  );

  const owed = late.reduce((s, r) => s + r.amount, 0) + thisMonth.reduce((s, r) => s + r.amount, 0);
  const collected = paidThisMonth.reduce((s, r) => s + r.amount, 0);

  async function togglePaid(r: DueRow) {
    setBusyId(r.id);
    setError(null);
    const next = !r.paid;
    // Optimistic: the whole point of this screen is ticking a row and moving on.
    setRows((prev) => prev.map((x) => (x.id === r.id
      ? { ...x, paid: next, paid_date: next ? todayIso : null } : x)));
    const { error: uErr } = await supabase
      .from('lease_payments')
      .update({ paid: next, paid_date: next ? todayIso : null })
      .eq('id', r.id);
    setBusyId(null);
    if (uErr) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)));
      setError('העדכון נכשל — נסה שוב');
      return;
    }
    toast(next ? 'סומן כשולם' : 'הסימון בוטל');
    router.refresh();
  }

  const row = (r: DueRow, tone: 'late' | 'due' | 'paid') => {
    const days = daysUntil(r.due_date);
    const meta = tone === 'late'
      ? { text: `באיחור ${heDays(days)}`, cls: 'text-danger' }
      : tone === 'paid'
        ? { text: r.paid_date ? `שולם ${heDate(r.paid_date)}` : 'שולם', cls: 'text-success' }
        : { text: days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${heDays(days)}`, cls: 'text-label-secondary' };

    const body = (
      <div className="flex items-center gap-3 px-4 py-3 bg-surface">
        <button
          type="button"
          onClick={() => togglePaid(r)}
          disabled={busyId === r.id}
          aria-label={r.paid ? `לבטל סימון תשלום של ${r.propertyName}` : `לסמן כשולם: ${r.propertyName}`}
          className="press shrink-0 touch-target flex items-center justify-center"
        >
          {busyId === r.id
            ? <Loader2 size={21} className="animate-spin text-label-tertiary" />
            : r.paid
              ? <CircleCheck size={21} strokeWidth={2.2} className="text-success" />
              : <Circle size={21} strokeWidth={1.9} className={tone === 'late' ? 'text-danger' : 'text-label-tertiary'} />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-label truncate">
            {r.propertyId
              ? <Link href={`/properties/${r.propertyId}`} className="press">{r.propertyName}</Link>
              : r.propertyName}
          </p>
          <p className="text-[13px] truncate mt-0.5">
            <span className="text-label-secondary">{r.tenantName}</span>
            <span className="text-label-tertiary"> · </span>
            <span className={meta.cls}>{meta.text}</span>
          </p>
        </div>

        <span className={`text-[15px] font-semibold shrink-0 tabular-nums ${
          tone === 'late' ? 'text-danger' : tone === 'paid' ? 'text-success' : 'text-label'
        }`}>{ILS(r.amount)}</span>

        {/* On a wide screen the actions sit on the row; on a phone they live
            under the swipe, so the row itself stays uncluttered. */}
        <span className="hidden md:flex items-center gap-1.5 shrink-0">
          {!r.paid && r.tenantPhone && (
            <a href={`${waLink(r.tenantPhone)}?text=${encodeURIComponent(reminderText(r))}`}
              target="_blank" rel="noreferrer"
              title={`תזכורת ל${r.tenantName}`} aria-label={`תזכורת ל${r.tenantName}`}
              className="press w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center">
              <WhatsAppIcon size={17} />
            </a>
          )}
          {r.paid && (
            <Link href={`/receipt/${r.id}`} title="קבלה" aria-label={`קבלה עבור ${r.propertyName}`}
              className="press w-9 h-9 rounded-full bg-fill text-label-secondary flex items-center justify-center">
              <Receipt size={17} strokeWidth={2} />
            </Link>
          )}
        </span>
      </div>
    );

    return (
      <div key={r.id} className="md:contents">
        <span className="md:hidden">
          <SwipeActions
            actions={
              <>
                {!r.paid && r.tenantPhone && (
                  <a href={`${waLink(r.tenantPhone)}?text=${encodeURIComponent(reminderText(r))}`}
                    target="_blank" rel="noreferrer" aria-label={`תזכורת ל${r.tenantName}`}
                    className="flex-1 flex items-center justify-center bg-[#25D366] text-white">
                    <WhatsAppIcon size={20} />
                  </a>
                )}
                {r.paid && (
                  <Link href={`/receipt/${r.id}`} aria-label={`קבלה עבור ${r.propertyName}`}
                    className="flex-1 flex items-center justify-center bg-accent text-white">
                    <Receipt size={20} strokeWidth={2} />
                  </Link>
                )}
                <button type="button" onClick={() => togglePaid(r)}
                  aria-label={r.paid ? 'ביטול סימון' : 'סמן כשולם'}
                  className="flex-1 flex items-center justify-center bg-success text-white">
                  <CircleCheck size={20} strokeWidth={2.2} />
                </button>
              </>
            }
          >
            {body}
          </SwipeActions>
        </span>
        <span className="hidden md:block">{body}</span>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">גבייה</h1>
        <p className="text-[13px] text-label-tertiary mt-0.5">מי חייב לי, ומה כבר נכנס</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard title="נשאר לגבות" value={owed > 0 ? ILS(owed) : '—'} icon={CircleDollarSign}
          tone={late.length > 0 ? 'danger' : 'accent'}
          sub={late.length > 0 ? `${late.length} באיחור` : 'שום דבר לא באיחור'} />
        <StatCard title={`נגבה ב${monthLabel(monthIso + '-01')}`} value={collected > 0 ? ILS(collected) : '—'}
          icon={CircleCheck} tone="success" sub={`${paidThisMonth.length} תשלומים`} />
      </div>

      {error && <p className="text-[13px] text-danger font-medium px-1">{error}</p>}

      {late.length > 0 && (
        <Group title="באיחור">
          <div className="divide-y divide-separator">{late.map((r) => row(r, 'late'))}</div>
        </Group>
      )}

      <Group title="עוד מגיע החודש">
        {thisMonth.length === 0
          ? <EmptyState icon={CircleCheck} text="אין עוד תשלומים שמגיעים החודש" />
          : <div className="divide-y divide-separator">{thisMonth.map((r) => row(r, 'due'))}</div>}
      </Group>

      {paidThisMonth.length > 0 && (
        <Group title="שולם החודש">
          <div className="divide-y divide-separator">{paidThisMonth.map((r) => row(r, 'paid'))}</div>
        </Group>
      )}

      {rows.length === 0 && (
        <Group><EmptyState icon={CircleDollarSign} text="עוד אין תשלומים — הם נוצרים כשפותחים חוזה שכירות" /></Group>
      )}
    </div>
  );
}
