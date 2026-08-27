'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PROPERTY_TYPES, PROPERTY_STATUS } from '@/lib/domain';
import { useToast } from '@/components/Toast';

const inputCls =
  'w-full bg-surface-sunken rounded-xl px-4 py-3 text-[16px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30';
const labelCls = 'block text-[13px] font-medium text-label-secondary mb-1.5 mr-1';

export default function NewPropertyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    property_type: 'apartment',
    status: 'vacant',
    rooms: '',
    area_sqm: '',
    floor_no: '',
    purchase_price: '',
    purchase_date: '',
    current_value: '',
    notes: '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'שם הנכס חובה';
    if (!form.address.trim()) errs.address = 'כתובת חובה';
    if (!form.city.trim()) errs.city = 'עיר חובה';
    for (const k of ['rooms', 'area_sqm', 'floor_no', 'purchase_price', 'current_value'] as const) {
      if (form[k] !== '' && isNaN(Number(form[k]))) errs[k] = 'ערך מספרי בלבד';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSaving(true);

    const supabase = createClient();
    const { data, error: insErr } = await supabase
      .from('properties')
      .insert({
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        property_type: form.property_type,
        status: form.status,
        rooms: form.rooms === '' ? null : Number(form.rooms),
        area_sqm: form.area_sqm === '' ? null : Number(form.area_sqm),
        floor_no: form.floor_no === '' ? null : Number(form.floor_no),
        purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
        purchase_date: form.purchase_date === '' ? null : form.purchase_date,
        current_value: form.current_value === '' ? null : Number(form.current_value),
        notes: form.notes.trim() || null,
      })
      .select('id')
      .single();

    if (insErr || !data) {
      setError('שמירת הנכס נכשלה — נסה שוב');
      setSaving(false);
      return;
    }
    toast('הנכס נשמר');
    router.push(`/properties/${data.id}`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href="/properties" className="press inline-flex items-center gap-0.5 text-[15px] font-medium text-accent -mr-1">
          <ChevronRight size={18} strokeWidth={2.5} />
          <span>נכסים</span>
        </Link>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight mt-2">נכס חדש</h1>
        <p className="text-[13px] text-label-tertiary mt-1">אחרי השמירה אפשר להוסיף תמונות בעמוד הנכס</p>
      </div>

      <form onSubmit={submit} className="bg-surface rounded-2xl border border-separator p-4 md:p-5 space-y-4 animate-in">
        <div>
          <label htmlFor="name" className={labelCls}>שם הנכס *</label>
          <input id="name" className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="למשל: דירת 4 חד׳ ברוטשילד" />
          {fieldErrors.name && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.name}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="address" className={labelCls}>כתובת *</label>
            <input id="address" className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="רחוב ומספר" />
            {fieldErrors.address && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.address}</p>}
          </div>
          <div>
            <label htmlFor="city" className={labelCls}>עיר *</label>
            <input id="city" className={inputCls} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="תל אביב" />
            {fieldErrors.city && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.city}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="property_type" className={labelCls}>סוג נכס</label>
            <select id="property_type" className={inputCls} value={form.property_type} onChange={(e) => set('property_type', e.target.value)}>
              {Object.entries(PROPERTY_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className={labelCls}>סטטוס</label>
            <select id="status" className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(PROPERTY_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="rooms" className={labelCls}>חדרים</label>
            <input id="rooms" inputMode="decimal" className={inputCls} value={form.rooms} onChange={(e) => set('rooms', e.target.value)} placeholder="4" />
            {fieldErrors.rooms && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.rooms}</p>}
          </div>
          <div>
            <label htmlFor="area_sqm" className={labelCls}>שטח (מ״ר)</label>
            <input id="area_sqm" inputMode="decimal" className={inputCls} value={form.area_sqm} onChange={(e) => set('area_sqm', e.target.value)} placeholder="100" />
            {fieldErrors.area_sqm && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.area_sqm}</p>}
          </div>
          <div>
            <label htmlFor="floor_no" className={labelCls}>קומה</label>
            <input id="floor_no" inputMode="numeric" className={inputCls} value={form.floor_no} onChange={(e) => set('floor_no', e.target.value)} placeholder="3" />
            {fieldErrors.floor_no && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.floor_no}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="purchase_price" className={labelCls}>מחיר רכישה (₪)</label>
            <input id="purchase_price" inputMode="numeric" className={inputCls} value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} placeholder="2,000,000" />
            {fieldErrors.purchase_price && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.purchase_price}</p>}
          </div>
          <div>
            <label htmlFor="purchase_date" className={labelCls}>תאריך רכישה</label>
            <input id="purchase_date" type="date" className={inputCls} value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
          </div>
          <div>
            <label htmlFor="current_value" className={labelCls}>שווי נוכחי (₪)</label>
            <input id="current_value" inputMode="numeric" className={inputCls} value={form.current_value} onChange={(e) => set('current_value', e.target.value)} placeholder="2,500,000" />
            {fieldErrors.current_value && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.current_value}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="notes" className={labelCls}>הערות</label>
          <textarea id="notes" className={`${inputCls} min-h-[70px] resize-y`} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="הערות חופשיות על הנכס…" />
        </div>

        {error && (
          <p role="alert" className="text-[14px] font-medium text-danger bg-danger-tint rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="press touch-target flex-1 flex items-center justify-center gap-2 py-3.5 bg-accent text-white text-[16px] font-semibold rounded-xl disabled:opacity-40"
          >
            {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} strokeWidth={2.2} />}
            <span>{saving ? 'שומר…' : 'שמור נכס'}</span>
          </button>
          <Link href="/properties" className="press touch-target px-5 py-3.5 text-[16px] text-label-secondary font-medium rounded-xl bg-surface-sunken">
            ביטול
          </Link>
        </div>
      </form>
    </div>
  );
}
