'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, ChevronDown, ChevronRight, CircleAlert, Copy, Info,
  Landmark, Sparkles, UserRound,
} from 'lucide-react';
import { ILS, heDate } from '@/lib/format';
import { PROPERTY_STATUS, PROPERTY_TYPES } from '@/lib/domain';
import type { DetectedBuilding, PlannedRow, RowDecision } from '@/lib/import/plan';
import type { EntityOption } from '@/components/ImportWizard';

const inputCls =
  'w-full bg-surface-sunken rounded-xl px-3 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30';
const labelCls = 'block text-[12px] font-medium text-label-secondary mb-1 mr-0.5';

type Filter = 'all' | 'attention' | 'create' | 'skip';

/**
 * The last screen before anything is written.
 *
 * Rows needing attention are first, because a list of 28 correct rows with two
 * broken ones buried in the middle is a list nobody checks. Every value we
 * supplied ourselves is marked, and every value we failed to read is a visible
 * problem rather than a quiet zero.
 */
export default function ImportReview({
  rows, onChange, markPastPaid, onMarkPastPaid,
  buildings, groupBuildings, onGroupBuildings,
  entities, entityChoice, onEntityChoice,
  onBack, onSave,
}: {
  rows: PlannedRow[];
  onChange: (rows: PlannedRow[]) => void;
  markPastPaid: boolean;
  onMarkPastPaid: (v: boolean) => void;
  buildings: DetectedBuilding[];
  groupBuildings: boolean;
  onGroupBuildings: (v: boolean) => void;
  entities: EntityOption[];
  entityChoice: string;
  onEntityChoice: (v: string) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<number | null>(null);
  const [newEntity, setNewEntity] = useState('');

  const counts = useMemo(() => ({
    create: rows.filter((r) => r.decision === 'create').length,
    merge: rows.filter((r) => r.decision === 'merge').length,
    skip: rows.filter((r) => r.decision === 'skip').length,
    errors: rows.filter((r) => r.issues.some((i) => i.level === 'error')).length,
    attention: rows.filter((r) => r.issues.length || r.duplicateOf || r.duplicateOfRow != null).length,
    leases: rows.filter((r) => r.decision === 'create' && r.lease).length,
  }), [rows]);

  const visible = useMemo(() => {
    const ordered = [...rows].sort((a, b) => {
      // Errors first, then anything else worth a look, then the clean rows —
      // in their original order within each band.
      const band = (r: PlannedRow) =>
        r.issues.some((i) => i.level === 'error') ? 0
        : r.issues.length || r.duplicateOf || r.duplicateOfRow != null ? 1 : 2;
      return band(a) - band(b) || a.index - b.index;
    });
    if (filter === 'attention') return ordered.filter((r) => r.issues.length || r.duplicateOf || r.duplicateOfRow != null);
    if (filter === 'create') return ordered.filter((r) => r.decision !== 'skip');
    if (filter === 'skip') return ordered.filter((r) => r.decision === 'skip');
    return ordered;
  }, [rows, filter]);

  const patch = (index: number, fn: (r: PlannedRow) => PlannedRow) =>
    onChange(rows.map((r) => (r.index === index ? fn(r) : r)));

  const setField = (index: number, key: string, value: string) =>
    patch(index, (r) => {
      const property = { ...r.property, [key]: value };
      // Fixing the value the error was about clears that error — and only that
      // one; nothing else is re-judged behind the user's back.
      const issues = value.trim()
        ? r.issues.filter((i) => !(i.field === key && i.level === 'error'))
        : r.issues;
      const stillBlocked = issues.some((i) => i.level === 'error');
      return {
        ...r,
        property,
        issues,
        derived: r.derived.filter((d) => d !== key),
        decision: !stillBlocked && r.decision === 'skip' && !r.duplicateOf && r.duplicateOfRow == null
          ? 'create' : r.decision,
      };
    });

  const setDecision = (index: number, decision: RowDecision) => patch(index, (r) => ({ ...r, decision }));

  const bulk = (decision: RowDecision) =>
    onChange(rows.map((r) =>
      r.issues.some((i) => i.level === 'error') ? r : { ...r, decision },
    ));

  const chip = (f: Filter, label: string, n: number) => (
    <button
      key={f}
      type="button"
      onClick={() => setFilter(f)}
      className={`press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border ${
        filter === f ? 'bg-accent text-white border-accent' : 'bg-surface-sunken text-label-secondary border-separator'
      }`}
    >
      {label}
      <span className={filter === f ? 'opacity-80' : 'text-label-tertiary'}>{n}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-2xl border border-separator p-4">
        <p className="text-[15px] text-label">
          <strong className="font-bold">{counts.create}</strong> נכסים ייווצרו
          {counts.merge > 0 && <> · <strong className="font-bold">{counts.merge}</strong> קיימים יושלמו</>}
          {counts.skip > 0 && <> · <strong className="font-bold">{counts.skip}</strong> ידולגו</>}
        </p>
        {counts.errors > 0 && (
          <p className="text-[13px] text-danger font-medium mt-1.5 flex items-center gap-1.5">
            <CircleAlert size={14} />
            {counts.errors} שורות חסרות מידע חיוני — תקן אותן כאן או שהן ידולגו
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          {chip('all', 'הכל', rows.length)}
          {chip('attention', 'דורש מבט', counts.attention)}
          {chip('create', 'ייובאו', counts.create + counts.merge)}
          {chip('skip', 'ידולגו', counts.skip)}
        </div>

        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-separator">
          <button type="button" onClick={() => bulk('create')} className="press text-[13px] font-medium text-accent px-2 py-1">
            סמן הכל לייבוא
          </button>
          <span className="text-separator">·</span>
          <button type="button" onClick={() => bulk('skip')} className="press text-[13px] font-medium text-label-secondary px-2 py-1">
            נקה הכל
          </button>
        </div>
      </div>

      {counts.leases > 0 && (
        <label className="bg-surface rounded-2xl border border-separator p-4 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={markPastPaid}
            onChange={(e) => onMarkPastPaid(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-[var(--accent,#0a84ff)]"
          />
          <span>
            <span className="block text-[15px] font-medium text-label">
              סמן תשלומים של חודשים שעברו כשולמו
            </span>
            <span className="block text-[13px] text-label-tertiary mt-0.5">
              {counts.leases} חוזים ייווצרו עם לוח תשלומים. בלי זה, כל חודש שכבר עבר יופיע כחוב פתוח.
              החודש הנוכחי תמיד נשאר פתוח.
            </span>
          </span>
        </label>
      )}

      {buildings.length > 0 && (
        <section className="bg-surface rounded-2xl border border-separator overflow-hidden">
          <label className="flex items-start gap-3 p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={groupBuildings}
              onChange={(e) => onGroupBuildings(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-[var(--accent,#0a84ff)]"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[15px] font-medium text-label">
                <Building2 size={15} className="text-accent shrink-0" />
                {buildings.length === 1
                  ? 'זיהינו בניין אחד עם כמה דירות'
                  : `זיהינו ${buildings.length} בניינים עם כמה דירות`}
              </span>
              <span className="block text-[13px] text-label-tertiary mt-0.5">
                הכתובות אומרות קומה ומספר דירה, אז הדירות האלה יקובצו תחת הבניין
                שלהן במסך „אתרים”. כל דירה נשארת נכס נפרד.
              </span>
            </span>
          </label>
          {groupBuildings && (
            <div className="border-t border-separator divide-y divide-separator">
              {buildings.map((b) => (
                <div key={b.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-[14px] text-label truncate" dir="auto">{b.name}</span>
                  <span className="text-[13px] text-label-tertiary shrink-0">
                    {b.rows.length} דירות
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="bg-surface rounded-2xl border border-separator p-4">
        <span className="flex items-center gap-1.5 text-[15px] font-medium text-label">
          <Landmark size={15} className="text-accent shrink-0" />
          על שם מי רשומים הנכסים האלה
        </span>
        <p className="text-[13px] text-label-tertiary mt-0.5 mb-2.5">
          לא חובה. אם הכל על שם אחד אפשר להשאיר „לא לשייך” — ואם יש כמה ישויות,
          בחירה כאן תחסוך שיוך ידני לכל נכס. שורה שהקובץ כבר ציין לה ישות תשמור על שלה.
        </p>
        <select
          aria-label="ישות מחזיקה לכל הנכסים בייבוא"
          value={entityChoice.startsWith('new:') ? '' : entityChoice}
          onChange={(e) => { onEntityChoice(e.target.value); setNewEntity(''); }}
          disabled={newEntity.trim().length > 0}
          className="w-full bg-surface-sunken rounded-xl px-3 py-2.5 text-[15px] text-label outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="">לא לשייך</option>
          {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
        </select>
        <input
          className="w-full bg-surface-sunken rounded-xl px-3 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30 mt-2"
          value={newEntity}
          onChange={(e) => {
            setNewEntity(e.target.value);
            onEntityChoice(e.target.value.trim() ? `new:${e.target.value.trim()}` : '');
          }}
          placeholder="או הקלד שם של ישות חדשה — היא תיווצר בייבוא"
          aria-label="ישות חדשה"
        />
      </section>

      <div className="space-y-2">
        {visible.map((r) => (
          <RowCard
            key={r.index}
            row={r}
            open={open === r.index}
            onToggle={() => setOpen(open === r.index ? null : r.index)}
            onField={(k, v) => setField(r.index, k, v)}
            onDecision={(d) => setDecision(r.index, d)}
          />
        ))}
        {!visible.length && (
          <p className="text-center text-[15px] text-label-tertiary py-8">אין שורות בקטגוריה הזאת</p>
        )}
      </div>

      <div className="flex gap-2 sticky bottom-4">
        <button
          type="button"
          onClick={onSave}
          disabled={counts.create + counts.merge === 0}
          className="press touch-target flex-1 py-3.5 bg-accent text-white text-[16px] font-semibold rounded-xl disabled:opacity-40 shadow-lg shadow-black/10"
        >
          {counts.create + counts.merge === 0
            ? 'אין מה לייבא'
            : `ייבא ${counts.create + counts.merge} נכסים`}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="press touch-target px-5 py-3.5 text-[16px] text-label-secondary font-medium rounded-xl bg-surface"
        >
          חזור
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- a row */

function RowCard({
  row, open, onToggle, onField, onDecision,
}: {
  row: PlannedRow;
  open: boolean;
  onToggle: () => void;
  onField: (key: string, value: string) => void;
  onDecision: (d: RowDecision) => void;
}) {
  const hasError = row.issues.some((i) => i.level === 'error');
  const dup = row.duplicateOf || row.duplicateOfRow != null;
  const p = row.property;

  const tone = hasError
    ? 'border-danger/40 bg-danger-tint/30'
    : dup
      ? 'border-warning/40 bg-warning-tint/25'
      : row.decision === 'skip'
        ? 'border-separator bg-surface-sunken/60 opacity-70'
        : 'border-separator bg-surface';

  return (
    <div className={`rounded-2xl border overflow-hidden ${tone}`}>
      <button type="button" onClick={onToggle} className="press w-full text-right px-4 py-3 flex items-start gap-3">
        <span className="shrink-0 mt-0.5 text-[11px] font-mono text-label-tertiary w-6">{row.sourceRow}</span>

        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className={`text-[16px] font-semibold truncate ${hasError ? 'text-danger' : 'text-label'}`}>
              {p.name || '(ללא שם)'}
            </span>
            {row.decision === 'create' && !hasError && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-success-tint text-success">ייובא</span>
            )}
            {row.decision === 'merge' && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-info-tint text-info">יושלם</span>
            )}
            {row.decision === 'skip' && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-fill text-label-secondary">ידולג</span>
            )}
          </span>

          {(p.buildingName || row.autoBuilding) && (
            <span className="flex items-center gap-1 text-[12px] text-accent mt-0.5">
              <Building2 size={11} className="shrink-0" />
              {p.buildingName ?? row.autoBuilding}
            </span>
          )}

          <span className="block text-[13px] text-label-secondary truncate mt-0.5" dir="auto">
            {[p.address, p.city].filter(Boolean).join(', ') || 'אין כתובת'}
            {p.property_type && ` · ${PROPERTY_TYPES[p.property_type] ?? p.property_type}`}
            {` · ${PROPERTY_STATUS[p.status]?.label ?? p.status}`}
          </span>

          {(row.tenant || row.lease) && (
            <span className="flex items-center gap-1.5 text-[13px] text-label-secondary mt-1">
              <UserRound size={13} className="shrink-0" />
              {row.tenant?.full_name}
              {row.lease && ` · ${ILS(row.lease.monthly_rent)} · עד ${heDate(row.lease.end_date)}`}
            </span>
          )}

          {row.issues.slice(0, open ? 0 : 2).map((i, k) => (
            <span key={k} className={`flex items-start gap-1.5 text-[12px] mt-1 ${
              i.level === 'error' ? 'text-danger font-medium' : i.level === 'warn' ? 'text-warning' : 'text-label-tertiary'
            }`}>
              {i.level === 'info' ? <Info size={12} className="shrink-0 mt-0.5" /> : <AlertTriangle size={12} className="shrink-0 mt-0.5" />}
              {i.text}
            </span>
          ))}

          {!open && row.duplicateOf && (
            <span className="flex items-center gap-1.5 text-[12px] text-warning mt-1">
              <Copy size={12} className="shrink-0" />
              כבר קיים במערכת: {row.duplicateOf.name}
            </span>
          )}
          {!open && row.duplicateOfRow != null && (
            <span className="flex items-center gap-1.5 text-[12px] text-warning mt-1">
              <Copy size={12} className="shrink-0" />
              אותה כתובת מופיעה כבר בקובץ
            </span>
          )}
        </span>

        {open ? <ChevronDown size={17} className="shrink-0 text-label-tertiary mt-1" />
              : <ChevronRight size={17} className="shrink-0 text-label-tertiary mt-1 rotate-180" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-separator pt-3">
          {row.issues.map((i, k) => (
            <p key={k} className={`text-[13px] flex items-start gap-1.5 ${
              i.level === 'error' ? 'text-danger font-medium' : i.level === 'warn' ? 'text-warning' : 'text-label-secondary'
            }`}>
              {i.level === 'info' ? <Info size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
              {i.text}
            </p>
          ))}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="שם הנכס" value={p.name} derived={row.derived.includes('name')} onChange={(v) => onField('name', v)} />
            <Field label="כתובת" value={p.address} derived={false} onChange={(v) => onField('address', v)} />
            <Field label="עיר" value={p.city} derived={row.derived.includes('city')} onChange={(v) => onField('city', v)} />
          </div>

          {row.derived.length > 0 && (
            <p className="text-[12px] text-label-tertiary flex items-start gap-1.5">
              <Sparkles size={12} className="shrink-0 mt-0.5 text-accent" />
              השלמנו בעצמנו: {row.derived.map((d) => DERIVED_LABEL[d] ?? d).join(', ')} — כדאי לאשר
            </p>
          )}

          <details className="text-[12px] text-label-tertiary">
            <summary className="cursor-pointer select-none py-1">מה היה כתוב בשורה בקובץ</summary>
            <p className="mt-1 font-mono break-all" dir="auto">{row.raw.filter(Boolean).join(' | ')}</p>
          </details>

          <div className="flex flex-wrap gap-2 pt-1">
            {(row.duplicateOf
              ? (['create', 'merge', 'skip'] as RowDecision[])
              : (['create', 'skip'] as RowDecision[])
            ).map((d) => (
              <button
                key={d}
                type="button"
                disabled={d !== 'skip' && hasError}
                onClick={() => onDecision(d)}
                className={`press px-3.5 py-2 rounded-full text-[13px] font-medium border disabled:opacity-40 ${
                  row.decision === d ? 'bg-accent text-white border-accent' : 'bg-surface-sunken text-label-secondary border-separator'
                }`}
              >
                {d === 'create' ? 'צור נכס חדש' : d === 'merge' ? 'השלם את הקיים' : 'דלג'}
              </button>
            ))}
          </div>
          {row.duplicateOf && (
            <p className="text-[12px] text-label-tertiary">
              „השלם את הקיים” ממלא רק שדות שריקים היום ב־{row.duplicateOf.name}. שום ערך קיים לא יידרס.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const DERIVED_LABEL: Record<string, string> = {
  name: 'שם הנכס',
  city: 'העיר',
  status: 'הסטטוס',
  property_type: 'סוג הנכס',
  lease_end: 'תאריך סיום החוזה',
  floor_no: 'הקומה (מתוך הכתובת)',
  payment_day: 'יום התשלום',
  asking_rent: 'שכר הדירה המבוקש',
};

function Field({
  label, value, derived, onChange,
}: {
  label: string;
  value: string;
  derived: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {derived && <span className="text-accent font-normal"> · הושלם אוטומטית</span>}
      </label>
      <input
        dir="auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} ${derived ? 'ring-1 ring-accent/30' : ''} ${!value.trim() ? 'ring-1 ring-danger/50' : ''}`}
      />
    </div>
  );
}
