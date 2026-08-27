import Link from 'next/link';
import {
  Building2, Wallet, TrendingUp, Landmark, KeyRound,
  CalendarClock, FileText, ChevronLeft, Phone, MessageSquare,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ILS, heDateLong, heDate, daysUntil, waLink } from '@/lib/format';
import { leaseUrgency, URGENCY_STYLE } from '@/lib/domain';
import { StatCard, SectionCard, GoldDivider, EmptyState } from '@/components/ui';
import { SparkBar } from '@/components/SparkBar';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: properties }, { data: leases }] = await Promise.all([
    supabase.from('properties').select('id, name, city, status, current_value, property_type'),
    supabase
      .from('leases')
      .select('id, start_date, end_date, monthly_rent, property:properties(id, name, city), tenant:tenants(full_name, phone)')
      .eq('status', 'active')
      .order('end_date', { ascending: true }),
  ]);

  const props = properties ?? [];
  const activeLeases = leases ?? [];

  const totalValue = props.reduce((s, p) => s + (p.current_value ?? 0), 0);
  const monthlyIncome = activeLeases.reduce((s, l) => s + l.monthly_rent, 0);
  const rented = props.filter((p) => p.status === 'rented').length;
  const vacant = props.filter((p) => p.status === 'vacant').length;
  const renovation = props.filter((p) => p.status === 'renovation').length;
  const forSale = props.filter((p) => p.status === 'for_sale').length;
  const grossYield = totalValue > 0 ? ((monthlyIncome * 12) / totalValue) * 100 : 0;

  const expiring = activeLeases
    .map((l) => ({ ...l, days: daysUntil(l.end_date) }))
    .filter((l) => l.days <= 90);

  return (
    <div className="space-y-6 md:space-y-7">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-brand-brown">שלום, שי 👋</h1>
          <p className="text-xs md:text-sm text-brand-gray-light mt-1">{heDateLong(new Date())}</p>
        </div>
        <Link
          href="/properties"
          className="flex items-center gap-1.5 px-4 md:px-5 py-2.5 bg-gold hover:bg-gold-deep text-ink font-semibold text-xs md:text-sm rounded-xl transition-all duration-300 shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30 shrink-0"
        >
          <Building2 size={15} />
          <span>כל הנכסים</span>
        </Link>
      </div>

      <GoldDivider />

      {/* ── Contract expiry alerts ───────────────────────── */}
      {expiring.length > 0 && (
        <SectionCard
          title="חוזים שדורשים טיפול"
          icon={CalendarClock}
          action={
            <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
              {expiring.length}
            </span>
          }
        >
          <div className="divide-y divide-gold/8">
            {/* Cap the list so the portfolio numbers stay above the fold on a
                phone; the full list lives on /leases. */}
            {expiring.slice(0, 4).map((l) => {
              const urgency = leaseUrgency(l.days);
              const style = URGENCY_STYLE[urgency];
              return (
                <div key={l.id} className="p-4 md:px-6 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/properties/${l.property?.id}`} className="font-semibold text-brand-brown hover:text-gold-deep transition-colors text-sm md:text-base block truncate">
                      {l.property?.name} · {l.property?.city}
                    </Link>
                    <p className="text-xs text-brand-gray-light mt-0.5 truncate">
                      {l.tenant?.full_name} · {ILS(l.monthly_rent)} לחודש · עד {heDate(l.end_date)}
                    </p>
                  </div>
                  <span className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${style.text} ${style.bg} ${style.border}`}>
                    {style.label(l.days)}
                  </span>
                  <div className="hidden sm:flex items-center gap-0.5 shrink-0">
                    {l.tenant?.phone && (
                      <>
                        <a href={waLink(l.tenant.phone)} target="_blank" rel="noreferrer" title="וואטסאפ לשוכר"
                          className="touch-target rounded-xl hover:bg-gold/10 text-brand-gray-light hover:text-green-600 active:scale-95 transition-all">
                          <MessageSquare size={17} />
                        </a>
                        <a href={`tel:${l.tenant.phone}`} title="התקשר לשוכר"
                          className="touch-target rounded-xl hover:bg-gold/10 text-brand-gray-light hover:text-green-700 active:scale-95 transition-all">
                          <Phone size={17} />
                        </a>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {expiring.length > 4 && (
            <Link
              href="/leases"
              className="flex items-center justify-center gap-1 py-3 text-xs font-bold text-gold hover:text-gold-deep hover:bg-gold/5 transition-colors border-t border-gold/10"
            >
              <span>עוד {expiring.length - 4} חוזים שדורשים טיפול</span>
              <ChevronLeft size={14} />
            </Link>
          )}
        </SectionCard>
      )}

      {/* ── Row 1: Portfolio financials ──────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4 ios-stagger">
        <StatCard title="שווי התיק" value={ILS(totalValue)} icon={Landmark} iconColor="text-gold-deep" />
        <StatCard title="הכנסה חודשית" value={ILS(monthlyIncome)} icon={Wallet} iconColor="text-green-600" />
        <StatCard title="תשואה שנתית ברוטו" value={`${grossYield.toFixed(1)}%`} icon={TrendingUp} iconColor="text-blue-600" />
        <StatCard title="הכנסה שנתית" value={ILS(monthlyIncome * 12)} icon={FileText} iconColor="text-violet-600" />
      </div>

      {/* ── Row 2: Occupancy ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4 ios-stagger">
        <StatCard title="סה״כ נכסים" value={props.length} icon={Building2} iconColor="text-gold-deep" />
        <StatCard title="מושכרים" value={rented} icon={KeyRound} iconColor="text-green-600" />
        <StatCard title="פנויים" value={vacant} icon={Building2} iconColor="text-amber-600" />
        <StatCard title="חוזים פעילים" value={activeLeases.length} icon={FileText} iconColor="text-sky-600" />
      </div>

      {/* ── Occupancy breakdown ────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 p-5 md:p-6 shadow-xl shadow-black/[0.03]">
        <h3 className="text-sm font-semibold text-brand-brown mb-3 tracking-tight">תמונת מצב התיק</h3>
        <SparkBar
          segments={[
            { value: rented, color: 'bg-green-500', label: 'מושכרים' },
            { value: vacant, color: 'bg-amber-400', label: 'פנויים' },
            { value: renovation, color: 'bg-violet-500', label: 'בשיפוץ' },
            { value: forSale, color: 'bg-sky-500', label: 'למכירה' },
          ]}
        />
      </div>

      {/* ── Upcoming renewals (next after the alerts) ──────── */}
      <SectionCard
        title="החוזים הקרובים לסיום"
        icon={FileText}
        action={
          <Link href="/leases" className="flex items-center gap-1 text-xs font-semibold text-gold hover:text-gold-deep transition-colors">
            <span>כל החוזים</span>
            <ChevronLeft size={14} />
          </Link>
        }
      >
        {activeLeases.length === 0 ? (
          <EmptyState icon={FileText} text="אין חוזים פעילים עדיין" />
        ) : (
          <div className="divide-y divide-gold/8">
            {activeLeases.slice(0, 6).map((l) => {
              const days = daysUntil(l.end_date);
              const urgency = leaseUrgency(days);
              const style = URGENCY_STYLE[urgency];
              return (
                <Link
                  key={l.id}
                  href={`/properties/${l.property?.id}`}
                  className="p-4 md:px-6 flex items-center gap-3 hover:bg-gold/5 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-brand-brown text-sm truncate group-hover:text-gold-deep transition-colors">
                      {l.property?.name}
                    </div>
                    <div className="text-xs text-brand-gray-light mt-0.5 truncate">
                      {l.tenant?.full_name} · {ILS(l.monthly_rent)} לחודש
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className={`text-xs font-bold ${style.text}`}>{heDate(l.end_date)}</div>
                    <div className="text-[10px] text-brand-gray-light mt-0.5">{style.label(days)}</div>
                  </div>
                  <ChevronLeft size={16} className="text-brand-sand shrink-0 group-hover:text-gold transition-colors" />
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
