'use client';

import { useState } from 'react';
import { ILS } from '@/lib/format';

export interface MonthPoint { iso: string; label: string; amount: number }

/**
 * One measure, twelve periods: money actually collected, month by month.
 *
 * One series, so there is no legend — the title names it — and no second
 * y-axis, ever. The bars carry the magnitude; the only direct labels are the
 * best month and the latest one, because a number over every bar turns a
 * shape you can read at a glance back into a table.
 */
export default function IncomeChart({ points }: { points: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(...points.map((p) => p.amount), 0);
  if (max <= 0) return null;

  const best = points.reduce((b, p, i) => (p.amount > points[b].amount ? i : b), 0);
  const last = points.length - 1;
  const total = points.reduce((s, p) => s + p.amount, 0);
  const active = hover ?? null;

  return (
    <section>
      <header className="flex items-end justify-between gap-3 px-1 mb-2">
        <h2 className="text-[15px] font-bold text-label tracking-tight">נגבה ב־12 החודשים האחרונים</h2>
        <span className="text-[13px] text-label-tertiary tabular-nums">{ILS(total)}</span>
      </header>

      <div className="bg-surface rounded-2xl border border-separator p-4 pt-5">
        {/* A fixed-height plot with the bars as flex children: no viewBox maths
            to drift, and it reflows on a phone without redrawing anything. */}
        <div className="flex items-end gap-[3px] h-[132px]" role="img"
          aria-label={`גבייה חודשית, ${points.length} חודשים אחרונים, סך ${ILS(total)}`}>
          {points.map((p, i) => {
            const h = max > 0 ? Math.max(2, Math.round((p.amount / max) * 100)) : 2;
            const on = active === i;
            const labelled = i === best || i === last;
            return (
              <div
                key={p.iso}
                className="flex-1 min-w-0 h-full flex flex-col justify-end items-center relative"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((v) => (v === i ? null : v))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((v) => (v === i ? null : v))}
                tabIndex={0}
                aria-label={`${p.label}: ${ILS(p.amount)}`}
              >
                {(on || labelled) && p.amount > 0 && (
                  <span className={`absolute -top-0.5 text-[10.5px] font-semibold tabular-nums whitespace-nowrap ${
                    on ? 'text-label' : 'text-label-tertiary'
                  }`}>
                    {Math.round(p.amount / 1000)}K
                  </span>
                )}
                <span
                  /* 4px rounded top, square foot: the bar is anchored to the
                     baseline, so only the data end is rounded. */
                  className={`w-full rounded-t-[4px] transition-colors ${
                    on ? 'bg-success' : p.amount > 0 ? 'bg-success/55' : 'bg-fill'
                  }`}
                  style={{ height: `${h}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* The axis is recessive and labelled sparsely — every third month,
            which is enough to locate a bar without a wall of text. */}
        <div className="flex gap-[3px] mt-1.5 border-t border-separator pt-1.5">
          {points.map((p, i) => (
            <span key={p.iso} className={`flex-1 min-w-0 text-center text-[10px] tabular-nums ${
              active === i ? 'text-label font-semibold' : 'text-label-tertiary'
            }`}>
              {active === i || i % 3 === 0 ? p.label : ' '}
            </span>
          ))}
        </div>

        {active !== null && (
          <p className="text-[13px] text-label-secondary mt-2.5 text-center">
            <span className="font-semibold text-label">{points[active].label}</span>
            <span className="text-label-tertiary"> · </span>
            <span className="tabular-nums">{ILS(points[active].amount)}</span>
          </p>
        )}
      </div>
    </section>
  );
}
