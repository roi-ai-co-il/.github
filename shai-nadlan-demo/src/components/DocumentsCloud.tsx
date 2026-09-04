'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Search, FolderOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { heDate } from '@/lib/format';
import { Group, Rows, EmptyState } from '@/components/ui';

export interface CloudDoc {
  id: string;
  title: string;
  doc_type: string;
  storage_path: string;
  size_bytes: number | null;
  doc_date: string | null;
  created_at: string;
  property_id: string;
  property_name: string;
}

const TYPE_TONE: Record<string, string> = {
  'חוזה': 'text-accent bg-accent-tint',
  'קבלה': 'text-success bg-success-tint',
  'ארנונה': 'text-warning bg-warning-tint',
  'שמאות': 'text-info bg-info-tint',
  'ביטוח': 'text-info bg-info-tint',
  'אישור': 'text-label-secondary bg-fill',
  'אחר': 'text-label-secondary bg-fill',
};

function prettySize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Every document in the portfolio on one screen — what Shai called
 *  "ענן מסמכים" in his own system, and the thing he said twice was the most
 *  convenient part of it. Uploading still happens on the property it belongs
 *  to, because a document with no property is a document nobody can find
 *  again; this screen is for reading, searching and opening. */
export default function DocumentsCloud({ docs }: { docs: CloudDoc[] }) {
  const supabase = createClient();
  const [q, setQ] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Only the types that actually exist here — a filter chip that can only ever
     return nothing is a chip that lies about what the archive holds. */
  const types = useMemo(() => {
    const seen = new Map<string, number>();
    for (const d of docs) seen.set(d.doc_type, (seen.get(d.doc_type) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [docs]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (type && d.doc_type !== type) return false;
      if (!needle) return true;
      return `${d.title} ${d.property_name} ${d.doc_type}`.toLowerCase().includes(needle);
    });
  }, [docs, q, type]);

  async function open(d: CloudDoc) {
    setBusyId(d.id);
    setError(null);
    const { data, error: sErr } = await supabase.storage
      .from('property-documents')
      .createSignedUrl(d.storage_path, 120);
    setBusyId(null);
    if (sErr || !data?.signedUrl) {
      setError('לא הצלחנו לפתוח את המסמך — נסה שוב');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">מסמכים</h1>
        <p className="text-[13px] text-label-tertiary mt-0.5">
          {docs.length === 0
            ? 'כל המסמכים של כל הנכסים, במקום אחד'
            : `${docs.length} מסמכים מכל הנכסים · העלאה מתוך הנכס עצמו`}
        </p>
      </div>

      {docs.length > 0 && (
        <div className="space-y-2.5">
          <div className="relative">
            <Search size={17} className="absolute top-1/2 -translate-y-1/2 start-3.5 text-label-tertiary pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש לפי שם מסמך או נכס"
              aria-label="חיפוש מסמכים"
              className="w-full bg-surface rounded-2xl border border-separator ps-10 pe-3.5 py-3 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {types.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setType(null)}
                className={`press rounded-full px-3 py-1.5 text-[13px] font-medium ${
                  type === null ? 'bg-accent text-white' : 'bg-fill text-label-secondary'
                }`}
              >
                הכול
              </button>
              {types.map(([t, n]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(type === t ? null : t)}
                  className={`press rounded-full px-3 py-1.5 text-[13px] font-medium ${
                    type === t ? 'bg-accent text-white' : 'bg-fill text-label-secondary'
                  }`}
                >
                  {t} · {n}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-[13px] text-danger font-medium px-1">{error}</p>}

      <Group title={type ?? 'הכול'}>
        {shown.length === 0 ? (
          <EmptyState
            icon={docs.length === 0 ? FolderOpen : Search}
            text={docs.length === 0
              ? 'עוד אין מסמכים — אפשר להעלות מתוך כל נכס, והם יופיעו כאן'
              : 'אין מסמך שמתאים לחיפוש'}
          />
        ) : (
          <Rows>
            {shown.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => open(d)}
                  className="press-row flex items-center gap-3 flex-1 min-w-0 -m-1 p-1 rounded-lg text-start"
                >
                  <span className="w-9 h-9 rounded-xl bg-fill flex items-center justify-center shrink-0">
                    {busyId === d.id
                      ? <Loader2 size={17} className="animate-spin text-label-tertiary" />
                      : <FileText size={17} strokeWidth={2} className="text-label-secondary" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-label truncate">{d.title}</span>
                    <span className="block text-[13px] text-label-secondary truncate mt-0.5">
                      {[d.property_name, heDate(d.doc_date ?? d.created_at), prettySize(d.size_bytes)]
                        .filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${TYPE_TONE[d.doc_type] ?? TYPE_TONE['אחר']}`}>
                  {d.doc_type}
                </span>
                <Link
                  href={`/properties/${d.property_id}`}
                  aria-label={`לנכס ${d.property_name}`}
                  className="press text-[13px] font-semibold text-accent shrink-0 hidden sm:inline"
                >
                  לנכס
                </Link>
              </div>
            ))}
          </Rows>
        )}
      </Group>
    </div>
  );
}
