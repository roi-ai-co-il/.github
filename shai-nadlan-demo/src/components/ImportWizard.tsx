'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, Check, ChevronRight, ClipboardPaste, FileSpreadsheet,
  Loader2, Sparkles, Undo2, UploadCloud,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { readFile, readPaste, ImportReadError, type Source } from '@/lib/import/read-source';
import { buildGrid, type Grid } from '@/lib/import/grid';
import { autoMap, setMapping, type ColumnMapping } from '@/lib/import/match';
import { buildPlan, type DetectedBuilding, type ExistingProperty, type PlannedRow } from '@/lib/import/plan';
import { undoImport, writeImport, type WriteResult } from '@/lib/import/write';
import ImportMapping from '@/components/ImportMapping';
import ImportReview from '@/components/ImportReview';

type Step = 'source' | 'sheet' | 'map' | 'review' | 'saving' | 'done';

export interface EntityOption { id: string; name: string }

export interface RecentBatch {
  id: string;
  created_at: string;
  filename: string | null;
  source: string;
  counts: Record<string, number> | null;
}

/**
 * The import, end to end.
 *
 * The shape of the screen is the shape of the promise: nothing is written until
 * the user has SEEN every row that is about to be written, and once it is
 * written it can be taken back in one action.
 */
export default function ImportWizard({
  existing,
  entities,
  recent,
}: {
  existing: ExistingProperty[];
  entities: EntityOption[];
  recent: RecentBatch[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('source');
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState<number | undefined>(undefined);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rows, setRows] = useState<PlannedRow[]>([]);
  const [markPastPaid, setMarkPastPaid] = useState(true);
  const [buildings, setBuildings] = useState<DetectedBuilding[]>([]);
  const [groupBuildings, setGroupBuildings] = useState(true);
  /* '' = do not assign, an id = an existing entity, 'new:NAME' = create it. */
  const [entityChoice, setEntityChoice] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<WriteResult | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [batches, setBatches] = useState(recent);

  const grid: Grid | null = useMemo(() => {
    if (!source) return null;
    return buildGrid(source.sheets[sheetIndex]?.rows ?? [], headerRow);
  }, [source, sheetIndex, headerRow]);

  /* ---------------------------------------------------------- taking input */

  const accept = useCallback((s: Source) => {
    setError(null);
    if (!s.sheets.length || !s.sheets.some((sh) => sh.rows.length)) {
      setError('לא מצאנו טבלה בקובץ הזה.');
      return;
    }
    setSource(s);
    setSheetIndex(0);
    setHeaderRow(undefined);
    // A workbook with more than one sheet is a question, not a guess.
    setStep(s.sheets.filter((sh) => sh.rows.length).length > 1 ? 'sheet' : 'map');
  }, []);

  const takeFile = useCallback(async (file: File) => {
    try { accept(await readFile(file)); }
    catch (e) {
      setError(e instanceof ImportReadError ? e.message : 'לא הצלחנו לקרוא את הקובץ.');
    }
  }, [accept]);

  // A paste anywhere on the first screen works, which is how most people will
  // actually arrive here: select in Excel, ⌘C, ⌘V.
  useEffect(() => {
    if (step !== 'source') return;
    const onPaste = (e: ClipboardEvent) => {
      const s = readPaste(e.clipboardData);
      if (!s) return;
      e.preventDefault();
      accept(s);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [step, accept]);

  /* ------------------------------------------------------------ auto-map */

  useEffect(() => {
    if (step !== 'map' || !grid) return;
    setMappings(autoMap(grid.headers, grid.body).mappings);
  }, [step, grid]);

  const toReview = useCallback(() => {
    if (!grid) return;
    const plan = buildPlan({
      headers: grid.headers,
      body: grid.body,
      headerRow: grid.headerRow,
      mappings,
      existing,
    });
    setRows(plan.rows);
    setBuildings(plan.detectedBuildings);
    setStep('review');
  }, [grid, mappings, existing]);

  /* --------------------------------------------------------------- saving */

  const save = useCallback(async () => {
    setStep('saving');
    setError(null);
    try {
      const res = await writeImport(createClient(), rows, {
        source: source?.kind ?? 'file',
        filename: source?.filename ?? null,
        markPastPaid,
        groupBuildings,
        entity: entityChoice.startsWith('new:')
          ? { newName: entityChoice.slice(4) }
          : entityChoice ? { id: entityChoice } : null,
        onProgress: setProgress,
      });
      setResult(res);
      setStep('done');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הייבוא נכשל.');
      setStep('review');
    }
  }, [rows, source, markPastPaid, groupBuildings, entityChoice, router]);

  const doUndo = useCallback(async (batchId: string) => {
    try {
      await undoImport(createClient(), batchId);
      setBatches((b) => b.filter((x) => x.id !== batchId));
      if (result?.batchId === batchId) { setResult(null); setStep('source'); setSource(null); }
      toast('הייבוא בוטל — הכל חזר לקדמותו');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ביטול הייבוא נכשל.');
    } finally {
      setUndoing(null);
    }
  }, [result, router, toast]);

  /* ------------------------------------------------------------------ UI */

  const willCreate = rows.filter((r) => r.decision === 'create').length;
  const willMerge = rows.filter((r) => r.decision === 'merge').length;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-8">
      <header>
        <Link href="/properties" className="press inline-flex items-center gap-0.5 text-[15px] font-medium text-accent -mr-1">
          <ChevronRight size={18} strokeWidth={2.5} />
          <span>נכסים</span>
        </Link>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight mt-2">ייבוא נכסים</h1>
        <p className="text-[14px] text-label-secondary mt-1">
          קובץ אקסל, CSV, או פשוט להדביק טבלה. נזהה לבד מה כל עמודה, ותראה כל שורה לפני ששומרים.
        </p>
      </header>

      <Steps step={step} />

      {error && (
        <p role="alert" className="text-[14px] font-medium text-danger bg-danger-tint rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={17} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}

      {step === 'source' && (
        <SourceStep onFile={takeFile} onPaste={accept} batches={batches} onUndo={setUndoing} />
      )}

      {step === 'sheet' && source && (
        <SheetStep
          source={source}
          onPick={(i) => { setSheetIndex(i); setStep('map'); }}
        />
      )}

      {step === 'map' && grid && (
        <ImportMapping
          grid={grid}
          mappings={mappings}
          onChange={(col, field) => setMappings((m) => setMapping(m, col, field))}
          onHeaderRow={(i) => setHeaderRow(i)}
          onBack={() => { setSource(null); setStep('source'); }}
          onNext={toReview}
        />
      )}

      {step === 'review' && (
        <ImportReview
          rows={rows}
          onChange={setRows}
          markPastPaid={markPastPaid}
          onMarkPastPaid={setMarkPastPaid}
          buildings={buildings}
          groupBuildings={groupBuildings}
          onGroupBuildings={setGroupBuildings}
          entities={entities}
          entityChoice={entityChoice}
          onEntityChoice={setEntityChoice}
          onBack={() => setStep('map')}
          onSave={save}
        />
      )}

      {step === 'saving' && (
        <div className="bg-surface rounded-2xl border border-separator p-8 text-center">
          <Loader2 size={30} className="animate-spin text-accent mx-auto" />
          <p className="text-[16px] font-semibold text-label mt-3">{progress || 'שומר…'}</p>
          <p className="text-[13px] text-label-tertiary mt-1">
            {willCreate} נכסים{willMerge ? ` · ${willMerge} עדכונים` : ''} — אל תסגור את החלון
          </p>
        </div>
      )}

      {step === 'done' && result && (
        <DoneStep result={result} onUndo={() => setUndoing(result.batchId)} />
      )}

      <ConfirmDialog
        open={!!undoing}
        title="לבטל את הייבוא?"
        message="כל הנכסים, השוכרים והחוזים שנוצרו בייבוא הזה יימחקו. ישויות ובניינים שנוצרו יישארו, כי ייתכן שנכסים אחרים כבר משויכים אליהם."
        confirmLabel="בטל את הייבוא"
        danger
        onConfirm={() => undoing && doUndo(undoing)}
        onCancel={() => setUndoing(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ steps */

function Steps({ step }: { step: Step }) {
  const order: Step[] = ['source', 'map', 'review', 'done'];
  const labels: Record<string, string> = { source: 'הקובץ', map: 'העמודות', review: 'בדיקה', done: 'סיום' };
  const current = step === 'sheet' ? 0 : step === 'saving' ? 2 : order.indexOf(step);
  return (
    <ol className="flex items-center gap-1.5 text-[13px]" aria-label="שלבי הייבוא">
      {order.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo';
        return (
          <li key={s} className="flex items-center gap-1.5">
            <span
              aria-current={state === 'now' ? 'step' : undefined}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${
                state === 'done' ? 'bg-success-tint text-success'
                : state === 'now' ? 'bg-accent text-white'
                : 'bg-surface-sunken text-label-tertiary'
              }`}
            >
              {state === 'done' && <Check size={13} strokeWidth={3} />}
              {labels[s]}
            </span>
            {i < order.length - 1 && <span className="w-4 h-px bg-separator" />}
          </li>
        );
      })}
    </ol>
  );
}

function SourceStep({
  onFile, onPaste, batches, onUndo,
}: {
  onFile: (f: File) => void;
  onPaste: (s: Source) => void;
  batches: RecentBatch[];
  onUndo: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 md:p-12 text-center transition-colors ${
          over ? 'border-accent bg-accent-tint' : 'border-separator bg-surface'
        }`}
      >
        <UploadCloud size={38} className={over ? 'text-accent mx-auto' : 'text-label-tertiary mx-auto'} strokeWidth={1.5} />
        <p className="text-[17px] font-semibold text-label mt-3">גרור לכאן קובץ</p>
        <p className="text-[13px] text-label-secondary mt-1">‎.xlsx · ‎.csv — או פשוט הדבק כאן טבלה מאקסל (⌘V)</p>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="press touch-target inline-flex items-center gap-2 px-5 py-3 bg-accent text-white font-semibold text-[15px] rounded-2xl"
          >
            <FileSpreadsheet size={17} strokeWidth={2.2} />
            בחר קובץ
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="press touch-target inline-flex items-center gap-2 px-5 py-3 bg-surface-sunken text-label font-semibold text-[15px] rounded-2xl"
          >
            <ClipboardPaste size={17} strokeWidth={2.2} />
            הדבק טבלה
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
        />
      </div>

      {pasteOpen && (
        <div className="bg-surface rounded-2xl border border-separator p-4 space-y-3">
          <label htmlFor="paste-box" className="block text-[13px] font-medium text-label-secondary mr-1">
            הדבק כאן — סמן את הטבלה באקסל, העתק, והדבק בתיבה
          </label>
          <textarea
            id="paste-box"
            dir="auto"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onPaste={(e) => {
              const s = readPaste(e.clipboardData);
              if (s) { e.preventDefault(); onPaste(s); }
            }}
            className="w-full min-h-[140px] bg-surface-sunken rounded-xl px-4 py-3 text-[15px] font-mono outline-none focus:ring-2 focus:ring-accent/30"
            placeholder={'כתובת\tעיר\tשוכר\tשכר דירה\nרוטשילד 12\tתל אביב\tדנה כהן\t5400'}
          />
          <button
            type="button"
            disabled={!pasteText.trim()}
            onClick={() => { const s = readPaste(null, pasteText); if (s) onPaste(s); }}
            className="press touch-target px-5 py-2.5 bg-accent text-white font-semibold text-[15px] rounded-xl disabled:opacity-40"
          >
            המשך
          </button>
        </div>
      )}

      <div className="bg-info-tint rounded-2xl p-4 flex items-start gap-2.5">
        <Sparkles size={17} className="text-info shrink-0 mt-0.5" />
        <p className="text-[13px] text-label-secondary leading-relaxed">
          לא צריך להתאים את הקובץ אלינו. הכותרות יכולות להיות בעברית או באנגלית, בכל סדר —
          ואם אין כותרות בכלל, נזהה את העמודות לפי מה שכתוב בהן.
        </p>
      </div>

      {batches.length > 0 && (
        <section>
          <h2 className="text-[15px] font-bold text-label tracking-tight px-1 mb-2">ייבואים אחרונים</h2>
          <div className="bg-surface rounded-2xl border border-separator divide-y divide-separator overflow-hidden">
            {batches.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-label truncate">
                    {b.filename ?? 'טבלה שהודבקה'}
                  </p>
                  <p className="text-[12px] text-label-tertiary">
                    {new Date(b.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    {b.counts?.properties != null && ` · ${b.counts.properties} נכסים`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onUndo(b.id)}
                  className="press touch-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[14px] font-medium text-danger bg-danger-tint"
                >
                  <Undo2 size={15} strokeWidth={2.2} />
                  בטל
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SheetStep({ source, onPick }: { source: Source; onPick: (i: number) => void }) {
  return (
    <div className="bg-surface rounded-2xl border border-separator overflow-hidden">
      <p className="px-4 py-3 text-[14px] text-label-secondary border-b border-separator">
        בקובץ יש כמה גיליונות. איזה מהם מכיל את הנכסים?
      </p>
      <div className="divide-y divide-separator">
        {source.sheets.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            disabled={!s.rows.length}
            className="press w-full flex items-center gap-3 px-4 py-3.5 text-right disabled:opacity-40"
          >
            <FileSpreadsheet size={18} className="text-label-tertiary shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-medium text-label truncate">{s.name}</span>
              <span className="block text-[12px] text-label-tertiary">
                {s.rows.length ? `${s.rows.length} שורות` : 'ריק'}
              </span>
            </span>
            <ArrowLeft size={17} className="text-label-tertiary shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

function DoneStep({ result, onUndo }: { result: WriteResult; onUndo: () => void }) {
  const line = (n: number, one: string, many: string) =>
    n === 0 ? null : `${n} ${n === 1 ? one : many}`;
  const parts = [
    line(result.properties, 'נכס', 'נכסים'),
    line(result.tenants, 'שוכר', 'שוכרים'),
    line(result.leases, 'חוזה', 'חוזים'),
    line(result.payments, 'תשלום', 'תשלומים'),
    line(result.entities, 'ישות', 'ישויות'),
    line(result.buildings, 'בניין', 'בניינים'),
    line(result.merged, 'נכס הושלם', 'נכסים הושלמו'),
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-2xl border border-separator p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-success-tint text-success flex items-center justify-center mx-auto">
          <Check size={28} strokeWidth={2.5} />
        </div>
        <h2 className="text-[22px] font-bold text-label mt-3">הייבוא הסתיים</h2>
        <p className="text-[15px] text-label-secondary mt-1.5">נוצרו {parts.join(' · ')}</p>
        {result.skipped > 0 && (
          <p className="text-[13px] text-label-tertiary mt-1">{result.skipped} שורות דולגו לפי בחירתך</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
          <Link href="/properties" className="press touch-target px-5 py-3 bg-accent text-white font-semibold text-[15px] rounded-2xl">
            לרשימת הנכסים
          </Link>
          <button
            type="button"
            onClick={onUndo}
            className="press touch-target inline-flex items-center gap-2 px-5 py-3 bg-surface-sunken text-label-secondary font-semibold text-[15px] rounded-2xl"
          >
            <Undo2 size={16} strokeWidth={2.2} />
            בטל את הייבוא
          </button>
        </div>
      </div>
      <p className="text-[13px] text-label-tertiary text-center px-4">
        אפשר לבטל את הייבוא גם מאוחר יותר — הוא יופיע ברשימת הייבואים במסך הזה.
      </p>
    </div>
  );
}
