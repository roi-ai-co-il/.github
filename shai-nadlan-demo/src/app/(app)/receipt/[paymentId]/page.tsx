import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ReceiptSheet, { type ReceiptData, type PendingReceipt } from '@/components/ReceiptSheet';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'אסמכתה' };

const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const supabase = await createClient();

  const [{ data: payment }, { data: receipt }, { data: settings }] = await Promise.all([
    supabase
      .from('lease_payments')
      .select('id, due_date, amount, paid, paid_date, lease:leases(property:properties(id, name, address, city), tenant:tenants(full_name, phone))')
      .eq('id', paymentId)
      .maybeSingle(),
    supabase
      .from('receipts')
      .select('number, issued_at, amount, paid_date, tenant_name, property_name, property_address, issuer_name, period_label')
      .eq('payment_id', paymentId)
      .maybeSingle(),
    supabase.from('digest_settings').select('greeting_name').eq('id', true).maybeSingle(),
  ]);

  if (!payment) notFound();

  const lease = payment.lease as unknown as {
    property?: { id: string; name: string; address: string | null; city: string | null } | null;
    tenant?: { full_name: string; phone: string | null } | null;
  } | null;

  const month = Number(payment.due_date.slice(5, 7)) - 1;
  const pending: PendingReceipt = {
    paymentId: payment.id,
    amount: Number(payment.amount),
    paid_date: payment.paid_date,
    tenant_name: lease?.tenant?.full_name ?? 'שוכר',
    property_name: lease?.property?.name ?? 'נכס',
    property_address: [lease?.property?.address, lease?.property?.city].filter(Boolean).join(', ') || null,
    issuer_name: settings?.greeting_name?.trim() || 'שי עובדיה',
    period_label: `${HE_MONTHS[month]} ${payment.due_date.slice(0, 4)}`,
    tenantPhone: lease?.tenant?.phone ?? null,
    propertyId: lease?.property?.id ?? null,
  };

  return <ReceiptSheet pending={pending} receipt={(receipt as ReceiptData | null) ?? null} />;
}
