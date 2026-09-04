'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSignature, RefreshCcw, FileX, Pencil, Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/ConfirmDialog';

function isoToday(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/**
 * Everything you can DO with a property, in one tidy row on its page —
 * no extra tabs, no hidden menus. Rent it out (or renew at a new price),
 * end the lease, edit, delete. The dangerous ones pass through an alert.
 */
export default function PropertyActions({
  propertyId,
  propertyName,
  activeLease,
}: {
  propertyId: string;
  propertyName: string;
  activeLease: { id: string; tenantName: string; startDate: string; endDate: string } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<'end' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  const primaryCls =
    'press touch-target flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-white text-[15px] font-semibold rounded-xl';
  const secondaryCls =
    'press touch-target flex-1 flex items-center justify-center gap-2 py-3 bg-surface-sunken text-label text-[15px] font-medium rounded-xl border border-separator';
  const iconCls =
    'press touch-target shrink-0 flex items-center justify-center w-12 rounded-xl bg-surface-sunken border border-separator text-label-secondary';

  const endLease = async () => {
    if (!activeLease || busy) return;
    setBusy(true);
    const supabase = createClient();
    const today = isoToday();
    // Shorten end_date only when today is strictly inside the term — a lease
    // that started today just flips status (end_date > start_date must hold).
    const shorten = today > activeLease.startDate && today < activeLease.endDate;
    const { error: lErr } = await supabase
      .from('leases')
      .update(shorten ? { status: 'ended', end_date: today } : { status: 'ended' })
      .eq('id', activeLease.id);
    if (lErr) {
      toast('סיום החוזה נכשל — נסה שוב');
      setBusy(false);
      setConfirm(null);
      return;
    }
    const { error: pErr } = await supabase.from('properties').update({ status: 'vacant' }).eq('id', propertyId);
    toast(pErr ? 'החוזה הסתיים; עדכון סטטוס הנכס נכשל — רענן' : 'החוזה הסתיים — הנכס פנוי');
    setBusy(false);
    setConfirm(null);
    router.refresh();
  };

  const deleteProperty = async () => {
    if (busy) return;
    setBusy(true);
    const supabase = createClient();
    // Storage files do not cascade with the row — collect and remove them first.
    const { data: images } = await supabase
      .from('property_images')
      .select('storage_path')
      .eq('property_id', propertyId);
    const paths = (images ?? []).map((i) => i.storage_path).filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from('property-images').remove(paths);

    const { error } = await supabase.from('properties').delete().eq('id', propertyId);
    if (error) {
      toast('מחיקת הנכס נכשלה — נסה שוב');
      setBusy(false);
      setConfirm(null);
      return;
    }
    toast('הנכס נמחק');
    router.push('/properties');
    router.refresh();
  };

  return (
    <>
      <div className="flex gap-2">
        {activeLease ? (
          <>
            <Link href={`/properties/${propertyId}/lease?renew=1`} className={primaryCls}>
              <RefreshCcw size={16} strokeWidth={2.2} />
              <span>שוכר חדש / מחיר חדש</span>
            </Link>
            <button onClick={() => setConfirm('end')} className={secondaryCls}>
              <FileX size={16} strokeWidth={2} />
              <span>סיום חוזה</span>
            </button>
          </>
        ) : (
          <Link href={`/properties/${propertyId}/lease`} className={primaryCls}>
            <FileSignature size={16} strokeWidth={2.2} />
            <span>השכרת הנכס</span>
          </Link>
        )}
        <Link href={`/properties/${propertyId}/edit`} className={iconCls} title="עריכת נכס" aria-label="עריכת נכס">
          <Pencil size={17} strokeWidth={2} />
        </Link>
        <button
          onClick={() => setConfirm('delete')}
          className={`${iconCls} hover:text-danger`}
          title="מחיקת נכס"
          aria-label="מחיקת נכס"
        >
          {busy && confirm === 'delete' ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} strokeWidth={2} />}
        </button>
      </div>

      <ConfirmDialog
        open={confirm === 'end'}
        title="לסיים את החוזה?"
        message={activeLease ? `החוזה עם ${activeLease.tenantName} יסומן כהסתיים והנכס יהפוך לפנוי.` : undefined}
        confirmLabel="סיום חוזה"
        danger
        onConfirm={endLease}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="למחוק את הנכס?"
        message={`״${propertyName}״ יימחק לצמיתות, כולל החוזים והתמונות שלו.`}
        confirmLabel="מחיקה"
        danger
        onConfirm={deleteProperty}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
