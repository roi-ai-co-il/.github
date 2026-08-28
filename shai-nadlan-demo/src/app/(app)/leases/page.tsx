import Link from 'next/link';
import { FileText, AlertCircle, CheckCircle2, ChevronLeft, Users, Phone } from 'lucide-react';
import ContactButtons, { WhatsAppIcon } from '@/components/ContactButtons';
import { createClient } from '@/lib/supabase/server';
import { ILS, heDate, daysUntil, waLink } from '@/lib/format';
import { leaseUrgency, URGENCY_STYLE } from '@/lib/domain';
import { Group, Rows, EmptyState } from '@/components/ui';
import SwipeActions from '@/components/SwipeActions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'חוזים' };

type LeaseRecord = {
  id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  linked_to_cpi: boolean;
  notes: string | null;
  property: { id: string; name: string; city: string } | null;
  tenant: { full_name: string; phone: string | null } | null;
  payments: { paid: boolean; due_date: string }[];
};

export default async function LeasesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('leases')
    .select('id, start_date, end_date, monthly_rent, linked_to_cpi, notes, property:properties(id, name, city), tenant:tenants(full_name, phone), payments:lease_payments(paid, due_date)')
    .eq('status', 'active')
    .order('end_date', { ascending: true });

  const leases: (LeaseRecord & { days: number })[] = (data ?? []).map((l) => ({
    ...l,
    days: daysUntil(l.end_date),
  }));

  const attention = leases.filter((l) => l.days <= 90);
  const rest = leases.filter((l) => l.days > 90);
  const monthlyTotal = leases.reduce((s, l) => s + l.monthly_rent, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">חוזים</h1>
          <p className="text-[13px] text-label-tertiary mt-0.5">
            {leases.length} פעילים · {ILS(monthlyTotal)} לחודש
          </p>
        </div>
        <Link href="/tenants" className="press shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-sunken border border-separator text-[13px] font-semibold text-label">
          <Users size={14} strokeWidth={2.2} />
          <span>שוכרים</span>
        </Link>
      </div>

      {leases.length === 0 && (
        <div className="bg-surface rounded-2xl border border-separator">
          <EmptyState icon={FileText} text="אין חוזים פעילים עדיין" />
        </div>
      )}

      {attention.length > 0 && (
        <Group
          title="דורש טיפול"
          action={
            <span className="flex items-center gap-1 text-[13px] font-semibold text-danger">
              <AlertCircle size={14} strokeWidth={2.5} />
              עד 90 יום
            </span>
          }
        >
          <Rows>
            {attention.map((l) => <LeaseRow key={l.id} lease={l} />)}
          </Rows>
        </Group>
      )}

      {rest.length > 0 && (
        <Group
          title="תקינים"
          action={
            <span className="flex items-center gap-1 text-[13px] font-semibold text-success">
              <CheckCircle2 size={14} strokeWidth={2.5} />
              {rest.length}
            </span>
          }
        >
          <Rows>
            {rest.map((l) => <LeaseRow key={l.id} lease={l} />)}
          </Rows>
        </Group>
      )}
    </div>
  );
}

/**
 * On a phone the row hides its actions until you sweep it aside; on a pointer
 * device there is no sweep, so the same actions stay visible in the row.
 */
function LeaseRow({ lease }: { lease: LeaseRecord & { days: number } }) {
  const phone = lease.tenant?.phone;
  if (!phone) return <LeaseItem lease={lease} />;

  return (
    <SwipeActions
      actions={
        <>
          <a
            href={waLink(phone)}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex flex-col items-center justify-center gap-1 bg-[#25D366] text-white"
          >
            <WhatsAppIcon size={20} />
            <span className="text-[11px] font-semibold">וואטסאפ</span>
          </a>
          <a
            href={`tel:${phone}`}
            className="flex-1 flex flex-col items-center justify-center gap-1 bg-accent text-white"
          >
            <Phone size={19} strokeWidth={2.2} />
            <span className="text-[11px] font-semibold">חיוג</span>
          </a>
        </>
      }
    >
      <LeaseItem lease={lease} />
    </SwipeActions>
  );
}

function LeaseItem({ lease }: { lease: LeaseRecord & { days: number } }) {
  const urgency = leaseUrgency(lease.days);
  const style = URGENCY_STYLE[urgency];
  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const overdue = (lease.payments ?? []).some((p) => !p.paid && p.due_date <= todayIso);

  const totalDays = daysUntil(lease.end_date) - daysUntil(lease.start_date);
  const elapsed = -daysUntil(lease.start_date);
  const progress = totalDays > 0 ? Math.min(100, Math.max(0, (elapsed / totalDays) * 100)) : 100;

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <Link href={`/properties/${lease.property?.id}`} className="press-row flex-1 min-w-0 -m-1 p-1 rounded-lg">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-[15px] text-label truncate">{lease.property?.name}</p>
            <ChevronLeft size={15} className="text-label-tertiary shrink-0" strokeWidth={2.5} />
          </div>
          <p className="text-[13px] text-label-secondary truncate mt-0.5">
            {lease.tenant?.full_name}
            {lease.linked_to_cpi && (
              <span className="mr-2 text-[11px] font-semibold text-info bg-info-tint rounded-full px-2 py-0.5">
                צמוד מדד
              </span>
            )}
          </p>
        </Link>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="font-semibold text-[15px] text-label whitespace-nowrap">{ILS(lease.monthly_rent)}</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${style.text} ${style.bg}`}>
            {style.label(lease.days)}
          </span>
          {overdue && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-white bg-danger">
              תשלום ממתין
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-label-tertiary mb-1">
          <span>{heDate(lease.start_date)}</span>
          <span>{heDate(lease.end_date)}</span>
        </div>
        <div className="h-1 rounded-full bg-fill overflow-hidden">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-2">
        {lease.notes ? (
          <p className="text-[12px] text-label-tertiary truncate">{lease.notes}</p>
        ) : <span />}
        {lease.tenant?.phone && (
          <ContactButtons phone={lease.tenant.phone} name={lease.tenant.full_name ?? undefined} compact />
        )}
      </div>
    </div>
  );
}
