import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { ILS } from '@/lib/format';
import { StatCard } from '@/components/ui';
import PropertiesGrid from '@/components/PropertiesGrid';
import { Building2, Wallet, TrendingUp, KeyRound } from 'lucide-react';

/* Kept identical to the row PropertiesGrid expects — one shape, so the cards
   inside a site are the same cards as on the portfolio screen. */
export type DetailProperty = Parameters<typeof PropertiesGrid>[0]['properties'][number];

/**
 * One site or one holder, with the properties under it.
 *
 * Both the אתרים and the ישויות list existed only to say how many properties
 * each one holds — and then had nowhere to go. Clicking a name led to the full
 * portfolio, unfiltered, which reads as a broken link rather than a filter. The
 * name now opens this: what the group is worth, what it earns, how much of it
 * is let, and every property in it.
 */
export default function RegistryDetail({
  backHref, backLabel, name, meta, icon: Icon, properties, emptyText,
}: {
  backHref: string;
  backLabel: string;
  name: string;
  /** Address, city, holder — whatever identifies this one. */
  meta: (string | null | undefined)[];
  icon: LucideIcon;
  properties: DetailProperty[];
  emptyText: string;
}) {
  const valued = properties.filter((p) => p.current_value != null);
  const totalValue = valued.length
    ? valued.reduce((s, p) => s + (p.current_value ?? 0), 0)
    : null;
  const monthly = properties.reduce(
    (s, p) => s + (p.leases.find((l) => l.status === 'active')?.monthly_rent ?? 0), 0);
  const rented = properties.filter((p) => p.status === 'rented').length;
  const yieldPct = totalValue && totalValue > 0 ? (monthly * 12 / totalValue) * 100 : null;

  return (
    <div className="space-y-5">
      <div>
        <Link href={backHref} className="press inline-flex items-center gap-0.5 text-[15px] font-medium text-accent -mr-1">
          <ChevronRight size={18} strokeWidth={2.5} />
          <span>{backLabel}</span>
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-11 h-11 rounded-2xl bg-accent-tint text-accent flex items-center justify-center shrink-0">
            <Icon size={21} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold text-label tracking-tight leading-tight truncate">{name}</h1>
            {meta.filter(Boolean).length > 0 && (
              <p className="text-[13px] text-label-tertiary mt-0.5 truncate">
                {meta.filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="נכסים" value={properties.length}
          sub={properties.length ? `${rented} מושכרים` : undefined}
          icon={Building2} tone="accent"
        />
        <StatCard
          title="שווי"
          value={totalValue == null ? '—' : ILS(totalValue)}
          sub={totalValue == null ? 'אין שווי מוזן'
            : valued.length < properties.length ? `לפי ${valued.length} מתוך ${properties.length}` : undefined}
          icon={Wallet} tone="success"
        />
        <StatCard title="הכנסה חודשית" value={ILS(monthly)} icon={KeyRound} tone="info" />
        <StatCard
          title="תשואה ברוטו"
          value={yieldPct == null ? '—' : `${yieldPct.toFixed(1)}%`}
          sub={yieldPct == null ? 'צריך שווי נוכחי' : 'שנתית'}
          icon={TrendingUp} tone="neutral"
        />
      </div>

      {properties.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-separator px-6 py-12 text-center">
          <Icon size={34} className="mx-auto text-label-tertiary mb-2.5" strokeWidth={1.5} />
          <p className="text-label-secondary text-[15px]">{emptyText}</p>
        </div>
      ) : (
        <PropertiesGrid
          properties={properties}
          heading="הנכסים"
          sub={properties.length === 1 ? 'נכס אחד' : `${properties.length} נכסים`}
          showHeaderActions={false}
          groupByBuilding={false}
        />
      )}
    </div>
  );
}
