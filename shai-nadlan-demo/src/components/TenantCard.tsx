'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Check, Loader2, Pencil, User, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ILS } from '@/lib/format';
import ContactButtons from '@/components/ContactButtons';
import { useToast } from '@/components/Toast';

const inputCls =
  'w-full bg-surface-sunken rounded-xl px-3.5 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30';

export interface TenantWithLease {
  id: string;
  full_name: string;
  phone: string | null;
  activeLease: { propertyId: string; propertyName: string; rent: number } | null;
  leaseCount: number;
}

/** One tenant: who they are, where they rent, contact in one tap — and the
    details editable in place, no separate screen. */
export default function TenantCard({ tenant }: { tenant: TenantWithLease }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tenant.full_name);
  const [phone, setPhone] = useState(tenant.phone ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('tenants')
      .update({ full_name: name.trim(), phone: phone.trim() || null })
      .eq('id', tenant.id);
    setSaving(false);
    if (error) {
      toast('שמירת השוכר נכשלה — נסה שוב');
      return;
    }
    toast('פרטי השוכר עודכנו');
    setEditing(false);
    router.refresh();
  };

  return (
    <div className="bg-surface rounded-2xl border border-separator p-4">
      {editing ? (
        <div className="space-y-2.5">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא" />
          <input className={`${inputCls} text-left`} dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-0000000" />
          <div className="flex gap-2">
            <button onClick={save} disabled={!name.trim() || saving}
              className="press flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-accent text-white text-[14px] font-semibold disabled:opacity-40">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.4} />} שמירה
            </button>
            <button onClick={() => { setEditing(false); setName(tenant.full_name); setPhone(tenant.phone ?? ''); }}
              className="press px-4 py-2.5 rounded-xl bg-surface-sunken text-label-secondary text-[14px] font-medium">
              <X size={15} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-full bg-accent-tint text-accent flex items-center justify-center shrink-0">
                <User size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-label truncate">{tenant.full_name}</p>
                {tenant.phone ? (
                  <p className="text-[13px] text-label-secondary" dir="ltr">{tenant.phone}</p>
                ) : (
                  <p className="text-[13px] text-label-tertiary">אין טלפון</p>
                )}
              </div>
            </div>
            <button onClick={() => setEditing(true)} className="press touch-target rounded-full text-label-tertiary hover:text-label" title="עריכת שוכר" aria-label={`עריכת ${tenant.full_name}`}>
              <Pencil size={16} strokeWidth={2} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-separator">
            {tenant.activeLease ? (
              <Link href={`/properties/${tenant.activeLease.propertyId}`} className="press-row flex items-center gap-2 min-w-0 -m-1 p-1 rounded-lg">
                <Building2 size={15} strokeWidth={2} className="text-accent shrink-0" />
                <span className="text-[13px] text-label truncate">{tenant.activeLease.propertyName}</span>
                <span className="text-[13px] font-semibold text-accent whitespace-nowrap">{ILS(tenant.activeLease.rent)}</span>
              </Link>
            ) : (
              <span className="text-[13px] text-label-tertiary">
                {tenant.leaseCount > 0 ? 'שוכר עבר — אין חוזה פעיל' : 'עדיין ללא חוזה'}
              </span>
            )}
            {tenant.phone && <ContactButtons phone={tenant.phone} name={tenant.full_name} compact />}
          </div>
        </>
      )}
    </div>
  );
}
