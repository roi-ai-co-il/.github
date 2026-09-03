'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PROPERTY_TYPES, PROPERTY_STATUS } from '@/lib/domain';
import ChipSelect from '@/components/ChipSelect';
import { useToast } from '@/components/Toast';

const inputCls =
  'w-full bg-surface-sunken rounded-xl px-4 py-3 text-[16px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30';
const labelCls = 'block text-[13px] font-medium text-label-secondary mb-1.5 mr-1';

export interface PropertyInitial {
  id: string;
  name: string;
  address: string;
  city: string;
  property_type: string;
  status: string;
  asking_rent: number | null;
  rooms: number | null;
  area_sqm: number | null;
  floor_no: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  current_value: number | null;
  notes: string | null;
  entity_id: string | null;
  building_id: string | null;
}

type Entity = { id: string; name: string };
type Building = { id: string; name: string };

/** One form for creating a property and for editing it — same fields, same
    validation, so the two screens can never drift apart. */
export default function PropertyForm({ initial }: { initial?: PropertyInitial }) {
  const router = useRouter();
  const { toast } = useToast();
  const editing = !!initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: initial?.name ?? '',
    address: initial?.address ?? '',
    city: initial?.city ?? '',
    property_type: initial?.property_type ?? 'apartment',
    status: initial?.status ?? 'vacant',
    rooms: initial?.rooms != null ? String(initial.rooms) : '',
    area_sqm: initial?.area_sqm != null ? String(initial.area_sqm) : '',
    floor_no: initial?.floor_no != null ? String(initial.floor_no) : '',
    purchase_price: initial?.purchase_price != null ? String(initial.purchase_price) : '',
    purchase_date: initial?.purchase_date ?? '',
    current_value: initial?.current_value != null ? String(initial.current_value) : '',
    notes: initial?.notes ?? '',
    asking_rent: initial?.asking_rent != null ? String(initial.asking_rent) : '',
    entity_id: initial?.entity_id ?? '',
    building_id: initial?.building_id ?? '',
  });

  /* Who legally holds this property. Shai asked for exactly this at 0:40 —
     "מי מחזיק במה". Optional: leave it blank and the property behaves as it
     always has, so nobody is forced to model ownership before adding a flat. */
  const [entities, setEntities] = useState<Entity[]>([]);
  const [newEntity, setNewEntity] = useState('');
  /* Buildings group several units at one address. Optional like the entity:
     a scattered portfolio simply never creates one, and the field is a single
     line that stays on "לא צוין". */
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [newBuilding, setNewBuilding] = useState('');
  useEffect(() => {
    const supabase = createClient();
    supabase.from('owner_entities').select('id, name').order('name')
      .then(({ data }) => setEntities(data ?? []));
    supabase.from('buildings').select('id, name').order('name')
      .then(({ data }) => setBuildings(data ?? []));
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'שם הנכס חובה';
    if (!form.address.trim()) errs.address = 'כתובת חובה';
    if (!form.city.trim()) errs.city = 'עיר חובה';
    for (const k of ['rooms', 'area_sqm', 'floor_no', 'purchase_price', 'current_value', 'asking_rent'] as const) {
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

    /* A name typed into "ישות חדשה" becomes a real entity on save, so adding a
       property and naming its holder is one action rather than two screens. */
    let entityId: string | null = form.entity_id || null;
    const typed = newEntity.trim();
    if (typed) {
      const { data: created, error: entErr } = await supabase
        .from('owner_entities').insert({ name: typed }).select('id').single();
      if (entErr || !created) {
        setError('יצירת הישות נכשלה — נסה שוב');
        setSaving(false);
        return;
      }
      entityId = created.id;
    }

    let buildingId: string | null = form.building_id || null;
    const typedBuilding = newBuilding.trim();
    if (typedBuilding) {
      const { data: b, error: bErr } = await supabase
        .from('buildings')
        .insert({ name: typedBuilding, city: form.city.trim() || null, address: form.address.trim() || null, entity_id: entityId })
        .select('id').single();
      if (bErr || !b) {
        setError('יצירת האתר נכשלה — נסה שוב');
        setSaving(false);
        return;
      }
      buildingId = b.id;
    }

    const payload = {
      entity_id: entityId,
      building_id: buildingId,
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
      asking_rent: form.asking_rent === '' ? null : Number(form.asking_rent),
    };

    if (editing) {
      const { error: upErr } = await supabase.from('properties').update(payload).eq('id', initial.id);
      if (upErr) {
        setError('שמירת השינויים נכשלה — נסה שוב');
        setSaving(false);
        return;
      }
      toast('השינויים נשמרו');
      router.push(`/properties/${initial.id}`);
      router.refresh();
      return;
    }

    const { data, error: insErr } = await supabase.from('properties').insert(payload).select('id').single();
    if (insErr || !data) {
      setError('שמירת הנכס נכשלה — נסה שוב');
      setSaving(false);
      return;
    }
    toast('הנכס נשמר');
    router.push(`/properties/${data.id}`);
    router.refresh();
  };

  const backHref = editing ? `/properties/${initial.id}` : '/properties';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href={backHref} className="press inline-flex items-center gap-0.5 text-[15px] font-medium text-accent -mr-1">
          <ChevronRight size={18} strokeWidth={2.5} />
          <span>{editing ? initial.name : 'נכסים'}</span>
        </Link>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight mt-2">
          {editing ? 'עריכת נכס' : 'נכס חדש'}
        </h1>
        {!editing && <p className="text-[13px] text-label-tertiary mt-1">אחרי השמירה אפשר להוסיף תמונות בעמוד הנכס</p>}
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

        <ChipSelect
          label="סוג נכס"
          value={form.property_type}
          onChange={(v) => set('property_type', v)}
          options={Object.entries(PROPERTY_TYPES).map(([k, v]) => ({ value: k, label: v }))}
        />

        <ChipSelect
          label="סטטוס"
          value={form.status}
          onChange={(v) => set('status', v)}
          options={Object.entries(PROPERTY_STATUS).map(([k, v]) => ({ value: k, label: v.label, dot: v.dot }))}
        />

        <div>
          <label htmlFor="entity_id" className={labelCls}>מי מחזיק בנכס</label>
          <select
            id="entity_id"
            className={inputCls}
            value={form.entity_id}
            onChange={(e) => { set('entity_id', e.target.value); setNewEntity(''); }}
            disabled={newEntity.trim().length > 0}
          >
            <option value="">לא צוין</option>
            {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
          <input
            className={`${inputCls} mt-2`}
            value={newEntity}
            onChange={(e) => { setNewEntity(e.target.value); if (e.target.value) set('entity_id', ''); }}
            placeholder="או הקלד שם של ישות חדשה"
            aria-label="ישות חדשה"
          />
          <p className="text-[12px] text-label-tertiary mt-1.5 mr-1">אדם או חברה שעל שמם רשום הנכס. אפשר להשאיר ריק.</p>
        </div>

        <div>
          <label htmlFor="building_id" className={labelCls}>אתר / בניין</label>
          <select
            id="building_id"
            className={inputCls}
            value={form.building_id}
            onChange={(e) => { set('building_id', e.target.value); setNewBuilding(''); }}
            disabled={newBuilding.trim().length > 0}
          >
            <option value="">לא צוין</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input
            className={`${inputCls} mt-2`}
            value={newBuilding}
            onChange={(e) => { setNewBuilding(e.target.value); if (e.target.value) set('building_id', ''); }}
            placeholder="או הקלד שם של אתר חדש"
            aria-label="אתר חדש"
          />
          <p className="text-[12px] text-label-tertiary mt-1.5 mr-1">רק אם יש לך יותר מיחידה אחת באותו בניין. אחרת השאר ריק.</p>
        </div>

        <div>
          <label htmlFor="asking_rent" className={labelCls}>שכר דירה מבוקש (₪ לחודש)</label>
          <input id="asking_rent" inputMode="numeric" className={inputCls} value={form.asking_rent} onChange={(e) => set('asking_rent', e.target.value)} placeholder="כמה תרצה שישלמו על הנכס" />
          <p className="text-[12px] text-label-tertiary mt-1.5 mr-1">יוצג כשהנכס פנוי, וימולא אוטומטית כשתשכיר אותו</p>
          {fieldErrors.asking_rent && <p className="text-[13px] text-danger font-medium mt-1.5 mr-1">{fieldErrors.asking_rent}</p>}
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
            <input id="purchase_date" type="date" dir="ltr" className={`${inputCls} text-left`} value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
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
            <span>{saving ? 'שומר…' : editing ? 'שמירת שינויים' : 'שמור נכס'}</span>
          </button>
          <Link href={backHref} className="press touch-target px-5 py-3.5 text-[16px] text-label-secondary font-medium rounded-xl bg-surface-sunken">
            ביטול
          </Link>
        </div>
      </form>
    </div>
  );
}
