'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CircleDollarSign, Undo2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ILS, heDate } from '@/lib/format';
import { Group } from '@/components/ui';
import { useToast } from '@/components/Toast';

export interface PaymentRow {
  id: string;
  due_date: string;
  amount: number;
  paid: boolean;
  paid_date: string | null;
}

function isoToday(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/**
 * The lease's monthly payments: one tap marks a month as paid (or takes it
 * back). Overdue months float to the top in red, so "מי לא שילם" is visible
 * at a glance without opening anything.
 */
export default function PaymentsCard({ payments: initial }: { payments: PaymentRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [payments, setPayments] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const today = isoToday();

  const paidCount = payments.filter((p) => p.paid).length;
  const overdue = useMemo(() => payments.filter((p) => !p.paid && p.due_date <= today), [payments, today]);

  // Overdue first, then the next unpaid months, then recent paid history.
  const ordered = useMemo(() => {
    const unpaid = payments.filter((p) => !p.paid).sort((a, b) => (a.due_date > b.due_date ? 1 : -1));
    const paid = payments.filter((p) => p.paid).sort((a, b) => (a.due_date < b.due_date ? 1 : -1));
    return [...unpaid, ...paid];
  }, [payments]);
  const visible = showAll ? ordered : ordered.slice(0, 4);

  const toggle = async (row: PaymentRow) => {
    if (busyId) return;
    setBusyId(row.id);
    const supabase = createClient();
    const next = !row.paid;
    const { error } = await supabase
      .from('lease_payments')
      .update(next ? { paid: true, paid_date: today } : { paid: false, paid_date: null })
      .eq('id', row.id);
    if (error) {
      toast('עדכון התשלום נכשל — נסה שוב');
    } else {
      setPayments((prev) => prev.map((p) => (p.id === row.id ? { ...p, paid: next, paid_date: next ? today : null } : p)));
      toast(next ? `סומן כשולם — ${heDate(row.due_date)}` : 'הסימון בוטל');
      router.refresh();
    }
    setBusyId(null);
  };

  if (payments.length === 0) return null;

  return (
    <Group
      title="תשלומים"
      action={
        overdue.length > 0 ? (
          <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold text-danger bg-danger-tint">
            {overdue.length === 1 ? 'תשלום אחד באיחור' : `${overdue.length} תשלומים באיחור`}
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-success">שולמו {paidCount}/{payments.length}</span>
        )
      }
    >
      <div>
        {visible.map((p) => {
          const isOverdue = !p.paid && p.due_date <= today;
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-separator last:border-b-0">
              <CircleDollarSign size={17} strokeWidth={2} className={p.paid ? 'text-success' : isOverdue ? 'text-danger' : 'text-label-tertiary'} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-label">{heDate(p.due_date)}</p>
                <p className={`text-[12px] ${p.paid ? 'text-success' : isOverdue ? 'text-danger font-semibold' : 'text-label-tertiary'}`}>
                  {p.paid ? `שולם · ${heDate(p.paid_date)}` : isOverdue ? 'ממתין לתשלום' : 'עתידי'}
                </p>
              </div>
              <span className="text-[14px] font-semibold text-label whitespace-nowrap">{ILS(p.amount)}</span>
              <button
                onClick={() => toggle(p)}
                disabled={busyId === p.id}
                className={`press shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold disabled:opacity-40 ${
                  p.paid ? 'bg-fill text-label-secondary' : 'bg-success text-white'
                }`}
              >
                {p.paid ? <Undo2 size={13} strokeWidth={2.2} /> : <Check size={13} strokeWidth={2.6} />}
                <span>{p.paid ? 'ביטול' : 'שולם'}</span>
              </button>
            </div>
          );
        })}
        {ordered.length > 4 && (
          <button onClick={() => setShowAll((v) => !v)} className="press-row w-full py-2.5 text-[13px] font-medium text-accent">
            {showAll ? 'פחות' : `כל ${ordered.length} התשלומים`}
          </button>
        )}
      </div>
    </Group>
  );
}
