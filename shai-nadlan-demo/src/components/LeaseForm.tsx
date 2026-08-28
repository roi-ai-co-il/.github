'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Search, UserPlus, Users, FileSignature } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ILS } from '@/lib/format';
import { useToast } from '@/components/Toast';

const inputCls =
  'w-full bg-surface-sunken rounded-xl px-4 py-3 text-[16px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30';
const labelCls = 'block text-[13px] font-medium text-label-secondary mb-1.5 mr-1';

interface TenantOption { id: string; full_name: string; phone: string | null }

interface PrevLease {
  id: string;
  tenant_id: string;
  tenant_name: string;
  monthly_rent: number;
  start_date: string;
  end_date: string;
}

function isoToday(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function isoPlusYear(from: string): string {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * One form for every "rent this property out" story: a brand-new tenant, an
 * existing tenant, or a renewal at a new price. When the property already has
 * an active lease, saving ends it and starts the new one — one action, no
 * bookkeeping left to the user.
 */
export default function LeaseForm({
  propertyId,
  propertyName,
  tenants,
  activeLease,
  renew,
}: {
  propertyId: string;
  propertyName: string;
  tenants: TenantOption[];
  activeLease: PrevLease | null;
  renew: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const today = isoToday();
  const [mode, setMode] = useState<'new' | 'existing'>(
    renew && activeLease ? 'existing' : tenants.length ? 'existing' : 'new',
  );
  const [tenantId, setTenantId] = useState<string>(renew && activeLease ? activeLease.tenant_id : '');
  const [tenantSearch, setTenantSearch] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [rent, setRent] = useState(renew && activeLease ? String(activeLease.monthly_rent) : '');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(isoPlusYear(today));
  const [paymentDay, setPaymentDay] = useState('1');
  const [deposit, setDeposit] = useState('');
  const [cpi, setCpi] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const filteredTenants = useMemo(() => {
    const q = tenantSearch.trim();
    if (!q) return tenants;
    return tenants.filter((t) => t.full_name.includes(q) || (t.phone ?? '').includes(q));
  }, [tenants, tenantSearch]);

  // Live price comparison against the lease being replaced.
  const rentDelta = useMemo(() => {
    if (!activeLease) return null;
    const n = Number(rent);
    if (!rent || isNaN(n) || n <= 0) return null;
    const pct = ((n - activeLease.monthly_rent) / activeLease.monthly_rent) * 100;
    if (Math.abs(pct) < 0.05) return { text: 'אותו מחיר כמו החוזה הנוכחי', tone: 'text-label-tertiary' };
    return {
      text: `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}% לעומת ${ILS(activeLease.monthly_rent)} בחוזה הנוכחי`,
      tone: pct > 0 ? 'text-success' : 'text-warning',
    };
  }, [rent, activeLease]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (mode === 'new') {
      if (!fullName.trim()) errs.fullName = 'שם השוכר חובה';
    } else if (!tenantId) {
      errs.tenantId = 'בחר שוכר מהרשימה';
    }
    const n = Number(rent);
    if (rent === '' || isNaN(n) || n <= 0) errs.rent = 'שכר דירה חודשי חובה';
    if (!startDate) errs.startDate = 'תאריך התחלה חובה';
    if (!endDate) errs.endDate = 'תאריך סיום חובה';
    if (startDate && endDate && endDate <= startDate) errs.endDate = 'תאריך הסיום חייב להיות אחרי ההתחלה';
    const pd = Number(paymentDay);
    if (paymentDay === '' || isNaN(pd) || pd < 1 || pd > 31) errs.paymentDay = 'יום בחודש בין 1 ל־31';
    if (deposit !== '' && (isNaN(Number(deposit)) || Number(deposit) < 0)) errs.deposit = 'ערך מספרי בלבד';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSaving(true);
    const supabase = createClient();

    try {
      // 1. A new tenant is created first, so the lease has someone to point at.
      let finalTenantId = tenantId;
      if (mode === 'new') {
        const { data, error: tErr } = await supabase
          .from('tenants')
          .insert({ full_name: fullName.trim(), phone: phone.trim() || null })
          .select('id')
          .single();
        if (tErr || !data) throw new Error('יצירת השוכר נכשלה — נסה שוב');
        finalTenantId = data.id;
      }

      // 2. The current lease (if any) ends today — replacing it is one action.
      // end_date is shortened to today only when today is strictly INSIDE the
      // lease term; a lease that started today (or already ran out) keeps its
      // dates and only flips status, so the end_date > start_date constraint
      // can never reject the close.
      if (activeLease) {
        const shorten = today > activeLease.start_date && today < activeLease.end_date;
        const { error: eErr } = await supabase
          .from('leases')
          .update(shorten ? { status: 'ended', end_date: today } : { status: 'ended' })
          .eq('id', activeLease.id);
        if (eErr) throw new Error('סגירת החוזה הנוכחי נכשלה — נסה שוב');
      }

      // 3. The new lease.
      const { data: newLease, error: lErr } = await supabase.from('leases').insert({
        property_id: propertyId,
        tenant_id: finalTenantId,
        start_date: startDate,
        end_date: endDate,
        monthly_rent: Number(rent),
        payment_day: Number(paymentDay),
        deposit: deposit === '' ? null : Number(deposit),
        linked_to_cpi: cpi,
        status: 'active',
        notes: notes.trim() || null,
      }).select('id').single();
      if (lErr || !newLease) throw new Error('שמירת החוזה נכשלה — נסה שוב');

      // The monthly payment schedule is born with the lease — one row per
      // due month, so collection tracking needs no setup.
      const schedule: { lease_id: string; due_date: string; amount: number }[] = [];
      const end = new Date(endDate);
      const startD = new Date(startDate);
      const dueDay = Math.min(Number(paymentDay), 28);
      let d = new Date(startD.getFullYear(), startD.getMonth(), dueDay);
      if (d < startD) d.setMonth(d.getMonth() + 1);
      while (d <= end && schedule.length < 36) {
        schedule.push({ lease_id: newLease.id, due_date: d.toISOString().slice(0, 10), amount: Number(rent) });
        d = new Date(d.getFullYear(), d.getMonth() + 1, dueDay);
      }
      if (schedule.length) {
        const { error: sErr } = await supabase.from('lease_payments').insert(schedule);
        if (sErr) toast('החוזה נשמר, אבל יצירת לוח התשלומים נכשלה');
      }

      // 4. The property is now rented.
      const { error: pErr } = await supabase.from('properties').update({ status: 'rented' }).eq('id', propertyId);
      if (pErr) throw new Error('החוזה נשמר, אבל עדכון סטטוס הנכס נכשל — רענן ונסה שוב');

      toast(activeLease ? 'החוזה חודש — השוכר והמחיר עודכנו' : 'הנכס הושכר 🎉');
      router.push(`/properties/${propertyId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'משהו השתבש — נסה שוב');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href={`/properties/${propertyId}`} className="press inline-flex items-center gap-0.5 text-[15px] font-medium text-accent -mr-1">
          <ChevronRight size={18} strokeWidth={2.5} />
          <span>{propertyName}</span>
        </Link>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight mt-2">
          {renew && activeLease ? 'חידוש חוזה' : 'השכרת הנכס'}
        </h1>
        {activeLease && (
          <p className="text-[13px] text-label-tertiary mt-1">
            בשמירה, החוזה הנוכחי עם {activeLease.tenant_name} ({ILS(activeLease.monthly_rent)}) יסתיים אוטומטית והחדש ייכנס במקומו.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="bg-surface rounded-2xl border border-separator p-4 md:p-5 space-y-4 animate-in">
        {/* ── Who ── */}
        <div>
          <span className={labelCls}>השוכר</span>
          <div className="grid grid-cols-2 gap-1 bg-surface-sunken rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`press flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[14px] font-semibold ${
                mode === 'existing' ? 'bg-surface text-label shadow-sm' : 'text-label-secondary'
              }`}
            >
              <Users size={15} strokeWidth={2} /> שוכר קיים
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`press flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[14px] font-semibold ${
                mode === 'new' ? 'bg-surface text-label shadow-sm' : 'text-label-secondary'
              }`}
            >
              <UserPlus size={15} strokeWidth={2} /> שוכר חדש
            </button>
          </div>
        </div>

        {mode === 'existing' ? (
          <div className="space-y-2">
            {tenants.length > 4 && (
              <div className="relative">
                <Search size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-label-tertiary" />
                <input
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  placeholder="חיפוש שוכר…"
                  className={`${inputCls} pr-10`}
                />
              </div>
            )}
            <div className="max-h-[240px] overflow-y-auto space-y-1.5 pr-0.5">
              {filteredTenants.length === 0 && (
                <p className="text-[13px] text-label-tertiary px-1 py-2">
                  {tenants.length === 0 ? 'אין עדיין שוכרים במערכת — בחר ״שוכר חדש״.' : 'לא נמצא שוכר תואם.'}
                </p>
              )}
              {filteredTenants.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTenantId(t.id)}
                  className={`press w-full flex items-center justify-between gap-3 text-right rounded-xl px-3.5 py-2.5 border ${
                    tenantId === t.id
                      ? 'bg-accent-tint border-accent/40'
                      : 'bg-surface-sunken border-separator'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium text-label truncate">{t.full_name}</span>
                    {t.phone && <span className="block text-[12px] text-label-secondary" dir="ltr">{t.phone}</span>}
                  </span>
                  <span className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                    tenantId === t.id ? 'border-accent bg-accent' : 'border-separator'
                  }`} />
                </button>
              ))}
            </div>
            {fieldErrors.tenantId && <p className="text-[13px] text-danger font-medium mr-1">{fieldErrors.tenantId}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fullName" className={labelCls}>שם מלא *</label>
              <input id="fullName" className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ישראל ישראלי" />
              {fieldErrors.fullName && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.fullName}</p>}
            </div>
            <div>
              <label htmlFor="phone" className={labelCls}>טלפון</label>
              <input id="phone" inputMode="tel" dir="ltr" className={`${inputCls} text-left`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-0000000" />
            </div>
          </div>
        )}

        {/* ── Terms ── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="rent" className={labelCls}>שכר דירה חודשי (₪) *</label>
            <input id="rent" inputMode="numeric" className={inputCls} value={rent} onChange={(e) => setRent(e.target.value)} placeholder="8,500" />
            {rentDelta && <p className={`text-[12px] font-medium mt-1.5 mr-1 ${rentDelta.tone}`}>{rentDelta.text}</p>}
            {fieldErrors.rent && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.rent}</p>}
          </div>
          <div>
            <label htmlFor="paymentDay" className={labelCls}>יום תשלום בחודש</label>
            <input id="paymentDay" inputMode="numeric" className={inputCls} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} />
            {fieldErrors.paymentDay && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.paymentDay}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className={labelCls}>תחילת חוזה *</label>
            <input id="startDate" type="date" className={inputCls} value={startDate}
              onChange={(e) => {
                const v = e.target.value;
                setStartDate(v);
                if (v && (!endDate || endDate <= v)) setEndDate(isoPlusYear(v));
              }} />
            {fieldErrors.startDate && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.startDate}</p>}
          </div>
          <div>
            <label htmlFor="endDate" className={labelCls}>סיום חוזה *</label>
            <input id="endDate" type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            {fieldErrors.endDate && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.endDate}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 items-end">
          <div>
            <label htmlFor="deposit" className={labelCls}>פיקדון (₪)</label>
            <input id="deposit" inputMode="numeric" className={inputCls} value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="לא חובה" />
            {fieldErrors.deposit && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.deposit}</p>}
          </div>
          <button
            type="button"
            onClick={() => setCpi((v) => !v)}
            className="press flex items-center justify-between bg-surface-sunken rounded-xl px-4 py-3"
          >
            <span className="text-[15px] text-label">הצמדה למדד</span>
            <span className={`relative w-12 h-7 rounded-full transition-colors ${cpi ? 'bg-success' : 'bg-fill'}`}>
              <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${cpi ? 'right-0.5' : 'right-[22px]'}`} />
            </span>
          </button>
        </div>

        <div>
          <label htmlFor="lnotes" className={labelCls}>הערות לחוזה</label>
          <textarea id="lnotes" className={`${inputCls} min-h-[64px] resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="אופציה להארכה, תנאים מיוחדים…" />
        </div>

        {error && (
          <p role="alert" className="text-[14px] font-medium text-danger bg-danger-tint rounded-xl px-4 py-3">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="press touch-target flex-1 flex items-center justify-center gap-2 py-3.5 bg-accent text-white text-[16px] font-semibold rounded-xl disabled:opacity-40"
          >
            {saving ? <Loader2 size={17} className="animate-spin" /> : <FileSignature size={17} strokeWidth={2.2} />}
            <span>{saving ? 'שומר…' : activeLease ? 'סיום הישן והחתמת החדש' : 'השכרת הנכס'}</span>
          </button>
          <Link href={`/properties/${propertyId}`} className="press touch-target px-5 py-3.5 text-[16px] text-label-secondary font-medium rounded-xl bg-surface-sunken">
            ביטול
          </Link>
        </div>
      </form>
    </div>
  );
}
