'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, FilePlus2, Loader2, Trash2, Download, ExternalLink,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { heDate } from '@/lib/format';
import { Group, Rows, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/ConfirmDialog';

export interface DocRow {
  id: string;
  title: string;
  doc_type: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  doc_date: string | null;
  created_at: string;
}

const MAX_FILE_MB = 20;

/** The same closed list the CHECK constraint enforces. Kept in one place so a
 *  value can never exist in the picker that the database would refuse. */
const DOC_TYPES = ['חוזה', 'קבלה', 'ארנונה', 'שמאות', 'ביטוח', 'אישור', 'אחר'] as const;

const TYPE_TONE: Record<string, string> = {
  'חוזה': 'text-accent bg-accent-tint',
  'קבלה': 'text-success bg-success-tint',
  'ארנונה': 'text-warning bg-warning-tint',
  'שמאות': 'text-info bg-info-tint',
  'ביטוח': 'text-info bg-info-tint',
  'אישור': 'text-label-secondary bg-fill',
  'אחר': 'text-label-secondary bg-fill',
};

/** Guess the category from the filename so the common case needs no thought.
 *  Deliberately conservative: anything unrecognised stays 'אחר' rather than
 *  being filed under a category it may not belong to. */
function guessType(filename: string): string {
  const n = filename.toLowerCase();
  if (/חוזה|contract|lease|שכירות/.test(n)) return 'חוזה';
  if (/קבלה|receipt|invoice|חשבונית/.test(n)) return 'קבלה';
  if (/ארנונה|arnona|municipal/.test(n)) return 'ארנונה';
  if (/שמאות|שמאי|appraisal|valuation/.test(n)) return 'שמאות';
  if (/ביטוח|insurance|policy/.test(n)) return 'ביטוח';
  if (/אישור|approval|certificate/.test(n)) return 'אישור';
  return 'אחר';
}

function prettySize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Strip the extension for the display title — the type chip already says what
 *  kind of file it is, and ".pdf" in every row is noise. */
function titleFromFilename(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).trim() || name;
}

export default function PropertyDocuments({
  propertyId, documents,
}: { propertyId: string; documents: DocRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocRow | null>(null);

  const supabase = createClient();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('צריך להתחבר מחדש');

      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          throw new Error(`"${file.name}" גדול מדי (מקסימום ${MAX_FILE_MB}MB)`);
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const path = `${user.id}/${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('property-documents')
          .upload(path, file, { contentType: file.type || undefined });
        if (upErr) throw new Error('העלאת המסמך נכשלה — נסה שוב');

        const { error: insErr } = await supabase.from('property_documents').insert({
          property_id: propertyId,
          title: titleFromFilename(file.name),
          doc_type: guessType(file.name),
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (insErr) {
          // Do not leave the file orphaned in the bucket if the row failed.
          await supabase.storage.from('property-documents').remove([path]);
          throw new Error('שמירת המסמך נכשלה — נסה שוב');
        }
      }
      toast(files.length > 1 ? `${files.length} מסמכים נוספו` : 'המסמך נוסף');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'משהו השתבש');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  /** The bucket is private, so there is no permanent URL to link to — a fresh
   *  short-lived signed link is minted per click. */
  async function open(doc: DocRow) {
    setBusyId(doc.id);
    setError(null);
    const { data, error: sErr } = await supabase.storage
      .from('property-documents')
      .createSignedUrl(doc.storage_path, 120);
    setBusyId(null);
    if (sErr || !data?.signedUrl) {
      setError('לא הצלחנו לפתוח את המסמך — נסה שוב');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function changeType(doc: DocRow, doc_type: string) {
    setBusyId(doc.id);
    const { error: uErr } = await supabase
      .from('property_documents').update({ doc_type }).eq('id', doc.id);
    setBusyId(null);
    if (uErr) { setError('עדכון הסוג נכשל'); return; }
    router.refresh();
  }

  async function reallyDelete(doc: DocRow) {
    setPendingDelete(null);
    setBusyId(doc.id);
    const { error: dErr } = await supabase
      .from('property_documents').delete().eq('id', doc.id);
    if (!dErr) await supabase.storage.from('property-documents').remove([doc.storage_path]);
    setBusyId(null);
    if (dErr) { setError('מחיקת המסמך נכשלה'); return; }
    toast('המסמך נמחק');
    router.refresh();
  }

  return (
    <Group
      title="מסמכים"
      action={
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="press flex items-center gap-1.5 text-[13px] font-semibold text-accent disabled:opacity-50"
        >
          {uploading
            ? <Loader2 size={15} className="animate-spin" />
            : <FilePlus2 size={15} strokeWidth={2.4} />}
          <span>{uploading ? 'מעלה…' : 'הוסף'}</span>
        </button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && (
        <p className="px-4 py-2.5 text-[13px] text-danger bg-danger-tint">{error}</p>
      )}

      {documents.length === 0 ? (
        <EmptyState icon={FileText} text="עדיין אין מסמכים — חוזה, קבלה או אישור" />
      ) : (
        <Rows>
          {documents.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => open(d)}
                disabled={busyId === d.id}
                className="press-row flex-1 min-w-0 flex items-center gap-3 -m-1 p-1 rounded-lg text-start"
              >
                {busyId === d.id
                  ? <Loader2 size={18} className="animate-spin shrink-0 text-label-tertiary" />
                  : <FileText size={18} strokeWidth={2} className="shrink-0 text-label-tertiary" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[15px] text-label truncate">{d.title}</span>
                  <span className="block text-[13px] text-label-secondary truncate mt-0.5">
                    {[d.doc_date ? heDate(d.doc_date) : heDate(d.created_at), prettySize(d.size_bytes)]
                      .filter(Boolean).join(' · ')}
                  </span>
                </span>
                <ExternalLink size={15} className="shrink-0 text-label-tertiary" />
              </button>

              <select
                value={d.doc_type}
                onChange={(e) => changeType(d, e.target.value)}
                disabled={busyId === d.id}
                aria-label={`סוג המסמך ${d.title}`}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold border-0 appearance-none text-center ${TYPE_TONE[d.doc_type] ?? TYPE_TONE['אחר']}`}
              >
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>

              <button
                type="button"
                onClick={() => setPendingDelete(d)}
                disabled={busyId === d.id}
                aria-label={`מחק את ${d.title}`}
                className="press touch-target shrink-0 rounded-full text-label-tertiary hover:text-danger"
              >
                <Trash2 size={17} strokeWidth={2} />
              </button>
            </div>
          ))}
        </Rows>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="למחוק את המסמך?"
        message={pendingDelete ? `"${pendingDelete.title}" יימחק לצמיתות. הפעולה אינה הפיכה.` : undefined}
        confirmLabel="מחק"
        danger
        onConfirm={() => pendingDelete && reallyDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </Group>
  );
}
