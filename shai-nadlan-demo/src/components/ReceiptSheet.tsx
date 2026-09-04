'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Printer, Receipt as ReceiptIcon, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ILS, heDateLong, waLink } from '@/lib/format';
import { WhatsAppIcon } from '@/components/ContactButtons';
import { useToast } from '@/components/Toast';

export interface ReceiptData {
  number: number;
  issued_at: string;
  amount: number;
  paid_date: string | null;
  tenant_name: string;
  property_name: string;
  property_address: string | null;
  issuer_name: string;
  period_label: string;
}

export interface PendingReceipt extends Omit<ReceiptData, 'number' | 'issued_at'> {
  paymentId: string;
  tenantPhone: string | null;
  propertyId: string | null;
}

/**
 * אסמכתה על קבלת תשלום — deliberately NOT called a tax invoice.
 * An Israeli tax receipt (חשבונית מס / קבלה) has to be issued by
 * Tax-Authority-approved bookkeeping software with its own allocation number.
 * This is the paper a tenant asks for when they want proof they paid, and it
 * says exactly that on its face so nobody files it as something it isn't.
 */
export default function ReceiptSheet({ pending, receipt: existing }: {
  pending: PendingReceipt;
  receipt: ReceiptData | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [receipt, setReceipt] = useState<ReceiptData | null>(existing);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setIssuing(true);
    setError(null);
    const { data, error: insErr } = await supabase
      .from('receipts')
      .insert({
        payment_id: pending.paymentId,
        amount: pending.amount,
        paid_date: pending.paid_date,
        tenant_name: pending.tenant_name,
        property_name: pending.property_name,
        property_address: pending.property_address,
        issuer_name: pending.issuer_name,
        period_label: pending.period_label,
      })
      .select('number, issued_at, amount, paid_date, tenant_name, property_name, property_address, issuer_name, period_label')
      .single();
    setIssuing(false);
    if (insErr || !data) { setError('הפקת האסמכתה נכשלה — נסה שוב'); return; }
    setReceipt(data as ReceiptData);
    toast(`אסמכתה ${data.number} הופקה`);
    router.refresh();
  }

  const r = receipt;
  const waText = r
    ? `היי ${r.tenant_name}, מצורפת אסמכתה מס׳ ${r.number} על תשלום ${ILS(r.amount)} עבור ${r.property_name} — ${r.period_label}. תודה!`
    : '';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/collection" className="press text-[13px] font-semibold text-accent flex items-center gap-1">
            <ArrowRight size={14} strokeWidth={2.4} />
            <span>גבייה</span>
          </Link>
          <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight mt-0.5">אסמכתה</h1>
        </div>
      </div>

      {/* The document itself. Everything outside this box is hidden when
          printing — see the @media print block in globals.css. */}
      <div id="receipt-print" className="bg-surface rounded-2xl border border-separator p-6 md:p-9">
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-separator">
          <div>
            <p className="text-[19px] font-bold text-label tracking-tight">{pending.issuer_name}</p>
            <p className="text-[13px] text-label-tertiary mt-0.5">אסמכתה על קבלת תשלום</p>
          </div>
          {r && (
            <div className="text-end shrink-0">
              <p className="text-[12px] text-label-tertiary">מספר</p>
              <p className="text-[19px] font-bold text-label tabular-nums">{r.number}</p>
            </div>
          )}
        </div>

        <dl className="py-5 space-y-3.5">
          {[
            ['שולם על ידי', (r ?? pending).tenant_name],
            ['עבור', (r ?? pending).property_name],
            ['כתובת', (r ?? pending).property_address ?? '—'],
            ['תקופה', (r ?? pending).period_label],
            ['תאריך תשלום', (r ?? pending).paid_date ? heDateLong((r ?? pending).paid_date as string) : '—'],
            ...(r ? [['תאריך הפקה', heDateLong(r.issued_at.slice(0, 10))]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-label-tertiary shrink-0">{k}</dt>
              <dd className="text-[15px] text-label font-medium text-end">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex items-baseline justify-between gap-4 pt-4 border-t border-separator">
          <span className="text-[15px] font-semibold text-label">סכום</span>
          <span className="text-[26px] font-bold text-label tabular-nums">{ILS((r ?? pending).amount)}</span>
        </div>

        <p className="text-[11.5px] text-label-tertiary mt-6 leading-relaxed">
          מסמך זה הוא אסמכתה על קבלת תשלום ואינו מהווה חשבונית מס או קבלה לצורכי מס.
        </p>
      </div>

      {error && <p className="text-[13px] text-danger font-medium px-1">{error}</p>}

      {!r ? (
        <button
          type="button"
          onClick={issue}
          disabled={issuing}
          className="press w-full flex items-center justify-center gap-2 rounded-2xl bg-accent text-white px-4 py-3.5 text-[16px] font-semibold disabled:opacity-40"
        >
          {issuing ? <Loader2 size={18} className="animate-spin" /> : <ReceiptIcon size={18} strokeWidth={2.2} />}
          <span>הפקת אסמכתה</span>
        </button>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="press flex-1 min-w-[150px] flex items-center justify-center gap-2 rounded-2xl bg-accent text-white px-4 py-3.5 text-[16px] font-semibold"
          >
            <Printer size={18} strokeWidth={2.2} />
            <span>הדפסה / שמירה כ‑PDF</span>
          </button>
          {pending.tenantPhone && (
            <a
              href={`${waLink(pending.tenantPhone)}?text=${encodeURIComponent(waText)}`}
              target="_blank"
              rel="noreferrer"
              className="press flex-1 min-w-[150px] flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-white px-4 py-3.5 text-[16px] font-semibold"
            >
              <WhatsAppIcon size={18} />
              <span>שליחה בוואטסאפ</span>
            </a>
          )}
        </div>
      )}

      {r && (
        <p className="text-[12.5px] text-label-tertiary px-1 leading-relaxed">
          אסמכתה שהופקה לא משתנה יותר: גם אם תשנה את שם הנכס או את הסכום מאוחר יותר, מה שנמסר לשוכר יישאר בדיוק כפי שהוא כאן.
        </p>
      )}
    </div>
  );
}
