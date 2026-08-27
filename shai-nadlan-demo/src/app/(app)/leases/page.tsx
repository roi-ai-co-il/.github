import Link from 'next/link';
import { FileText, AlertTriangle, CalendarClock, Phone, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ILS, heDate, daysUntil, waLink } from '@/lib/format';
import { leaseUrgency, URGENCY_STYLE } from '@/lib/domain';
import { SectionCard, EmptyState, GoldDivider } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'חוזים' };

type LeaseRow = {
  id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  linked_to_cpi: boolean;
  notes: string | null;
  property: { id: string; name: string; city: string } | null;
  tenant: { full_name: string; phone: string | null } | null;
};

export default async function LeasesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('leases')
    .select('id, start_date, end_date, monthly_rent, linked_to_cpi, notes, property:properties(id, name, city), tenant:tenants(full_name, phone)')
    .eq('status', 'active')
    .order('end_date', { ascending: true });

  const leases: (LeaseRow & { days: number })[] = (data ?? []).map((l) => ({
    ...l,
    days: daysUntil(l.end_date),
  }));

  const attention = leases.filter((l) => l.days <= 90);
  const rest = leases.filter((l) => l.days > 90);
  const monthlyTotal = leases.reduce((s, l) => s + l.monthly_rent, 0);

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-brand-brown">חוזי שכירות</h1>
        <p className="text-xs md:text-sm text-brand-gray-light mt-1">
          {leases.length} חוזים פעילים · {ILS(monthlyTotal)} הכנסה חודשית
        </p>
      </div>

      <GoldDivider />

      {leases.length === 0 && (
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 shadow-xl shadow-black/[0.03]">
          <EmptyState icon={FileText} text="אין חוזים פעילים עדיין" />
        </div>
      )}

      {attention.length > 0 && (
        <SectionCard title="דורשים טיפול (עד 90 יום)" icon={AlertTriangle}>
          <div className="divide-y divide-gold/8">
            {attention.map((l) => (
              <LeaseItem key={l.id} lease={l} />
            ))}
          </div>
        </SectionCard>
      )}

      {rest.length > 0 && (
        <SectionCard title="חוזים תקינים" icon={CalendarClock}>
          <div className="divide-y divide-gold/8">
            {rest.map((l) => (
              <LeaseItem key={l.id} lease={l} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function LeaseItem({ lease }: { lease: LeaseRow & { days: number } }) {
  const urgency = leaseUrgency(lease.days);
  const style = URGENCY_STYLE[urgency];

  const totalDays = daysUntil(lease.end_date) - daysUntil(lease.start_date);
  const elapsed = -daysUntil(lease.start_date);
  const progress = totalDays > 0 ? Math.min(100, Math.max(0, (elapsed / totalDays) * 100)) : 100;

  return (
    <div className="p-4 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/properties/${lease.property?.id}`}
            className="font-bold text-brand-brown hover:text-gold-deep transition-colors text-sm md:text-base block truncate"
          >
            {lease.property?.name} · {lease.property?.city}
          </Link>
          <p className="text-xs text-brand-gray-light mt-0.5 truncate">
            {lease.tenant?.full_name}
            {lease.linked_to_cpi && <span className="mr-2 text-[10px] font-semibold text-gold-deep bg-gold/10 rounded-full px-2 py-0.5">צמוד מדד</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="font-bold text-gold-deep text-sm whitespace-nowrap">{ILS(lease.monthly_rent)}<span className="text-[10px] font-medium text-brand-gray-light"> / חודש</span></span>
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${style.text} ${style.bg} ${style.border}`}>
            {style.label(lease.days)}
          </span>
        </div>
      </div>

      {/* Term progress */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-brand-gray-light mb-1">
          <span>{heDate(lease.start_date)}</span>
          <span>{heDate(lease.end_date)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-brand-beige/50 overflow-hidden">
          <div
            className={`h-full rounded-full ${urgency === 'ok' ? 'bg-green-500' : urgency === 'soon' ? 'bg-amber-400' : 'bg-red-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-2.5">
        {lease.notes ? (
          <p className="text-[11px] text-brand-gray-light truncate ml-3">{lease.notes}</p>
        ) : <span />}
        {lease.tenant?.phone && (
          <div className="flex items-center gap-0.5 shrink-0">
            <a href={waLink(lease.tenant.phone)} target="_blank" rel="noreferrer" title="וואטסאפ לשוכר"
              className="touch-target rounded-xl hover:bg-gold/10 text-brand-gray-light hover:text-green-600 active:scale-95 transition-all">
              <MessageSquare size={17} />
            </a>
            <a href={`tel:${lease.tenant.phone}`} title="התקשר לשוכר"
              className="touch-target rounded-xl hover:bg-gold/10 text-brand-gray-light hover:text-green-700 active:scale-95 transition-all">
              <Phone size={17} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
