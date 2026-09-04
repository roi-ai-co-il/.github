'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, CircleHelp, Table2, Wand2 } from 'lucide-react';
import { FIELDS, FIELD_BY_KEY, GROUP_LABEL, REQUIRED_PROPERTY_FIELDS, type FieldGroup } from '@/lib/import/fields';
import type { Grid } from '@/lib/import/grid';
import type { ColumnMapping } from '@/lib/import/match';

const BASIS_LABEL: Record<string, string> = {
  header: 'לפי שם העמודה',
  values: 'לפי התוכן',
  both: 'לפי השם והתוכן',
  manual: 'נבחר על ידך',
  none: '',
};

/**
 * The mapping screen.
 *
 * Its job is not to hide the guesswork but to show it: every column says what
 * it was mapped to AND on what evidence, so a wrong guess is visible at a
 * glance instead of being discovered three screens later.
 */
export default function ImportMapping({
  grid, mappings, onChange, onHeaderRow, onBack, onNext,
}: {
  grid: Grid;
  mappings: ColumnMapping[];
  onChange: (column: number, fieldKey: string | null) => void;
  onHeaderRow: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [showHeaderPicker, setShowHeaderPicker] = useState(false);

  const mappedKeys = useMemo(
    () => new Set(mappings.map((m) => m.fieldKey).filter(Boolean) as string[]),
    [mappings],
  );
  const missingRequired = REQUIRED_PROPERTY_FIELDS.filter((k) => !mappedKeys.has(k));
  // A missing city or name is recoverable — the plan derives them and says so.
  // A missing ADDRESS is not: there is nothing to derive one from.
  const blocked = !mappedKeys.has('address');

  const sample = (col: number) =>
    grid.body.slice(0, 3).map((r) => (r[col] ?? '').trim()).filter(Boolean).join(' · ') || '—';

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-2xl border border-separator overflow-hidden">
        <header className="px-4 py-3 border-b border-separator flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-label">מה יש בכל עמודה</h2>
            <p className="text-[12px] text-label-tertiary mt-0.5">
              {grid.body.length} שורות ·{' '}
              {grid.headerEvidence === 'none'
                ? 'אין כותרות בקובץ — זיהינו לפי התוכן'
                : 'זיהינו לבד, אפשר לתקן כל עמודה'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHeaderPicker((v) => !v)}
            className="press shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium text-accent bg-accent-tint"
          >
            <Table2 size={15} strokeWidth={2.2} />
            שורת הכותרות
          </button>
        </header>

        {showHeaderPicker && (
          <div className="px-4 py-3 border-b border-separator bg-surface-sunken">
            <p className="text-[13px] text-label-secondary mb-2">
              {grid.headerEvidence === 'detected'
                ? 'זיהינו שהכותרות נמצאות בשורה המסומנת. אם טעינו, בחר את הנכונה:'
                : 'לא נראה שיש כאן שורת כותרות, אז כל השורות נחשבות נתונים. אם יש כותרות, בחר את השורה:'}
            </p>
            <button
              type="button"
              onClick={() => { onHeaderRow(-1); setShowHeaderPicker(false); }}
              className={`press w-full text-right px-3 py-2 rounded-xl text-[13px] mb-1.5 border ${
                grid.headerRow < 0
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-label-secondary border-separator'
              }`}
            >
              אין שורת כותרות — כל השורות הן נתונים
            </button>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {grid.rows.slice(0, 12).map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onHeaderRow(i); setShowHeaderPicker(false); }}
                  className={`press w-full text-right px-3 py-2 rounded-xl text-[13px] truncate border ${
                    i === grid.headerRow
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface text-label-secondary border-separator'
                  }`}
                >
                  <span className="opacity-60 ms-2">{i + 1}.</span>
                  {r.filter(Boolean).slice(0, 6).join(' · ') || '(שורה ריקה)'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="divide-y divide-separator">
          {mappings.map((m) => {
            const field = m.fieldKey ? FIELD_BY_KEY.get(m.fieldKey) : null;
            return (
              <div key={m.column} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="min-w-0 sm:w-[38%]">
                  <p className="text-[15px] font-semibold text-label truncate">{m.header}</p>
                  <p className="text-[12px] text-label-tertiary truncate" dir="auto">{sample(m.column)}</p>
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <ArrowLeft size={15} className="text-label-tertiary shrink-0 hidden sm:block" />
                  <select
                    aria-label={`השדה שאליו ממופה ${m.header}`}
                    value={m.fieldKey ?? ''}
                    onChange={(e) => onChange(m.column, e.target.value || null)}
                    className={`flex-1 min-w-0 bg-surface-sunken rounded-xl px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-accent/30 ${
                      m.fieldKey ? 'text-label' : 'text-label-tertiary'
                    }`}
                  >
                    <option value="">לא לייבא את העמודה הזאת</option>
                    {(['property', 'tenant', 'lease'] as FieldGroup[]).map((g) => (
                      <optgroup key={g} label={GROUP_LABEL[g]}>
                        {FIELDS.filter((f) => f.group === g).map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="sm:w-[22%] shrink-0">
                  {field && m.basis !== 'manual' && (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${
                      m.confidence >= 0.6 ? 'text-success bg-success-tint' : 'text-warning bg-warning-tint'
                    }`}>
                      <Wand2 size={11} strokeWidth={2.4} />
                      {BASIS_LABEL[m.basis]}
                    </span>
                  )}
                  {field && m.basis === 'manual' && (
                    <span className="text-[11px] font-medium text-label-tertiary px-2 py-1">{BASIS_LABEL.manual}</span>
                  )}
                  {field?.hint && m.basis !== 'none' && (
                    <p className="text-[11px] text-label-tertiary mt-1 flex items-start gap-1">
                      <CircleHelp size={11} className="shrink-0 mt-0.5" />
                      {field.hint}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {missingRequired.length > 0 && (
        <p className={`text-[13px] rounded-xl px-4 py-3 ${blocked ? 'bg-danger-tint text-danger font-medium' : 'bg-warning-tint text-label-secondary'}`}>
          {blocked
            ? 'חייבים למפות עמודת כתובת — בלעדיה אי אפשר ליצור נכס.'
            : `לא מופו: ${missingRequired.map((k) => FIELD_BY_KEY.get(k)?.label).join(', ')}. נשלים אותם מהכתובת ונסמן כל השלמה כזאת במסך הבא.`}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onNext}
          disabled={blocked}
          className="press touch-target flex-1 inline-flex items-center justify-center gap-2 py-3.5 bg-accent text-white text-[16px] font-semibold rounded-xl disabled:opacity-40"
        >
          המשך לבדיקה
          <ChevronRight size={17} strokeWidth={2.5} className="rotate-180" />
        </button>
        <button
          type="button"
          onClick={onBack}
          className="press touch-target px-5 py-3.5 text-[16px] text-label-secondary font-medium rounded-xl bg-surface-sunken"
        >
          קובץ אחר
        </button>
      </div>
    </div>
  );
}
