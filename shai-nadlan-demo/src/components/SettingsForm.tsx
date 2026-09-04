'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, BellRing, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Group, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';

export interface SettingsRow {
  recipient: string;
  sender: string;
  enabled: boolean;
  greeting_name: string;
  send_dow: number;
  lease_notice_days: number;
  insurance_notice_days: number;
  last_sent_at: string | null;
  last_status: string | null;
}

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** The address is checked here rather than only by the server, because the
 *  server's answer arrives a week later: a typo'd domain is accepted by the
 *  mail API with a 200 and simply never lands. */
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block px-4 py-3.5">
      <span className="block text-[13px] font-semibold text-label-secondary mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[12.5px] text-label-tertiary mt-1.5">{hint}</span>}
    </label>
  );
}

const input =
  'w-full bg-surface-sunken rounded-xl px-3.5 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30';

export default function SettingsForm({ settings }: { settings: SettingsRow | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [name, setName] = useState(settings?.greeting_name ?? '');
  const [to, setTo] = useState(settings?.recipient ?? '');
  const [enabled, setEnabled] = useState(settings?.enabled ?? true);
  const [dow, setDow] = useState(settings?.send_dow ?? 0);
  const [leaseDays, setLeaseDays] = useState(String(settings?.lease_notice_days ?? 90));
  const [insDays, setInsDays] = useState(String(settings?.insurance_notice_days ?? 30));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!settings) {
    return (
      <div className="space-y-5">
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">הגדרות</h1>
        <Group><EmptyState icon={BellRing} text="לא הצלחנו לטעון את ההגדרות — רענן את הדף" /></Group>
      </div>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!looksLikeEmail(to)) { setError('כתובת המייל לא נראית תקינה'); return; }
    const ld = Number(leaseDays), idd = Number(insDays);
    /* Number('') is 0 and Number('abc') is NaN — both would sail through a
       plain `|| default`, so each is checked explicitly against its range. */
    if (!Number.isFinite(ld) || ld < 7 || ld > 365) { setError('התרעת חוזה חייבת להיות בין 7 ל־365 ימים'); return; }
    if (!Number.isFinite(idd) || idd < 7 || idd > 365) { setError('התרעת ביטוח חייבת להיות בין 7 ל־365 ימים'); return; }

    setSaving(true);
    const { error: upErr } = await supabase
      .from('digest_settings')
      .update({
        greeting_name: name.trim() || 'שי',
        recipient: to.trim(),
        enabled,
        send_dow: dow,
        lease_notice_days: ld,
        insurance_notice_days: idd,
      })
      .eq('id', true);
    setSaving(false);

    if (upErr) { setError('השמירה נכשלה — נסה שוב'); return; }
    toast('ההגדרות נשמרו');
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">הגדרות</h1>
        <p className="text-[13px] text-label-tertiary mt-0.5">המייל השבועי וההתרעות</p>
      </div>

      <Group title="המייל השבועי">
        <div className="divide-y divide-separator">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-label">שליחה שבועית</p>
              <p className="text-[12.5px] text-label-tertiary mt-0.5">
                {enabled ? 'נשלח אוטומטית ב־07:00' : 'כרגע כבוי — לא יישלח כלום'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="שליחה שבועית"
              onClick={() => setEnabled((v) => !v)}
              className={`shrink-0 w-[52px] h-[31px] rounded-full p-[2px] transition-colors ${enabled ? 'bg-success' : 'bg-fill'}`}
            >
              <span className={`block w-[27px] h-[27px] rounded-full bg-white shadow transition-transform ${enabled ? '-translate-x-[21px]' : ''}`} />
            </button>
          </div>

          <Field label="לאיזו כתובת" hint="לשם נשלח הסיכום כל שבוע">
            <input value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" type="email"
              inputMode="email" autoComplete="email" className={`${input} text-start`} />
          </Field>

          <Field label="באיזה יום">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDow(i)}
                  aria-pressed={dow === i}
                  className={`press rounded-full px-3 py-1.5 text-[13px] font-medium ${
                    dow === i ? 'bg-accent text-white' : 'bg-fill text-label-secondary'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>

          <Field label="איך לפנות אליך" hint='מופיע בפתיחה: „בוקר טוב, ..."'>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שי" className={input} />
          </Field>
        </div>
      </Group>

      <Group title="מתי להתריע">
        <div className="divide-y divide-separator">
          <Field label="חוזה שמסתיים — כמה ימים מראש" hint="ברירת מחדל: 90">
            <input value={leaseDays} onChange={(e) => setLeaseDays(e.target.value)}
              inputMode="numeric" dir="ltr" className={`${input} text-start`} />
          </Field>
          <Field label="ביטוח שפג — כמה ימים מראש" hint="ברירת מחדל: 30. נכס בלי תאריך ביטוח לא מתריע בכלל.">
            <input value={insDays} onChange={(e) => setInsDays(e.target.value)}
              inputMode="numeric" dir="ltr" className={`${input} text-start`} />
          </Field>
        </div>
      </Group>

      {settings.last_sent_at && (
        <p className="text-[12.5px] text-label-tertiary px-1 flex items-center gap-1.5">
          <Mail size={14} strokeWidth={2} />
          נשלח לאחרונה {new Intl.DateTimeFormat('he-IL', {
            timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          }).format(new Date(settings.last_sent_at))}
        </p>
      )}

      {error && <p className="text-[13px] text-danger font-medium px-1">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="press w-full flex items-center justify-center gap-2 rounded-2xl bg-accent text-white px-4 py-3.5 text-[16px] font-semibold disabled:opacity-40"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.5} />}
        <span>שמירה</span>
      </button>

      <p className="text-[12px] text-label-tertiary px-1 leading-relaxed">
        כתובת השולח קבועה ({settings.sender}) — היא חייבת להישאר דומיין מאומת, אחרת המייל פשוט לא יגיע ובלי שום הודעת שגיאה.
      </p>
    </form>
  );
}
