'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';
import { ILS, heDate } from '@/lib/format';
import { Group, Rows, EmptyState } from '@/components/ui';

export type CalEvent = {
  kind: 'payment' | 'payment_late' | 'lease_end' | 'task';
  date: string;              // ISO yyyy-mm-dd
  title: string;
  sub?: string | null;
  amount?: number | null;
  href?: string | null;
};

const KIND = {
  payment_late: { dot: 'bg-danger',  text: 'text-danger',  label: 'באיחור' },
  payment:      { dot: 'bg-success', text: 'text-success', label: 'תשלום' },
  lease_end:    { dot: 'bg-warning', text: 'text-warning', label: 'סוף חוזה' },
  task:         { dot: 'bg-accent',  text: 'text-accent',  label: 'משימה' },
} as const;

const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const HE_DAYS   = ['א','ב','ג','ד','ה','ו','ש'];

function isoOf(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function PaymentCalendar({ events, todayIso }: { events: CalEvent[]; todayIso: string }) {
  const [y0, m0] = [Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)) - 1];
  const [cursor, setCursor] = useState({ y: y0, m: m0 });
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) (map.get(e.date) ?? map.set(e.date, []).get(e.date)!).push(e);
    return map;
  }, [events]);

  const { y, m } = cursor;
  const firstWeekday = new Date(Date.UTC(y, m, 1)).getUTCDay();   // 0 = Sunday, which is how an Israeli week starts
  const daysInMonth  = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  const monthEvents = useMemo(
    () => events.filter((e) => e.date.slice(0, 7) === `${y}-${String(m + 1).padStart(2, '0')}`)
                .sort((a, b) => a.date.localeCompare(b.date)),
    [events, y, m],
  );

  const monthTotal = monthEvents
    .filter((e) => e.kind === 'payment' || e.kind === 'payment_late')
    .reduce((s, e) => s + (e.amount ?? 0), 0);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m + delta, 1));
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    setSelected(null);
  };

  const listed = selected ? (byDate.get(selected) ?? []) : monthEvents;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">יומן</h1>
        <p className="text-[13px] text-label-tertiary mt-0.5">תשלומים, סופי חוזה ומשימות — על כל הנכסים יחד</p>
      </div>

      <div className="bg-surface rounded-2xl border border-separator overflow-hidden">
        {/* Month header. The chevrons point the way the RTL reader expects:
            right goes back in time, left goes forward. */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-separator">
          <button type="button" onClick={() => shift(-1)} aria-label="חודש קודם"
            className="press touch-target rounded-full text-label-secondary hover:text-accent">
            <ChevronRight size={20} strokeWidth={2.2} />
          </button>
          <div className="text-center">
            <div className="text-[16px] font-semibold text-label">{HE_MONTHS[m]} {y}</div>
            {monthTotal > 0 && (
              <div className="text-[12.5px] text-label-tertiary mt-0.5">{ILS(monthTotal)} בתשלומים</div>
            )}
          </div>
          <button type="button" onClick={() => shift(1)} aria-label="חודש הבא"
            className="press touch-target rounded-full text-label-secondary hover:text-accent">
            <ChevronLeft size={20} strokeWidth={2.2} />
          </button>
        </div>

        {/* The grid. Sunday first, right to left. */}
        <div className="grid grid-cols-7 gap-px bg-separator/60">
          {HE_DAYS.map((d) => (
            <div key={d} className="bg-surface text-center text-[11px] font-medium text-label-tertiary py-1.5">{d}</div>
          ))}
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`pad${i}`} className="bg-surface min-h-[54px]" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const iso = isoOf(y, m, day);
            const dayEvents = byDate.get(iso) ?? [];
            const isToday = iso === todayIso;
            const isSel = iso === selected;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(isSel ? null : iso)}
                aria-label={`${day} ב${HE_MONTHS[m]}${dayEvents.length ? `, ${dayEvents.length} פריטים` : ''}`}
                aria-pressed={isSel}
                className={`bg-surface min-h-[54px] p-1 flex flex-col items-center gap-1 press-row ${
                  isSel ? 'ring-2 ring-inset ring-accent' : ''
                }`}
              >
                <span className={`text-[13px] leading-none mt-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-accent text-white font-bold' : 'text-label'
                }`}>{day}</span>
                <span className="flex flex-wrap gap-0.5 justify-center">
                  {dayEvents.slice(0, 4).map((e, n) => (
                    <span key={n} className={`w-1.5 h-1.5 rounded-full ${KIND[e.kind].dot}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Group
        title={selected ? heDate(selected) : `הכול ב${HE_MONTHS[m]}`}
        action={selected
          ? <button type="button" onClick={() => setSelected(null)} className="press text-[13px] font-semibold text-accent">כל החודש</button>
          : undefined}
      >
        {listed.length === 0 ? (
          <EmptyState icon={CalendarDays} text={selected ? 'אין כלום ביום הזה' : 'אין כלום בחודש הזה'} />
        ) : (
          <Rows>
            {listed.map((e, i) => {
              const k = KIND[e.kind];
              const body = (
                <>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${k.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-label truncate">{e.title}</span>
                    <span className="block text-[13px] text-label-secondary truncate mt-0.5">
                      {[!selected ? heDate(e.date) : null, k.label, e.sub].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {e.amount != null && (
                    <span className={`text-[15px] font-semibold shrink-0 tabular-nums ${k.text}`}>{ILS(e.amount)}</span>
                  )}
                </>
              );
              return e.href ? (
                <Link key={i} href={e.href} className="press-row flex items-center gap-3 px-4 py-3">{body}</Link>
              ) : (
                <div key={i} className="flex items-center gap-3 px-4 py-3">{body}</div>
              );
            })}
          </Rows>
        )}
      </Group>
    </div>
  );
}
