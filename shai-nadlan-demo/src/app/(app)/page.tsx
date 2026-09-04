import Link from 'next/link';
import {
  Building2, Wallet, TrendingUp, Landmark,
  FileText, ChevronLeft, Phone, MessageSquare, AlertCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ILS, heDateLong, heDate, daysUntil, waLink, heDays } from '@/lib/format';
import { leaseUrgency, URGENCY_STYLE } from '@/lib/domain';
import { StatCard, Group, Rows, EmptyState } from '@/components/ui';
import { OccupancyBar } from '@/components/OccupancyBar';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();

  // Israel-local calendar day: a payment due "today" must not read as late
  // just because the server sits in UTC.
  const now = new Date();
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  const [{ data: properties }, { data: leases }, { data: latePayments }, { data: entities }] = await Promise.all([
    supabase.from('properties').select('id, name, city, status, current_value, property_type, entity_id'),
    supabase
      .from('leases')
      .select('id, start_date, end_date, monthly_rent, linked_to_cpi, cpi_updated_on, property:properties(id, name, city), tenant:tenants(full_name, phone)')
      .eq('status', 'active')
      .order('end_date', { ascending: true }),
    // Money that is already late outranks a contract that ends later, so the
    // dashboard has to carry it too — until now it lived only on /leases and
    // inside a property, which meant nobody saw it without going looking.
    supabase
      .from('lease_payments')
      .select('id, due_date, amount, lease:leases!inner(id, status, property:properties(id, name, city), tenant:tenants(full_name, phone))')
      .eq('paid', false)
      .lt('due_date', todayIso)
      .eq('lease.status', 'active')
      .order('due_date', { ascending: true }),
    // "מי מחזיק במה" — Shai's own words at 0:40. Optional layer: when he has
    // not named any holder, this whole section stays out of the way.
    supabase.from('owner_entities').select('id, name, entity_type').order('name'),
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

  /* One row per lease, not per unpaid month: three late months for the same
     tenant is one conversation, not three alerts. Keeps the oldest due date,
     which is what decides how urgent the row is. */
  type LateGroup = {
    leaseId: string; propertyId?: string; propertyName?: string;
    tenantName?: string; tenantPhone?: string | null;
    months: number; total: number; oldestDue: string;
  };
  const lateByLease = new Map<string, LateGroup>();
  for (const p of latePayments ?? []) {
    const lease = p.lease as unknown as {
      id: string;
      property?: { id: string; name: string } | null;
      tenant?: { full_name: string; phone: string | null } | null;
    } | null;
    if (!lease) continue;
    const g = lateByLease.get(lease.id) ?? {
      leaseId: lease.id,
      propertyId: lease.property?.id,
      propertyName: lease.property?.name,
      tenantName: lease.tenant?.full_name,
      tenantPhone: lease.tenant?.phone ?? null,
      months: 0, total: 0, oldestDue: p.due_date,
    };
    g.months += 1;
    g.total += p.amount ?? 0;
    if (p.due_date < g.oldestDue) g.oldestDue = p.due_date;
    lateByLease.set(lease.id, g);
  }
  const late = [...lateByLease.values()].sort((a, b) => a.oldestDue.localeCompare(b.oldestDue));

  /* Value and count per holder. Properties with no entity are gathered under
     one honest "לא צוין" row rather than silently dropped — a portfolio view
     that hides part of the portfolio is worse than no view. */
  const holders = (entities ?? []).map((e) => {
    const owned = props.filter((p) => p.entity_id === e.id);
    return {
      id: e.id, name: e.name,
      count: owned.length,
      value: owned.reduce((sum, p) => sum + (p.current_value ?? 0), 0),
    };
  });
  const unassigned = props.filter((p) => !p.entity_id);
  if (holders.length > 0 && unassigned.length > 0) {
    holders.push({
      id: 'none', name: 'לא צוין',
      count: unassigned.length,
      value: unassigned.reduce((sum, p) => sum + (p.current_value ?? 0), 0),
    });
  }
  holders.sort((a, b) => b.value - a.value);

  /* Index-linked rent whose anniversary has passed. Measured from the last
     update, or from the lease start when it has never been updated — so once
     Shai marks it handled the reminder goes quiet for another year instead of
     nagging every time the dashboard loads. */
  const cpiDue = activeLeases
    .filter((l) => l.linked_to_cpi)
    .map((l) => {
      const since = l.cpi_updated_on ?? l.start_date;
      const due = new Date(since);
      due.setFullYear(due.getFullYear() + 1);
      const dueIso = due.toISOString().slice(0, 10);
      return { ...l, since, dueIso, overdueDays: -daysUntil(dueIso) };
    })
    .filter((l) => l.overdueDays >= 0)
    .sort((a, b) => b.overdueDays - a.overdueDays);

  const needsAttention = late.length + expiring.length + cpiDue.length;

  return (
    <div className="space-y-6">
      {/* ── Large title ─────────────────────────────────── */}
      <div>
        <p className="text-[13px] text-label-tertiary">{heDateLong(new Date())}</p>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight mt-0.5">סקירה</h1>
      </div>

      {/* ── What needs a decision, before the numbers ────── */}
      {needsAttention > 0 && (
        <Group
          title="דורש טיפול"
          action={
            <span className="text-[13px] font-semibold text-danger bg-danger-tint rounded-full px-2.5 py-0.5">
              {needsAttention}
            </span>
          }
        >
          <Rows>
            {/* Late money first: a payment that has not arrived is a problem
                now, while a contract ending in 80 days is only a reminder. */}
            {late.slice(0, 3).map((g) => {
              const daysLate = Math.max(0, -daysUntil(g.oldestDue));
              return (
                <div key={g.leaseId} className="flex items-center gap-3 px-4 py-3">
                  <AlertCircle size={18} strokeWidth={2.2} className="shrink-0 text-danger" />
                  <Link
                    href={g.propertyId ? `/properties/${g.propertyId}` : '/leases'}
                    className="press-row flex-1 min-w-0 -m-1 p-1 rounded-lg"
                  >
                    <p className="font-semibold text-[15px] text-label truncate">{g.propertyName ?? 'נכס'}</p>
                    <p className="text-[13px] text-label-secondary truncate mt-0.5">
                      {g.tenantName ?? 'שוכר'} · {ILS(g.total)}
                      {g.months > 1 ? ` · ${g.months} תשלומים` : ''}
                    </p>
                  </Link>
                  <span className="shrink-0 px-2.5 py-1 rounded-full text-[12px] font-semibold text-danger bg-danger-tint">
                    {daysLate === 0 ? 'באיחור' : `באיחור ${heDays(daysLate)}`}
                  </span>
                  {g.tenantPhone && (
                    <div className="hidden sm:flex items-center shrink-0">
                      <a href={waLink(g.tenantPhone)} target="_blank" rel="noreferrer"
                        className="press touch-target rounded-full text-label-tertiary hover:text-success" title="וואטסאפ לשוכר">
                        <MessageSquare size={18} strokeWidth={2} />
                      </a>
                      <a href={`tel:${g.tenantPhone}`}
                        className="press touch-target rounded-full text-label-tertiary hover:text-accent" title="התקשר לשוכר">
                        <Phone size={18} strokeWidth={2} />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
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
            {cpiDue.slice(0, 2).map((l) => (
              <div key={`cpi-${l.id}`} className="flex items-center gap-3 px-4 py-3">
                <TrendingUp size={18} strokeWidth={2.2} className="shrink-0 text-info" />
                <Link href={`/properties/${l.property?.id}`} className="press-row flex-1 min-w-0 -m-1 p-1 rounded-lg">
                  <p className="font-semibold text-[15px] text-label truncate">{l.property?.name}</p>
                  <p className="text-[13px] text-label-secondary truncate mt-0.5">
                    צמוד מדד · {ILS(l.monthly_rent)} · מאז {heDate(l.since)}
                  </p>
                </Link>
                <span className="shrink-0 px-2.5 py-1 rounded-full text-[12px] font-semibold text-info bg-info-tint">
                  עדכון מדד
                </span>
              </div>
            ))}
          </Rows>
          {(expiring.length > 4 || late.length > 3 || cpiDue.length > 2) && (
            <Link
              href="/leases"
              className="press-row flex items-center justify-center gap-1 py-3 text-[14px] font-semibold text-accent border-t border-separator"
            >
              <span>
                {[
                  late.length > 3 ? `עוד ${late.length - 3} באיחור` : null,
                  expiring.length > 4 ? `עוד ${expiring.length - 4} חוזים` : null,
                  cpiDue.length > 2 ? `עוד ${cpiDue.length - 2} לעדכון מדד` : null,
                ].filter(Boolean).join(' · ')}
              </span>
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

      {/* ── Who holds what ──────────────────────────────── */}
      {holders.length > 0 && (
        <section>
          <h2 className="text-[15px] font-bold text-label tracking-tight px-1 mb-2">מי מחזיק במה</h2>
          <div className="bg-surface rounded-2xl border border-separator overflow-hidden">
            {holders.map((h, i) => (
              <div
                key={h.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-separator' : ''}`}
              >
                <div className="min-w-0">
                  <p className={`text-[15px] truncate ${h.id === 'none' ? 'text-label-secondary' : 'font-semibold text-label'}`}>
                    {h.name}
                  </p>
                  <p className="text-[13px] text-label-tertiary mt-0.5">
                    {h.count === 1 ? 'נכס אחד' : `${h.count} נכסים`}
                  </p>
                </div>
                <p className="text-[15px] font-semibold text-label tabular-nums shrink-0">{ILS(h.value)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

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
