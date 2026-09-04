'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, X, Search, ChevronRight, ChevronLeft, Phone, User, Building2, FileText,
  LayoutGrid, Plus, Wallet, Landmark, KeyRound, CalendarClock, PieChart, Send, CircleDollarSign,
  History, FolderOpen, CalendarDays, CircleCheck, Users, Building, UserRound,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WhatsAppIcon } from '@/components/ContactButtons';
import { ILS, heDate, daysUntil, waLink } from '@/lib/format';
import { PROPERTY_TYPES, PROPERTY_STATUS, leaseUrgency, URGENCY_STYLE } from '@/lib/domain';

// ─────────────────────────────────────────────────────────────
// Hebrew-tolerant matching (the pattern proven in AB ERP's assistant):
// fold niqqud, geresh/gershayim, punctuation and final letters on both
// sides, then score word-prefix matches above loose substring hits.
// ─────────────────────────────────────────────────────────────
const FINALS: Record<string, string> = { 'ם': 'מ', 'ן': 'נ', 'ץ': 'צ', 'ף': 'פ', 'ך': 'כ' };

function normalize(s?: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[׳״"'`]/g, '')
    .replace(/[-–—_.,()/\\]/g, ' ')
    .replace(/[םןץףך]/g, (c) => FINALS[c])
    .replace(/\s+/g, ' ')
    .trim();
}

const digitsOf = (s?: string | null) => (s ?? '').replace(/\D/g, '');

/** 0 = no match. Higher = better. Every query term must match somewhere. */
function scoreText(text: string, query: string): number {
  const n = normalize(text);
  const q = normalize(query);
  if (!n || !q) return 0;
  if (n === q) return 120;
  const words = n.split(' ');
  let score = 0;
  for (const term of q.split(' ')) {
    if (words.includes(term)) score += 40;
    else if (words.some((w) => w.startsWith(term))) score += 30;
    else if (n.includes(term)) score += 15;
    else return 0;
  }
  if (n.startsWith(q)) score += 20;
  return score;
}

/** Emphasize the matched part of a result title. Best-effort: a raw
    case-insensitive hit is emphasized; when only the folded forms match,
    the title renders plain rather than mis-highlighted. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (q.length < 2) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-accent font-semibold">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Data shapes the panel works with
// ─────────────────────────────────────────────────────────────
interface PropertyRow {
  id: string; name: string; address: string; city: string;
  property_type: string; rooms: number | null; status: string;
  current_value: number | null;
}
interface LeaseRow {
  id: string; property_id: string; tenant_id: string;
  start_date: string; end_date: string; monthly_rent: number; status: string;
  properties: { name: string; city: string } | null;
  tenants: { full_name: string; phone: string | null } | null;
}
interface TenantRow { id: string; full_name: string; phone: string | null; email: string | null }
interface PaymentRowA { id: string; lease_id: string; due_date: string; amount: number; paid: boolean }

interface ResultRow {
  id: string;
  title: React.ReactNode;
  subtitle?: string;
  value?: string;
  tag?: string;
  tagClass?: string;
  href?: string;
}

interface AnswerView {
  title: string;
  summary?: string;
  empty: string;
  rows: ResultRow[];
}

interface ActionDef {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  group: 'answers' | 'nav';
  keywords: string;
  href?: string;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }

// ─────────────────────────────────────────────────────────────
// Recents — a lightweight, per-browser memory of what was used.
// ─────────────────────────────────────────────────────────────
interface Recent { kind: 'property' | 'tenant' | 'question'; id?: string; title: string }
const RECENTS_KEY = 'shai-assistant-recents';

function readRecents(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, 5) : [];
  } catch { return []; }
}

function pushRecent(r: Recent): Recent[] {
  try {
    const rest = readRecents().filter((x) => !(x.kind === r.kind && (x.id ?? x.title) === (r.id ?? r.title)));
    const next = [r, ...rest].slice(0, 5);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    return next;
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────
// What the assistant can do — answers are computed locally from
// live data the moment they're asked. No model, no waiting.
// ─────────────────────────────────────────────────────────────
const ACTIONS: ActionDef[] = [
  { id: 'debts', label: 'מי לא שילם', hint: 'תשלומי שכירות שממתינים לגבייה', icon: CircleDollarSign, group: 'answers', keywords: 'שילם לא שילם חוב חובות תשלום תשלומים גבייה איחור ממתין כסף' },
  { id: 'ending', label: 'אילו חוזים מסתיימים בקרוב', hint: 'חצי השנה הקרובה, כולל באיחור', icon: CalendarClock, group: 'answers', keywords: 'חוזה חוזים מסתיים מסתיימים תוקף חידוש שכירות פג דורש טיפול' },
  { id: 'vacant', label: 'אילו נכסים לא מושכרים', hint: 'פנויים, בשיפוץ ולמכירה', icon: KeyRound, group: 'answers', keywords: 'פנוי פנויים ריק שיפוץ למכירה לא מושכר תפוסה' },
  { id: 'rent', label: 'כמה שכר דירה נכנס בחודש', hint: 'כל החוזים הפעילים', icon: Wallet, group: 'answers', keywords: 'שכירות שכר דירה הכנסה חודשית תשלום כסף כמה נכנס' },
  { id: 'value', label: 'מה שווי התיק', hint: 'שווי נוכחי של כל הנכסים', icon: Landmark, group: 'answers', keywords: 'שווי תיק נכסים ערך הון כמה שווה' },
  { id: 'summary', label: 'סיכום מהיר של התיק', hint: 'נכסים, תפוסה, הכנסה ותשואה', icon: PieChart, group: 'answers', keywords: 'סיכום מצב כללי סטטוס דוח מספרים תשואה תפוסה' },

  { id: 'nav-new', label: 'נכס חדש', hint: 'הוספת נכס לתיק', icon: Plus, group: 'nav', keywords: 'חדש הוספה להוסיף נכס', href: '/properties/new' },
  { id: 'nav-props', label: 'כל הנכסים', hint: 'רשימת הנכסים המלאה', icon: Building2, group: 'nav', keywords: 'נכסים רשימה דירות', href: '/properties' },
  { id: 'nav-leases', label: 'חוזים', hint: 'כל חוזי השכירות', icon: FileText, group: 'nav', keywords: 'חוזים שכירות רשימה', href: '/leases' },
  { id: 'nav-home', label: 'סקירה', hint: 'מסך הבית', icon: LayoutGrid, group: 'nav', keywords: 'בית דשבורד ראשי סקירה', href: '/' },
  { id: 'nav-docs', label: 'מסמכים', hint: 'כל המסמכים של כל הנכסים', icon: FolderOpen, group: 'nav', keywords: 'מסמכים ארכיון קבצים חוזה קבלה ענן', href: '/documents' },
  { id: 'nav-cal', label: 'יומן', hint: 'תשלומים, סופי חוזה ומשימות', icon: CalendarDays, group: 'nav', keywords: 'יומן לוח שנה תאריכים', href: '/calendar' },
  { id: 'nav-tasks', label: 'משימות', hint: 'מה פתוח', icon: CircleCheck, group: 'nav', keywords: 'משימות טודו לעשות', href: '/tasks' },
  { id: 'nav-sites', label: 'אתרים', hint: 'בניינים ומתחמים', icon: Building, group: 'nav', keywords: 'אתרים בניינים מתחם', href: '/buildings' },
  { id: 'nav-entities', label: 'ישויות', hint: 'מי מחזיק במה', icon: Users, group: 'nav', keywords: 'ישויות חברות בעלות מחזיק', href: '/entities' },
  { id: 'nav-tenants', label: 'שוכרים', hint: 'כל הדיירים', icon: UserRound, group: 'nav', keywords: 'שוכרים דיירים', href: '/tenants' },
];

const LOAD_ERROR = 'לא הצלחתי לטעון את הנתונים. בדוק את החיבור ונסה שוב.';
const STILL_LOADING = 'עוד טוען נתונים...';
const AI_ERROR = 'אירעה שגיאה. נסה שוב.';

/** The wait is blind without it: name the stage so 5 seconds read as work. */
function AiLoading() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setStage(1), 2600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex justify-end">
      <div className="bg-surface-sunken border border-separator rounded-2xl px-4 py-2.5 flex items-center gap-2.5">
        <div className="flex gap-1">
          {[0, 150, 300].map((d) => (
            <span key={d} className="w-1.5 h-1.5 rounded-full bg-label-tertiary animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
        <span className="text-[12px] text-label-secondary">{stage === 0 ? 'קורא את הנתונים…' : 'מנסח תשובה…'}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<AnswerView | null>(null);
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [aiChat, setAiChat] = useState<{ messages: ChatMessage[]; loading: boolean } | null>(null);
  const [fabHidden, setFabHidden] = useState(false);
  const [compact, setCompact] = useState(false);
  const [recents, setRecents] = useState<Recent[]>([]);

  const [properties, setProperties] = useState<PropertyRow[] | null>(null);
  const [leases, setLeases] = useState<LeaseRow[] | null>(null);
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRowA[] | null>(null);
  const [dataFailed, setDataFailed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const aiScrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // ⌘K / Ctrl+K toggles the panel from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Mobile: the star floats over list content — duck it while scrolling
  // down, bring it back on scroll-up or after a short idle.
  useEffect(() => {
    if (open) return;
    const scroller = document.getElementById('app-scroll');
    if (!scroller) return;
    let lastY = scroller.scrollTop;
    let idle: number | undefined;
    const onScroll = () => {
      if (window.innerWidth >= 768) return;
      const y = scroller.scrollTop;
      if (y > lastY + 4 && y > 80) setFabHidden(true);
      else if (y < lastY - 4) setFabHidden(false);
      lastY = y;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setFabHidden(false), 700);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => { scroller.removeEventListener('scroll', onScroll); window.clearTimeout(idle); };
  }, [open]);

  // Fetch once per open, through the signed-in user's own client (RLS).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDataFailed(false);
    setRecents(readRecents());
    const supabase = createClient();
    (async () => {
      const [p, l, t, pay] = await Promise.all([
        supabase.from('properties').select('id,name,address,city,property_type,rooms,status,current_value'),
        supabase.from('leases').select('id,property_id,tenant_id,start_date,end_date,monthly_rent,status,properties(name,city),tenants(full_name,phone)'),
        supabase.from('tenants').select('id,full_name,phone,email'),
        supabase.from('lease_payments').select('id,lease_id,due_date,amount,paid'),
      ]);
      if (cancelled) return;
      // A failed fetch must never read as "there is nothing" — otherwise a
      // dropped request answers "הכול מושכר" with confidence.
      if (p.error || l.error || t.error || pay.error) { setDataFailed(true); return; }
      setProperties((p.data ?? []) as PropertyRow[]);
      setLeases((l.data ?? []) as unknown as LeaseRow[]);
      setTenants((t.data ?? []) as TenantRow[]);
      setPayments((pay.data ?? []) as PaymentRowA[]);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const loading = !dataFailed && (properties === null || leases === null || tenants === null || payments === null);

  useEffect(() => {
    if (!open) return;
    // Autofocus only where a hardware keyboard is likely — on touch the
    // on-screen keyboard would cover half the panel the moment it opens.
    const wantsFocus = window.matchMedia('(pointer: fine)').matches;
    const t = wantsFocus ? setTimeout(() => inputRef.current?.focus(), 60) : undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      // Keep keyboard focus inside the dialog.
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const els = panel.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        const active = document.activeElement;
        if (!panel.contains(active)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { if (t) clearTimeout(t); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the newest chat message in view.
  useEffect(() => {
    if (aiScrollRef.current) aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
  }, [aiChat]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setAnswer(null);
    setTenant(null);
    setAiChat(null);
    setCompact(false);
  };

  const backHome = () => { setAnswer(null); setTenant(null); setAiChat(null); };

  const go = (href?: string) => {
    if (!href) return;
    router.push(href);
    close();
  };

  // Shrink the sheet while the on-screen keyboard is up, so results stay
  // visible above it. Pointer, not width: a narrow laptop has no keyboard.
  const isTouch = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const onFieldFocus = () => { if (isTouch()) setCompact(true); };
  const onFieldBlur = () => setCompact(false);

  const openProperty = (p: { id: string; name: string }) => {
    setRecents(pushRecent({ kind: 'property', id: p.id, title: p.name }));
    go(`/properties/${p.id}`);
  };

  const openTenant = (t: TenantRow) => {
    setRecents(pushRecent({ kind: 'tenant', id: t.id, title: t.full_name }));
    setTenant(t);
    setAnswer(null);
    setAiChat(null);
  };

  // ── Search ─────────────────────────────────────────────────
  const propertyMatches = useMemo(() => {
    const q = query.trim();
    if (q.length < 2 || !properties) return [];
    return properties
      .map((p) => ({ p, score: Math.max(scoreText(p.name, q), scoreText(`${p.address} ${p.city}`, q) ? 12 : 0) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((m) => m.p);
  }, [properties, query]);

  const tenantMatches = useMemo(() => {
    const q = query.trim();
    if (q.length < 2 || !tenants) return [];
    const qDigits = digitsOf(q);
    return tenants
      .map((t) => {
        let score = scoreText(t.full_name, q);
        if (qDigits.length >= 3 && digitsOf(t.phone).includes(qDigits)) score = Math.max(score, 60);
        return { t, score };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((m) => m.t);
  }, [tenants, query]);

  const actionMatches = useMemo(() => {
    const q = query.trim();
    if (!q) return ACTIONS;
    return ACTIONS.filter((a) => scoreText(`${a.label} ${a.hint} ${a.keywords}`, q) > 0);
  }, [query]);

  // ── Canned answers — computed locally, instant ─────────────
  const buildAnswer = (id: string): AnswerView | null => {
    const action = ACTIONS.find((a) => a.id === id);
    // Refuse to answer from data that never arrived: every branch below
    // counts and sums rows, so an empty array would be a confident zero.
    if (dataFailed || loading) {
      return { title: action?.label ?? '', empty: dataFailed ? LOAD_ERROR : STILL_LOADING, rows: [] };
    }
    const props = properties!;
    const allLeases = leases!;
    const active = allLeases.filter((l) => l.status === 'active');
    const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    switch (id) {
      case 'debts': {
        const byLease = new Map(allLeases.map((l) => [l.id, l]));
        const due = (payments ?? [])
          .filter((x) => !x.paid && x.due_date <= todayIso)
          .sort((a, b) => (a.due_date > b.due_date ? 1 : -1));
        const total = due.reduce((s, x) => s + (Number(x.amount) || 0), 0);
        return {
          title: 'מי לא שילם',
          summary: due.length
            ? `${due.length === 1 ? 'תשלום אחד ממתין' : `${due.length} תשלומים ממתינים`} · ${ILS(total)} לגבייה`
            : undefined,
          empty: 'הכול שולם — אין תשלומים פתוחים 🎉',
          rows: due.map((x) => {
            const l = byLease.get(x.lease_id);
            return {
              id: x.id,
              title: l?.properties?.name ?? 'נכס',
              subtitle: `${l?.tenants?.full_name ?? ''} · לתשלום ${heDate(x.due_date)}`,
              value: ILS(x.amount),
              tag: 'ממתין לתשלום',
              tagClass: 'text-danger',
              href: l ? `/properties/${l.property_id}` : undefined,
            };
          }),
        };
      }

      case 'ending': {
        const soon = active
          .filter((l) => daysUntil(l.end_date) <= 180)
          .sort((a, b) => (a.end_date > b.end_date ? 1 : -1));
        return {
          title: 'חוזים שמסתיימים בקרוב',
          summary: soon.length
            ? `${soon.length === 1 ? 'חוזה אחד דורש' : `${soon.length} חוזים דורשים`} טיפול · הקרוב: ${heDate(soon[0].end_date)}`
            : undefined,
          empty: 'אין חוזים שמסתיימים בחצי השנה הקרובה.',
          rows: soon.map((l) => {
            const d = daysUntil(l.end_date);
            const u = URGENCY_STYLE[leaseUrgency(d)];
            return {
              id: l.id,
              title: l.properties?.name ?? 'נכס',
              subtitle: `${l.tenants?.full_name ?? ''} · ${ILS(l.monthly_rent)} לחודש`,
              value: heDate(l.end_date),
              tag: u.label(d),
              tagClass: u.text,
              href: `/properties/${l.property_id}`,
            };
          }),
        };
      }

      case 'vacant': {
        const notRented = props
          .filter((p) => p.status !== 'rented')
          .sort((a, b) => (Number(b.current_value) || 0) - (Number(a.current_value) || 0));
        return {
          title: 'נכסים שאינם מושכרים',
          summary: notRented.length
            ? `${notRented.length === 1 ? 'נכס אחד' : `${notRented.length} נכסים`} ללא שכירות פעילה`
            : undefined,
          empty: 'כל הנכסים מושכרים.',
          rows: notRented.map((p) => ({
            id: p.id,
            title: p.name,
            subtitle: `${p.address}, ${p.city}`,
            value: p.current_value ? ILS(p.current_value) : undefined,
            tag: PROPERTY_STATUS[p.status]?.label ?? p.status,
            tagClass: PROPERTY_STATUS[p.status]?.text,
            href: `/properties/${p.id}`,
          })),
        };
      }

      case 'rent': {
        const rows = [...active]
          .sort((a, b) => b.monthly_rent - a.monthly_rent)
          .map((l) => ({
            id: l.id,
            title: l.properties?.name ?? 'נכס',
            subtitle: l.tenants?.full_name ?? '',
            value: ILS(l.monthly_rent),
            href: `/properties/${l.property_id}`,
          }));
        const total = active.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0);
        return {
          title: 'שכר דירה חודשי',
          summary: rows.length
            ? `${ILS(total)} בחודש · ${ILS(total * 12)} בשנה · ${rows.length} חוזים פעילים`
            : undefined,
          empty: 'אין חוזים פעילים.',
          rows,
        };
      }

      case 'value': {
        const rows = [...props]
          .sort((a, b) => (Number(b.current_value) || 0) - (Number(a.current_value) || 0))
          .map((p) => ({
            id: p.id,
            title: p.name,
            subtitle: `${PROPERTY_TYPES[p.property_type] ?? p.property_type} · ${p.city}`,
            value: p.current_value ? ILS(p.current_value) : '—',
            href: `/properties/${p.id}`,
          }));
        const total = props.reduce((s, p) => s + (Number(p.current_value) || 0), 0);
        return {
          title: 'שווי התיק',
          summary: rows.length ? `${ILS(total)} · ${rows.length} נכסים` : undefined,
          empty: 'אין נכסים בתיק.',
          rows,
        };
      }

      case 'summary': {
        const total = props.reduce((s, p) => s + (Number(p.current_value) || 0), 0);
        const monthly = active.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0);
        const rented = props.filter((p) => p.status === 'rented').length;
        const ending90 = active.filter((l) => daysUntil(l.end_date) <= 90).length;
        const yieldPct = total > 0 ? ((monthly * 12) / total) * 100 : null;
        return {
          title: 'סיכום מהיר של התיק',
          empty: '',
          rows: [
            { id: 's1', title: 'נכסים בתיק', subtitle: `${rented} מהם מושכרים`, value: String(props.length), href: '/properties' },
            { id: 's2', title: 'שווי התיק', subtitle: 'לפי שווי נוכחי', value: ILS(total) },
            { id: 's3', title: 'הכנסה חודשית', subtitle: `${active.length} חוזים פעילים`, value: ILS(monthly), href: '/leases' },
            { id: 's4', title: 'הכנסה שנתית', subtitle: 'שכירות × 12', value: ILS(monthly * 12) },
            { id: 's5', title: 'תשואה ברוטו', subtitle: 'שנתית, מהשווי הנוכחי', value: yieldPct === null ? '—' : `${yieldPct.toFixed(1)}%` },
            { id: 's6', title: 'חוזים שמסתיימים בקרוב', subtitle: 'בתוך 90 יום', value: String(ending90), href: '/leases' },
            { id: 's7', title: 'תשלומים ממתינים לגבייה', subtitle: 'שכירות שטרם שולמה', value: String((payments ?? []).filter((x) => !x.paid && x.due_date <= todayIso).length) },
          ],
        };
      }

      default:
        return null;
    }
  };

  const runAction = (a: ActionDef) => {
    if (a.href) { go(a.href); return; }
    const view = buildAnswer(a.id);
    if (view) { setAnswer(view); setTenant(null); setAiChat(null); }
  };

  // ── Free-text conversation → the AI route (fallback layer) ─
  const askAi = async (question: string) => {
    const q = question.trim();
    if (!q) return;
    const prior = aiChat?.messages ?? [];
    const msgs: ChatMessage[] = [...prior, { role: 'user', content: q }];
    setAiChat({ messages: msgs, loading: true });
    setAnswer(null);
    setTenant(null);
    setQuery('');
    setRecents(pushRecent({ kind: 'question', title: q }));
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history: prior.slice(-10) }),
      });
      const json = res.ok ? await res.json() : null;
      setAiChat({ messages: [...msgs, { role: 'assistant', content: json?.answer ?? AI_ERROR }], loading: false });
    } catch {
      setAiChat({ messages: [...msgs, { role: 'assistant', content: AI_ERROR }], loading: false });
    }
  };

  const runRecent = (r: Recent) => {
    if (r.kind === 'property' && r.id) { go(`/properties/${r.id}`); return; }
    if (r.kind === 'tenant' && r.id) {
      const t = tenants?.find((x) => x.id === r.id);
      if (t) openTenant(t);
      return;
    }
    if (r.kind === 'question') askAi(r.title);
  };

  // ── Closed state: the star ─────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`press fixed bottom-[88px] left-4 md:bottom-8 md:left-8 z-40 w-12 h-12 rounded-full bg-accent text-white shadow-lg shadow-accent/30 flex items-center justify-center transition-all duration-300 ${fabHidden ? 'translate-y-24 opacity-0 pointer-events-none' : ''}`}
        title="עוזר חכם (⌘K)"
        aria-label="עוזר חכם"
      >
        <Sparkles size={21} strokeWidth={2.1} />
      </button>
    );
  }

  const showingHome = !answer && !tenant && !aiChat;
  const tenantLeases = tenant ? (leases ?? []).filter((l) => l.tenant_id === tenant.id) : [];
  const viewKey = tenant ? `t-${tenant.id}` : answer ? `a-${answer.title}` : aiChat ? 'ai' : 'home';

  return (
    <>
      {/* Mobile: dimmed backdrop above the tab bar, so a stray tap dismisses
          the sheet instead of navigating underneath it. Desktop: an invisible
          click-catcher — clicking anywhere outside closes the panel. */}
      <div className="fixed inset-0 z-[45] bg-black/40 animate-in md:hidden" onClick={close} aria-hidden />
      <div className="fixed inset-0 z-[45] hidden md:block" onClick={close} aria-hidden />

      {/* Solid surface, deliberately not `material`: iOS Safari intermittently
          fails to paint children of backdrop-filter parents. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="עוזר חכם"
        className={`fixed inset-x-0 bottom-0 md:inset-x-auto md:bottom-8 md:left-8 z-50 w-full md:w-[400px] ${compact ? 'h-[55dvh]' : 'h-[76dvh]'} md:h-[560px] transition-[height] duration-300 bg-canvas rounded-t-3xl md:rounded-3xl border border-separator shadow-2xl shadow-black/20 flex flex-col overflow-hidden animate-in`}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 h-[52px] edge-line">
          <div className="flex items-center gap-2 min-w-0">
            {!showingHome && (
              <button onClick={backHome} className="press text-label-secondary hover:text-label shrink-0" title="חזרה" aria-label="חזרה">
                <ChevronRight size={18} strokeWidth={2} />
              </button>
            )}
            <span className="w-7 h-7 rounded-[9px] bg-accent-tint text-accent flex items-center justify-center shrink-0">
              <Sparkles size={15} strokeWidth={2.2} />
            </span>
            <span className="text-[15px] font-semibold text-label truncate">
              {tenant ? tenant.full_name : answer ? answer.title : 'עוזר חכם'}
            </span>
          </div>
          <button onClick={close} className="press touch-target rounded-full text-label-secondary hover:text-label" aria-label="סגירה">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Search — hidden during an AI conversation, which has its own input */}
        {!aiChat && (
          <div className="shrink-0 px-3 py-2.5 border-b border-separator">
            <div className="relative">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-label-tertiary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setAnswer(null); setTenant(null); }}
                onFocus={onFieldFocus}
                onBlur={onFieldBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim().length >= 2 && propertyMatches.length === 0 && tenantMatches.length === 0 && actionMatches.length === 0) {
                    askAi(query);
                  }
                }}
                placeholder="נכס, שוכר, או שאלה…"
                dir="rtl"
                className="w-full bg-surface-sunken border border-separator rounded-xl pr-9 pl-12 py-2.5 text-[14px] text-label outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-label-tertiary"
              />
              <kbd className="hidden md:inline absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-label-tertiary bg-fill rounded px-1.5 py-0.5" aria-hidden>esc</kbd>
            </div>
          </div>
        )}

        {/* Body */}
        <div ref={aiScrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          <div key={viewKey} className="animate-in">
            {/* ── Tenant detail ─────────────────────────── */}
            {tenant && (
              <div className="p-4 space-y-4">
                <div className="bg-accent-tint border border-accent/15 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User size={15} className="text-accent" />
                    <span className="text-[14px] font-semibold text-label">{tenant.full_name}</span>
                  </div>
                  {tenant.phone && (
                    <div className="flex items-center gap-2">
                      <a href={`tel:${tenant.phone}`} className="press flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium text-accent bg-canvas border border-accent/20 rounded-xl py-2">
                        <Phone size={13} /> חיוג
                      </a>
                      <a href={waLink(tenant.phone)} target="_blank" rel="noopener" className="press flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-white bg-[#25D366] rounded-xl py-2">
                        <WhatsAppIcon size={14} /> וואטסאפ
                      </a>
                    </div>
                  )}
                  {tenantLeases.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-accent/15 text-[12px] text-label-secondary">
                      {`סה"כ שכירות: ${ILS(tenantLeases.filter((l) => l.status === 'active').reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0))} לחודש`}
                    </div>
                  )}
                </div>

                <Section title={`חוזים (${tenantLeases.length})`}>
                  {tenantLeases.length === 0 ? (
                    <p className="text-[12px] text-label-tertiary px-1 py-2">{loading ? STILL_LOADING : 'אין חוזים לשוכר הזה.'}</p>
                  ) : (
                    tenantLeases.map((l) => {
                      const d = daysUntil(l.end_date);
                      const u = URGENCY_STYLE[leaseUrgency(d)];
                      return (
                        <Row
                          key={l.id}
                          icon={<FileText size={15} className="text-accent" />}
                          title={l.properties?.name ?? 'נכס'}
                          subtitle={`${heDate(l.start_date)} – ${heDate(l.end_date)}`}
                          value={ILS(l.monthly_rent)}
                          tag={l.status === 'active' ? u.label(d) : 'הסתיים'}
                          tagClass={l.status === 'active' ? u.text : 'text-label-tertiary'}
                          onClick={() => go(`/properties/${l.property_id}`)}
                        />
                      );
                    })
                  )}
                </Section>
              </div>
            )}

            {/* ── Canned answer ─────────────────────────── */}
            {answer && (
              <div className="p-4 space-y-3">
                {answer.summary && (
                  <div className="bg-accent-tint border border-accent/15 rounded-2xl px-4 py-3 text-[13px] text-label">
                    {answer.summary}
                  </div>
                )}
                {answer.rows.length === 0 ? (
                  <p className="text-center text-[13px] text-label-tertiary py-10">{answer.empty}</p>
                ) : (
                  <div className="space-y-1.5">
                    {answer.rows.map((r) => (
                      <Row key={r.id} title={r.title} subtitle={r.subtitle} value={r.value} tag={r.tag} tagClass={r.tagClass}
                        onClick={r.href ? () => go(r.href) : undefined} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── AI conversation ───────────────────────── */}
            {aiChat && (
              <div className="p-4 space-y-2.5">
                {aiChat.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user' ? 'bg-accent text-white' : 'bg-surface-sunken text-label border border-separator'
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {aiChat.loading && <AiLoading />}
              </div>
            )}

            {/* ── Home / search results ─────────────────── */}
            {showingHome && (
              <div className="p-4 space-y-4">
                {loading && <p className="text-center text-[11px] text-label-tertiary py-1">{STILL_LOADING}</p>}
                {dataFailed && (
                  <p className="text-[12px] text-danger bg-danger-tint border border-danger/20 rounded-xl px-3 py-2.5">{LOAD_ERROR}</p>
                )}

                {!query && recents.length > 0 && (
                  <Section title="אחרונים">
                    {recents.map((r) => (
                      <Row
                        key={`${r.kind}-${r.id ?? r.title}`}
                        icon={
                          r.kind === 'property' ? <Building2 size={15} className="text-accent" />
                          : r.kind === 'tenant' ? <User size={15} className="text-accent" />
                          : <History size={15} className="text-label-tertiary" />
                        }
                        title={r.title}
                        onClick={() => runRecent(r)}
                      />
                    ))}
                  </Section>
                )}

                {query.trim().length >= 2 && (
                  <>
                    {propertyMatches.length > 0 && (
                      <Section title={`נכסים (${propertyMatches.length})`}>
                        {propertyMatches.map((p) => (
                          <Row
                            key={p.id}
                            icon={<Building2 size={15} className="text-accent" />}
                            title={<Highlight text={p.name} query={query} />}
                            subtitle={`${p.address}, ${p.city}`}
                            value={p.current_value ? ILS(p.current_value) : undefined}
                            tag={PROPERTY_STATUS[p.status]?.label}
                            tagClass={PROPERTY_STATUS[p.status]?.text}
                            onClick={() => openProperty(p)}
                          />
                        ))}
                      </Section>
                    )}
                    {tenantMatches.length > 0 && (
                      <Section title={`שוכרים (${tenantMatches.length})`}>
                        {tenantMatches.map((t) => (
                          <Row
                            key={t.id}
                            icon={<User size={15} className="text-accent" />}
                            title={<Highlight text={t.full_name} query={query} />}
                            subtitle={t.phone ?? 'אין טלפון'}
                            onClick={() => openTenant(t)}
                          />
                        ))}
                      </Section>
                    )}
                  </>
                )}

                {actionMatches.some((a) => a.group === 'answers') && (
                  <Section title="מה אפשר לשאול">
                    {actionMatches.filter((a) => a.group === 'answers').map((a) => (
                      <ActionRow key={a.id} action={a} onClick={() => runAction(a)} />
                    ))}
                  </Section>
                )}

                {actionMatches.some((a) => a.group === 'nav') && (
                  <Section title="מעבר מהיר">
                    {actionMatches.filter((a) => a.group === 'nav').map((a) => (
                      <ActionRow key={a.id} action={a} onClick={() => runAction(a)} />
                    ))}
                  </Section>
                )}

                {/* Anything the canned answers don't cover goes to the model. */}
                {query.trim().length >= 2 && (
                  <Section title="שאלה חופשית">
                    <button
                      onClick={() => askAi(query)}
                      className="press w-full flex items-center gap-3 text-right bg-surface-sunken border border-separator rounded-xl px-3.5 py-2.5 hover:border-accent/30"
                    >
                      <Sparkles size={15} className="text-accent shrink-0" />
                      <span className="flex-1 min-w-0 text-[13px] text-label truncate">{`לשאול את העוזר: "${query.trim()}"`}</span>
                      <ChevronLeft size={14} className="text-label-tertiary shrink-0" />
                    </button>
                  </Section>
                )}

                {!query && (
                  <p className="text-center text-[11px] text-label-tertiary pt-1">
                    אפשר גם להקליד שם של נכס או שוכר כדי למצוא אותם
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* AI conversation input — the chat continues, no back-and-retype */}
        {aiChat && (
          <div className="shrink-0 px-3 py-2.5 border-t border-separator safe-bottom">
            <AiInput
              inputRef={aiInputRef}
              disabled={aiChat.loading}
              onSend={askAi}
              onFocus={onFieldFocus}
              onBlur={onFieldBlur}
            />
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Presentational pieces
// ─────────────────────────────────────────────────────────────
function AiInput({
  inputRef, disabled, onSend, onFocus, onBlur,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onSend: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
  };
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="שאלת המשך…"
        dir="rtl"
        className="flex-1 bg-surface-sunken border border-separator rounded-xl px-4 py-2.5 text-[14px] text-label outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-label-tertiary"
      />
      <button
        onClick={send}
        disabled={!text.trim() || disabled}
        className="press w-11 h-11 shrink-0 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-40"
        aria-label="שליחה"
      >
        <Send size={16} strokeWidth={2.2} className="-scale-x-100" />
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-label-tertiary px-1 mb-1.5">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  icon, title, subtitle, value, tag, tagClass, onClick,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: string;
  value?: string;
  tag?: string;
  tagClass?: string;
  onClick?: () => void;
}) {
  const base = 'w-full flex items-center gap-3 text-right bg-surface-sunken border border-separator rounded-xl px-3.5 py-2.5';
  const inner = (
    <>
      {icon && <span className="shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-label truncate">{title}</div>
        {subtitle && <div className="text-[11px] text-label-secondary truncate">{subtitle}</div>}
        {tag && <div className={`text-[10px] mt-0.5 truncate ${tagClass ?? 'text-label-tertiary'}`}>{tag}</div>}
      </div>
      {value && <span className="text-[12px] font-semibold text-label shrink-0">{value}</span>}
    </>
  );
  if (!onClick) return <div className={base}>{inner}</div>;
  // The chevron is the affordance separating "opens something" from a
  // read-only stat row — without it the two are indistinguishable.
  return (
    <button onClick={onClick} className={`press ${base} hover:border-accent/30`}>
      {inner}
      <ChevronLeft size={14} className="text-label-tertiary shrink-0" />
    </button>
  );
}

function ActionRow({ action, onClick }: { action: ActionDef; onClick: () => void }) {
  const Icon = action.icon;
  return (
    <button
      onClick={onClick}
      className="press w-full flex items-center gap-3 text-right bg-surface-sunken border border-separator rounded-xl px-3.5 py-2.5 hover:border-accent/30"
    >
      <Icon size={16} className="text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-label truncate">{action.label}</div>
        <div className="text-[11px] text-label-secondary truncate">{action.hint}</div>
      </div>
      <ChevronLeft size={14} className="text-label-tertiary shrink-0" />
    </button>
  );
}
