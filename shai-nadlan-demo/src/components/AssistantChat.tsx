'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, X, Search, ChevronRight, Phone, User, Building2, FileText,
  LayoutGrid, Plus, Wallet, Landmark, KeyRound, CalendarClock, PieChart,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ILS, heDate, daysUntil } from '@/lib/format';
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

interface ResultRow {
  id: string;
  title: string;
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

// ─────────────────────────────────────────────────────────────
// What the assistant can do — answers are computed locally from
// live data the moment they're asked. No model, no waiting.
// ─────────────────────────────────────────────────────────────
const ACTIONS: ActionDef[] = [
  { id: 'ending', label: 'אילו חוזים מסתיימים בקרוב', hint: 'חצי השנה הקרובה, כולל באיחור', icon: CalendarClock, group: 'answers', keywords: 'חוזה חוזים מסתיים מסתיימים תוקף חידוש שכירות פג דורש טיפול' },
  { id: 'vacant', label: 'אילו נכסים לא מושכרים', hint: 'פנויים, בשיפוץ ולמכירה', icon: KeyRound, group: 'answers', keywords: 'פנוי פנויים ריק שיפוץ למכירה לא מושכר תפוסה' },
  { id: 'rent', label: 'כמה שכר דירה נכנס בחודש', hint: 'כל החוזים הפעילים', icon: Wallet, group: 'answers', keywords: 'שכירות שכר דירה הכנסה חודשית תשלום כסף כמה נכנס' },
  { id: 'value', label: 'מה שווי התיק', hint: 'שווי נוכחי של כל הנכסים', icon: Landmark, group: 'answers', keywords: 'שווי תיק נכסים ערך הון כמה שווה' },
  { id: 'summary', label: 'סיכום מהיר של התיק', hint: 'נכסים, תפוסה, הכנסה ותשואה', icon: PieChart, group: 'answers', keywords: 'סיכום מצב כללי סטטוס דוח מספרים תשואה תפוסה' },

  { id: 'nav-new', label: 'נכס חדש', hint: 'הוספת נכס לתיק', icon: Plus, group: 'nav', keywords: 'חדש הוספה להוסיף נכס', href: '/properties/new' },
  { id: 'nav-props', label: 'כל הנכסים', hint: 'רשימת הנכסים המלאה', icon: Building2, group: 'nav', keywords: 'נכסים רשימה דירות', href: '/properties' },
  { id: 'nav-leases', label: 'חוזים', hint: 'כל חוזי השכירות', icon: FileText, group: 'nav', keywords: 'חוזים שכירות רשימה', href: '/leases' },
  { id: 'nav-home', label: 'סקירה', hint: 'מסך הבית', icon: LayoutGrid, group: 'nav', keywords: 'בית דשבורד ראשי סקירה', href: '/' },
];

const LOAD_ERROR = 'לא הצלחתי לטעון את הנתונים. בדוק את החיבור ונסה שוב.';
const STILL_LOADING = 'עוד טוען נתונים...';

// ─────────────────────────────────────────────────────────────
export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<AnswerView | null>(null);
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [ai, setAi] = useState<{ question: string; answer: string | null; loading: boolean } | null>(null);
  const [fabHidden, setFabHidden] = useState(false);

  const [properties, setProperties] = useState<PropertyRow[] | null>(null);
  const [leases, setLeases] = useState<LeaseRow[] | null>(null);
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [dataFailed, setDataFailed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
    const supabase = createClient();
    (async () => {
      const [p, l, t] = await Promise.all([
        supabase.from('properties').select('id,name,address,city,property_type,rooms,status,current_value'),
        supabase.from('leases').select('id,property_id,tenant_id,start_date,end_date,monthly_rent,status,properties(name,city),tenants(full_name,phone)'),
        supabase.from('tenants').select('id,full_name,phone,email'),
      ]);
      if (cancelled) return;
      // A failed fetch must never read as "there is nothing" — otherwise a
      // dropped request answers "הכול מושכר" with confidence.
      if (p.error || l.error || t.error) { setDataFailed(true); return; }
      setProperties((p.data ?? []) as PropertyRow[]);
      setLeases((l.data ?? []) as unknown as LeaseRow[]);
      setTenants((t.data ?? []) as TenantRow[]);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const loading = !dataFailed && (properties === null || leases === null || tenants === null);

  useEffect(() => {
    if (!open) return;
    // Autofocus only where a hardware keyboard is likely — on touch the
    // on-screen keyboard would cover half the panel the moment it opens.
    const wantsFocus = window.matchMedia('(pointer: fine)').matches;
    const t = wantsFocus ? setTimeout(() => inputRef.current?.focus(), 60) : undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { if (t) clearTimeout(t); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setAnswer(null);
    setTenant(null);
    setAi(null);
  };

  const backHome = () => { setAnswer(null); setTenant(null); setAi(null); };

  const go = (href?: string) => {
    if (!href) return;
    router.push(href);
    close();
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

    switch (id) {
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
    if (view) { setAnswer(view); setTenant(null); setAi(null); }
  };

  // ── Free-text question → the AI route (fallback layer) ─────
  const askAi = async (question: string) => {
    setAi({ question, answer: null, loading: true });
    setAnswer(null);
    setTenant(null);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history: [] }),
      });
      const json = res.ok ? await res.json() : null;
      setAi({ question, answer: json?.answer ?? 'אירעה שגיאה. נסה שוב.', loading: false });
    } catch {
      setAi({ question, answer: 'אירעה שגיאה. נסה שוב.', loading: false });
    }
  };

  // ── Closed state: the star ─────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`press fixed bottom-[88px] left-4 md:bottom-8 md:left-8 z-40 w-12 h-12 rounded-full bg-accent text-white shadow-lg shadow-accent/30 flex items-center justify-center transition-all duration-300 ${fabHidden ? 'translate-y-24 opacity-0 pointer-events-none' : ''}`}
        title="עוזר חכם"
        aria-label="עוזר חכם"
      >
        <Sparkles size={21} strokeWidth={2.1} />
      </button>
    );
  }

  const showingHome = !answer && !tenant && !ai;
  const tenantLeases = tenant ? (leases ?? []).filter((l) => l.tenant_id === tenant.id) : [];

  return (
    <>
      {/* Backdrop above the tab bar, so a stray tap dismisses the sheet
          instead of navigating underneath it. */}
      <div className="fixed inset-0 z-[45] bg-black/40 animate-in md:hidden" onClick={close} aria-hidden />

      {/* Solid surface, deliberately not `material`: iOS Safari intermittently
          fails to paint children of backdrop-filter parents. */}
      <div className="fixed inset-x-0 bottom-0 md:inset-x-auto md:bottom-8 md:left-8 z-50 w-full md:w-[400px] h-[76dvh] md:h-[560px] bg-canvas rounded-t-3xl md:rounded-3xl border border-separator shadow-2xl shadow-black/20 flex flex-col overflow-hidden animate-in">
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
              {tenant ? tenant.full_name : answer ? answer.title : ai ? 'עוזר חכם' : 'עוזר חכם'}
            </span>
          </div>
          <button onClick={close} className="press touch-target rounded-full text-label-secondary hover:text-label" aria-label="סגירה">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Search — always available */}
        <div className="shrink-0 px-3 py-2.5 border-b border-separator">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-label-tertiary" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setAnswer(null); setTenant(null); setAi(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim().length >= 2 && propertyMatches.length === 0 && tenantMatches.length === 0 && actionMatches.length === 0) {
                  askAi(query.trim());
                }
              }}
              placeholder="נכס, שוכר, או שאלה…"
              dir="rtl"
              className="w-full bg-surface-sunken border border-separator rounded-xl pr-9 pl-3 py-2.5 text-[14px] text-label outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-label-tertiary"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          {/* ── Tenant detail ─────────────────────────── */}
          {tenant && (
            <div className="p-4 space-y-4">
              <div className="bg-accent-tint border border-accent/15 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <User size={15} className="text-accent" />
                  <span className="text-[14px] font-semibold text-label">{tenant.full_name}</span>
                </div>
                {tenant.phone && (
                  <a href={`tel:${tenant.phone}`} className="flex items-center gap-2 text-[12px] text-label-secondary hover:text-accent" dir="ltr">
                    <Phone size={12} /> {tenant.phone}
                  </a>
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

          {/* ── Free-text AI answer ───────────────────── */}
          {ai && (
            <div className="p-4 space-y-3">
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] bg-accent text-white">{ai.question}</div>
              </div>
              {ai.loading ? (
                <div className="flex justify-end">
                  <div className="bg-surface-sunken border border-separator rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      {[0, 150, 300].map((d) => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-label-tertiary animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap bg-surface-sunken text-label border border-separator">
                    {ai.answer}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Home / search results ─────────────────── */}
          {showingHome && (
            <div className="p-4 space-y-4">
              {loading && <p className="text-center text-[11px] text-label-tertiary py-1">{STILL_LOADING}</p>}
              {dataFailed && (
                <p className="text-[12px] text-danger bg-danger-tint border border-danger/20 rounded-xl px-3 py-2.5">{LOAD_ERROR}</p>
              )}

              {query.trim().length >= 2 && (propertyMatches.length > 0 || !loading) && (
                <>
                  {propertyMatches.length > 0 && (
                    <Section title={`נכסים (${propertyMatches.length})`}>
                      {propertyMatches.map((p) => (
                        <Row
                          key={p.id}
                          icon={<Building2 size={15} className="text-accent" />}
                          title={p.name}
                          subtitle={`${p.address}, ${p.city}`}
                          value={p.current_value ? ILS(p.current_value) : undefined}
                          tag={PROPERTY_STATUS[p.status]?.label}
                          tagClass={PROPERTY_STATUS[p.status]?.text}
                          onClick={() => go(`/properties/${p.id}`)}
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
                          title={t.full_name}
                          subtitle={t.phone ?? 'אין טלפון'}
                          onClick={() => { setTenant(t); setAnswer(null); setAi(null); }}
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
                    onClick={() => askAi(query.trim())}
                    className="press w-full flex items-center gap-3 text-right bg-surface-sunken border border-separator rounded-xl px-3.5 py-2.5 hover:border-accent/30"
                  >
                    <Sparkles size={15} className="text-accent shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] text-label truncate">{`לשאול את העוזר: "${query.trim()}"`}</span>
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Presentational pieces
// ─────────────────────────────────────────────────────────────
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
  title: string;
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
  return (
    <button onClick={onClick} className={`press ${base} hover:border-accent/30`}>
      {inner}
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
    </button>
  );
}
