import Link from 'next/link';
import {
  Building2, Wallet, TrendingUp, Landmark,
  FileText, ChevronLeft, Phone, MessageSquare,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ILS, heDateLong, heDate, daysUntil, waLink } from '@/lib/format';
import { leaseUrgency, URGENCY_STYLE } from '@/lib/domain';
import { StatCard, Group, Rows, EmptyState } from '@/components/ui';
import { OccupancyBar } from '@/components/OccupancyBar';

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
    <div className="space-y-6">
      {/* ── Large title ─────────────────────────────────── */}
      <div>
        <p className="text-[13px] text-label-tertiary">{heDateLong(new Date())}</p>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight mt-0.5">סקירה</h1>
      </div>

      {/* ── What needs a decision, before the numbers ────── */}
      {expiring.length > 0 && (
        <Group
          title="דורש טיפול"
          action={
            <span className="text-[13px] font-semibold text-danger bg-danger-tint rounded-full px-2.5 py-0.5">
              {expiring.length}
            </span>
          }
        >
          <Rows>
            {/* Capped so the portfolio numbers stay above the fold on a phone;
                the full list lives on /leases. */}
            {expiring.slice(0, 4).map((l) => {
              const style = URGENCY_STYLE[leaseUrgency(l.days)];
              return (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/properties/${l.property?.id}`} className="press-row flex-1 min-w-0 -m-1 p-1 rounded-lg">
                    <p className="font-semibold text-[15px] text-label truncate">{l.property?.name}</p>
                    <p className="text-[13px] text-label-secondary truncate mt-0.5">
                      {l.tenant?.full_name} · {ILS(l.monthly_rent)} · עד {heDate(l.end_date)}
                    </p>
                  </Link>
                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-[12px] font-semibold ${style.text} ${style.bg}`}>
                    {style.label(l.days)}
                  </span>
                  {l.tenant?.phone && (
                    <div className="hidden sm:flex items-center shrink-0">
                      <a href={waLink(l.tenant.phone)} target="_blank" rel="noreferrer"
                        className="press touch-target rounded-full text-label-tertiary hover:text-success" title="וואטסאפ לשוכר">
                        <MessageSquare size={18} strokeWidth={2} />
                      </a>
                      <a href={`tel:${l.tenant.phone}`}
                        className="press touch-target rounded-full text-label-tertiary hover:text-accent" title="התקשר לשוכר">
                        <Phone size={18} strokeWidth={2} />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </Rows>
          {expiring.length > 4 && (
            <Link
              href="/leases"
              className="press-row flex items-center justify-center gap-1 py-3 text-[14px] font-semibold text-accent border-t border-separator"
            >
              <span>עוד {expiring.length - 4} חוזים</span>
              <ChevronLeft size={15} strokeWidth={2.5} />
            </Link>
          )}
        </Group>
      )}

      {/* ── Portfolio ───────────────────────────────────── */}
      <section>
        <h2 className="text-[15px] font-bold text-label tracking-tight px-1 mb-2">התיק</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <StatCard title="שווי" value={ILS(totalValue)} icon={Landmark} tone="accent" />
          <StatCard title="הכנסה חודשית" value={ILS(monthlyIncome)} icon={Wallet} tone="success" />
          <StatCard title="תשואה ברוטו" value={`${grossYield.toFixed(1)}%`} icon={TrendingUp} tone="info" sub="שנתית" />
          <StatCard title="הכנסה שנתית" value={ILS(monthlyIncome * 12)} icon={FileText} tone="neutral" />
        </div>
      </section>

      {/* ── Occupancy ───────────────────────────────────── */}
      <section>
        <h2 className="text-[15px] font-bold text-label tracking-tight px-1 mb-2">תפוסה</h2>
        <div className="bg-surface rounded-2xl border border-separator p-4">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-[15px] text-label-secondary">
              <span className="text-[22px] font-bold text-label tracking-tight">{props.length}</span> נכסים
            </p>
            <p className="text-[13px] text-label-secondary">{activeLeases.length} חוזים פעילים</p>
          </div>
          <OccupancyBar
            segments={[
              { value: rented, color: 'bg-success', label: 'מושכרים' },
              { value: vacant, color: 'bg-warning', label: 'פנויים' },
              { value: renovation, color: 'bg-info', label: 'בשיפוץ' },
              { value: forSale, color: 'bg-accent', label: 'למכירה' },
            ]}
          />
        </div>
      </section>

      {/* ── Upcoming ────────────────────────────────────── */}
      <Group
        title="החוזים הקרובים"
        action={
          <Link href="/leases" className="press flex items-center gap-0.5 text-[14px] font-semibold text-accent">
            <span>הכל</span>
            <ChevronLeft size={15} strokeWidth={2.5} />
          </Link>
        }
      >
        {activeLeases.length === 0 ? (
          <EmptyState icon={FileText} text="אין חוזים פעילים עדיין" />
        ) : (
          <Rows>
            {activeLeases.slice(0, 6).map((l) => {
              const days = daysUntil(l.end_date);
              const style = URGENCY_STYLE[leaseUrgency(days)];
              return (
                <Link
                  key={l.id}
                  href={`/properties/${l.property?.id}`}
                  className="press-row flex items-center gap-3 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[15px] text-label truncate">{l.property?.name}</p>
                    <p className="text-[13px] text-label-secondary truncate mt-0.5">
                      {l.tenant?.full_name} · {ILS(l.monthly_rent)}
                    </p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-[13px] font-semibold text-label">{heDate(l.end_date)}</p>
                    <p className={`text-[12px] mt-0.5 ${style.text}`}>{style.label(days)}</p>
                  </div>
                  <ChevronLeft size={17} className="text-label-tertiary shrink-0" strokeWidth={2.5} />
                </Link>
              );
            })}
          </Rows>
        )}
      </Group>

      {/* ── Quick action ────────────────────────────────── */}
      <Link
        href="/properties"
        className="press flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-surface-sunken text-accent font-semibold text-[15px]"
      >
        <Building2 size={17} strokeWidth={2.2} />
        <span>כל הנכסים</span>
      </Link>
    </div>
  );
}
