'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PROPERTY_TYPES, PROPERTY_STATUS } from '@/lib/domain';

const inputCls =
  'w-full bg-white/70 border border-white/40 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold/30 transition-all shadow-sm placeholder:text-brand-gray-light/60';
const labelCls = 'block text-xs font-semibold text-brand-gray mb-1.5';

export default function NewPropertyPage() {
  const router = useRouter();
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
    router.push(`/properties/${data.id}`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href="/properties" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-gray-light hover:text-gold-deep transition-colors">
          <ChevronRight size={14} />
          <span>חזרה לנכסים</span>
        </Link>
        <h1 className="text-xl md:text-2xl font-bold text-brand-brown mt-2">נכס חדש</h1>
        <p className="text-xs md:text-sm text-brand-gray-light mt-1">אחרי השמירה אפשר להוסיף תמונות בעמוד הנכס</p>
      </div>

      <form onSubmit={submit} className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 p-5 md:p-7 shadow-xl shadow-black/[0.03] space-y-4 animate-ios-fade-in">
        <div>
          <label htmlFor="name" className={labelCls}>שם הנכס *</label>
          <input id="name" className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="למשל: דירת 4 חד׳ ברוטשילד" />
          {fieldErrors.name && <p className="text-xs text-red-600 font-semibold mt-1">{fieldErrors.name}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="address" className={labelCls}>כתובת *</label>
            <input id="address" className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="רחוב ומספר" />
            {fieldErrors.address && <p className="text-xs text-red-600 font-semibold mt-1">{fieldErrors.address}</p>}
          </div>
          <div>
            <label htmlFor="city" className={labelCls}>עיר *</label>
            <input id="city" className={inputCls} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="תל אביב" />
            {fieldErrors.city && <p className="text-xs text-red-600 font-semibold mt-1">{fieldErrors.city}</p>}
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
            {fieldErrors.rooms && <p className="text-xs text-red-600 font-semibold mt-1">{fieldErrors.rooms}</p>}
          </div>
          <div>
            <label htmlFor="area_sqm" className={labelCls}>שטח (מ״ר)</label>
            <input id="area_sqm" inputMode="decimal" className={inputCls} value={form.area_sqm} onChange={(e) => set('area_sqm', e.target.value)} placeholder="100" />
            {fieldErrors.area_sqm && <p className="text-xs text-red-600 font-semibold mt-1">{fieldErrors.area_sqm}</p>}
          </div>
          <div>
            <label htmlFor="floor_no" className={labelCls}>קומה</label>
            <input id="floor_no" inputMode="numeric" className={inputCls} value={form.floor_no} onChange={(e) => set('floor_no', e.target.value)} placeholder="3" />
            {fieldErrors.floor_no && <p className="text-xs text-red-600 font-semibold mt-1">{fieldErrors.floor_no}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="purchase_price" className={labelCls}>מחיר רכישה (₪)</label>
            <input id="purchase_price" inputMode="numeric" className={inputCls} value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} placeholder="2,000,000" />
            {fieldErrors.purchase_price && <p className="text-xs text-red-600 font-semibold mt-1">{fieldErrors.purchase_price}</p>}
          </div>
          <div>
            <label htmlFor="purchase_date" className={labelCls}>תאריך רכישה</label>
            <input id="purchase_date" type="date" className={inputCls} value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
          </div>
          <div>
            <label htmlFor="current_value" className={labelCls}>שווי נוכחי (₪)</label>
            <input id="current_value" inputMode="numeric" className={inputCls} value={form.current_value} onChange={(e) => set('current_value', e.target.value)} placeholder="2,500,000" />
            {fieldErrors.current_value && <p className="text-xs text-red-600 font-semibold mt-1">{fieldErrors.current_value}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="notes" className={labelCls}>הערות</label>
          <textarea id="notes" className={`${inputCls} min-h-[70px] resize-y`} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="הערות חופשיות על הנכס…" />
        </div>

        {error && (
          <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-brand-dark text-on-brand-dark text-sm font-bold rounded-2xl disabled:opacity-40 transition-all duration-200 hover:shadow-lg touch-target"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{saving ? 'שומר…' : 'שמור נכס'}</span>
          </button>
          <Link href="/properties" className="px-5 py-3.5 text-sm text-brand-gray-light font-medium rounded-2xl hover:bg-brand-beige/20 transition-colors touch-target">
            ביטול
          </Link>
        </div>
      </form>
    </div>
  );
}
