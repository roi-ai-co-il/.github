import { createClient } from '@/lib/supabase/server';
import PaymentCalendar, { type CalEvent } from '@/components/PaymentCalendar';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'יומן' };

export default async function CalendarPage() {
  const supabase = await createClient();

  // Israel's calendar day, not the server's — a payment due "today" must not
  // read as late because the box runs in UTC.
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  /* A year back and a year forward: enough to page through in either direction
     without a round trip per month, and small enough to send in one payload. */
  const from = `${Number(todayIso.slice(0, 4)) - 1}${todayIso.slice(4)}`;
  const to   = `${Number(todayIso.slice(0, 4)) + 1}${todayIso.slice(4)}`;

  const [{ data: payments }, { data: leases }, { data: tasks }] = await Promise.all([
    supabase
      .from('lease_payments')
      .select('id, due_date, amount, paid, lease:leases!inner(id, status, property:properties(id, name), tenant:tenants(full_name))')
      .gte('due_date', from).lte('due_date', to)
      .eq('lease.status', 'active')
      .order('due_date'),
    supabase
      .from('leases')
      .select('id, end_date, monthly_rent, property:properties(id, name), tenant:tenants(full_name)')
      .eq('status', 'active')
      .gte('end_date', from).lte('end_date', to),
    supabase
      .from('tasks')
      .select('id, title, due_date, done, property:properties(id, name)')
      .eq('done', false)
      .not('due_date', 'is', null)
      .gte('due_date', from).lte('due_date', to),
  ]);

  const events: CalEvent[] = [];

  for (const p of payments ?? []) {
    const lease = p.lease as unknown as {
      property?: { id: string; name: string } | null;
      tenant?: { full_name: string } | null;
    } | null;
    events.push({
      // Unpaid AND in the past is the only thing that turns red here; a future
      // due date is simply money expected, not a problem.
      kind: !p.paid && p.due_date < todayIso ? 'payment_late' : 'payment',
      date: p.due_date,
      title: lease?.property?.name ?? 'תשלום',
      sub: [lease?.tenant?.full_name, p.paid ? 'שולם' : null].filter(Boolean).join(' · ') || null,
      amount: Number(p.amount),
      href: lease?.property?.id ? `/properties/${lease.property.id}` : null,
    });
  }

  for (const l of leases ?? []) {
    const prop = l.property as unknown as { id: string; name: string } | null;
    const ten = l.tenant as unknown as { full_name: string } | null;
    events.push({
      kind: 'lease_end',
      date: l.end_date,
      title: prop?.name ?? 'חוזה',
      sub: ten?.full_name ?? null,
      amount: null,
      href: prop?.id ? `/properties/${prop.id}` : null,
    });
  }

  for (const t of tasks ?? []) {
    const prop = t.property as unknown as { id: string; name: string } | null;
    events.push({
      kind: 'task',
      date: t.due_date as string,
      title: t.title,
      sub: prop?.name ?? null,
      amount: null,
      href: '/tasks',
    });
  }

  return <PaymentCalendar events={events} todayIso={todayIso} />;
}
