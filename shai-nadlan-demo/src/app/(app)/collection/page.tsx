import { createClient } from '@/lib/supabase/server';
import CollectionBoard, { type DueRow } from '@/components/CollectionBoard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'גבייה' };

export default async function CollectionPage() {
  const supabase = await createClient();

  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const monthIso = todayIso.slice(0, 7);
  /* The real last day of the month. "2026-09-31" is not a date: Postgres
     rejects the cast and the whole screen 400s in exactly the months that
     have 30 days. */
  const [y, m] = [Number(monthIso.slice(0, 4)), Number(monthIso.slice(5, 7))];
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  /* Everything unpaid in the past, plus this month either way. A year of
     history is not what this screen is for — the calendar already holds it. */
  const [{ data: payments }, { data: receipts }] = await Promise.all([
    supabase
      .from('lease_payments')
      .select('id, due_date, amount, paid, paid_date, lease:leases!inner(id, status, property:properties(id, name), tenant:tenants(full_name, phone))')
      .eq('lease.status', 'active')
      .or(`and(paid.eq.false,due_date.lt.${todayIso}),and(due_date.gte.${monthIso}-01,due_date.lte.${monthEnd})`)
      .order('due_date'),
    supabase.from('receipts').select('payment_id'),
  ]);

  const issued = new Set((receipts ?? []).map((r) => r.payment_id));

  const rows: DueRow[] = (payments ?? []).map((p) => {
    const lease = p.lease as unknown as {
      property?: { id: string; name: string } | null;
      tenant?: { full_name: string; phone: string | null } | null;
    } | null;
    return {
      id: p.id,
      due_date: p.due_date,
      amount: Number(p.amount),
      paid: p.paid,
      paid_date: p.paid_date,
      propertyId: lease?.property?.id ?? null,
      propertyName: lease?.property?.name ?? 'נכס',
      tenantName: lease?.tenant?.full_name ?? 'שוכר',
      tenantPhone: lease?.tenant?.phone ?? null,
      hasReceipt: issued.has(p.id),
    };
  });

  return <CollectionBoard rows={rows} monthIso={monthIso} todayIso={todayIso} />;
}
