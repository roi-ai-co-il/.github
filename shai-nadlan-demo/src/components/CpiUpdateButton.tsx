'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { heDate } from '@/lib/format';
import { useToast } from '@/components/Toast';

/** Marks an index-linked lease as updated today.
 *
 *  Without this the reminder on the dashboard could never clear: it counts a
 *  year from the last update, and with nothing to record an update it would
 *  fire on every load once the first anniversary passed. A reminder that
 *  cannot be answered is a nag.
 */
export default function CpiUpdateButton({
  leaseId, since, due,
}: { leaseId: string; since: string; due: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markUpdated() {
    setSaving(true);
    setError(null);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const { error: uErr } = await createClient()
      .from('leases').update({ cpi_updated_on: today }).eq('id', leaseId);
    setSaving(false);
    if (uErr) { setError('העדכון נכשל — נסה שוב'); return; }
    toast('עדכון המדד נרשם');
    router.refresh();
  }

  return (
    <div className="px-4 py-3 border-t border-separator">
      <div className="flex items-center gap-3">
        <TrendingUp size={17} strokeWidth={2.2} className={`shrink-0 ${due ? 'text-info' : 'text-label-tertiary'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-label">
            {due ? 'הגיע מועד עדכון המדד' : 'צמוד מדד'}
          </p>
          <p className="text-[13px] text-label-tertiary mt-0.5">
            {`עודכן לאחרונה ${heDate(since)}`}
          </p>
        </div>
        {due && (
          <button
            type="button"
            onClick={markUpdated}
            disabled={saving}
            className="press shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-info bg-info-tint disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.6} />}
            <span>עודכן</span>
          </button>
        )}
      </div>
      {error && <p className="text-[13px] text-danger font-medium mt-2">{error}</p>}
    </div>
  );
}
