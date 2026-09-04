'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_GROUPS, NAV_ITEMS } from '@/lib/nav';
import { LayoutGrid, Building2, FileText, LogOut, Moon, Sun, Plus, LifeBuoy, CalendarDays, CircleCheck, Users, Building, UserRound, Ellipsis, X, FolderOpen, CircleDollarSign, Wrench, Hammer, Settings, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import WelcomeOverlay from '@/components/WelcomeOverlay';
import AssistantChat from '@/components/AssistantChat';
import FreshnessGuard from '@/components/FreshnessGuard';
import PullToRefresh from '@/components/PullToRefresh';
import { ToastProvider } from '@/components/Toast';

/** Where a fault in this system gets reported. Shai signs in there with a
 *  one-time code sent to the same address he uses here. */
const SUPPORT_URL = 'https://tikunim.roiai.co.il';

/* Grouped exactly the way Nadlanitor groups its own rail — "כללי" over the
   daily screens, then the things a portfolio is made of, then the money. Shai
   already reads a menu in that shape every day, so ours should not invent a
   different one.
   The phone bar holds the four most-used screens plus "עוד"; five is the
   practical ceiling for a bottom bar. Everything the bar cannot hold —
   ישויות, אתרים, שוכרים, חוזים — lives in the sheet behind עוד, in these
   same groups. Nothing is reachable on the desktop and unreachable on the
   phone. */
/* The one list of screens lives in @/lib/nav — see the note there. */
const PHONE_NAV = NAV_ITEMS.filter((i) => i.onPhone);
/* The screens the bar cannot show: עוד stays lit while you are on one of them,
   so the phone never claims you are nowhere. */
const MORE_ONLY = NAV_ITEMS.filter((i) => !i.onPhone);

/**
 * The title the nav bar shows once the page's own large title scrolls away.
 *
 * Derived from the nav itself, so a screen added to NAV_GROUPS cannot end up
 * with a blank bar — this used to be a second hand-written list of the same
 * labels, and a second list is a second thing to forget.
 */
const BAR_TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV_ITEMS.map((i) => [i.href, i.label])),
  '/': 'סקירה',              // the nav says בית, the bar says what you're looking at
  '/properties/new': 'נכס חדש',
  '/settings': 'הגדרות',      // reachable from the header, not from the nav
};

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));

    /* Follow the device while no explicit choice has been made — someone who
       switches their phone to dark at sunset should see the app follow, and
       someone who has pressed this button should not be overruled by it. */
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = (e: MediaQueryListEvent | MediaQueryList) => {
      let saved: string | null = null;
      try { saved = localStorage.getItem('theme'); } catch { /* private mode */ }
      if (saved === 'dark' || saved === 'light') return;
      document.documentElement.classList.toggle('dark', e.matches);
      setDark(e.matches);
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      className="press touch-target rounded-full text-label-secondary hover:text-label"
      title={dark ? 'מצב בהיר' : 'מצב כהה'}
      aria-label={dark ? 'מצב בהיר' : 'מצב כהה'}
    >
      {dark ? <Sun size={19} strokeWidth={2} /> : <Moon size={19} strokeWidth={2} />}
    </button>
  );
}

export default function AppShell({ children, email, firstName }: {
  children: React.ReactNode;
  email: string;
  firstName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Only the app shell owns an inner scroller; login renders outside it.
  useEffect(() => {
    document.body.classList.add('app-shell-locked');
    return () => document.body.classList.remove('app-shell-locked');
  }, []);

  // iOS keeps its bar bare until content slides under it, then brings in the
  // compact title and the hairline together. The threshold is roughly where a
  // page's own large title has left the viewport.
  useEffect(() => {
    const scroller = document.getElementById('app-scroll');
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > 44);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [pathname]);

  // A new page starts at the top, so the bar must start bare again.
  useEffect(() => {
    document.getElementById('app-scroll')?.scrollTo({ top: 0 });
    setScrolled(false);
    setMoreOpen(false);
  }, [pathname]);

  // Escape closes the sheet — and a tap on the same screen you are already on
  // still closes it, because the pathname does not change and nothing else would.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const barTitle = BAR_TITLES[pathname];

  return (
    <ToastProvider>
      <div className="h-[100dvh] flex flex-col overflow-hidden bg-canvas">
        <WelcomeOverlay firstName={firstName} />

        {/* ── Navigation bar ─────────────────────────────────
            Glass over the scrolling content, with the hairline appearing
            only once something is actually behind it. */}
        <header className={`shrink-0 z-40 material safe-top ${scrolled ? 'edge-line' : 'edge-line edge-line-hidden'}`}>
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-4 md:px-6 h-[52px] md:h-[60px] relative">
            <Link href="/" className="press flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-[10px] bg-accent flex items-center justify-center">
                <Building2 size={17} className="text-white" strokeWidth={2.2} />
              </div>
              <span className="font-bold text-[17px] text-label tracking-tight md:inline hidden">שי עובדיה</span>
            </Link>

            {/* The collapsed title, centred as iOS centres it, rising into
                place as the large one leaves. Pointer-events off so it never
                intercepts a tap meant for the controls beneath it. */}
            {barTitle && (
              <span
                aria-hidden={!scrolled}
                className={`title-swap absolute inset-x-0 mx-auto w-max font-semibold text-[16px] text-label tracking-tight pointer-events-none md:hidden ${
                  scrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5'
                }`}
              >
                {barTitle}
              </span>
            )}


            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              {/* The assistant has searched properties, tenants and screens
                  since day one, behind ⌘K and a floating button. Nobody finds
                  a keyboard shortcut they were never told about, so the search
                  now looks like search. It opens the same panel. */}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-search'))}
                aria-label="חיפוש"
                className="press hidden md:flex items-center gap-2 rounded-full bg-fill/70 hover:bg-fill ps-3 pe-2 py-1.5 text-label-tertiary"
              >
                <Search size={15} strokeWidth={2.2} />
                <span className="text-[13px]">חיפוש</span>
                <kbd className="text-[10.5px] font-sans bg-surface rounded px-1.5 py-0.5 border border-separator" dir="ltr">⌘K</kbd>
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-search'))}
                aria-label="חיפוש"
                className="press md:hidden touch-target rounded-full text-label-secondary hover:text-accent"
              >
                <Search size={18} strokeWidth={2} />
              </button>
              <Link
                href="/settings"
                className="press touch-target rounded-full text-label-secondary hover:text-accent flex items-center justify-center"
                title="הגדרות"
                aria-label="הגדרות"
              >
                <Settings size={18} strokeWidth={2} />
              </Link>
              <a
                href={SUPPORT_URL}
                className="press touch-target rounded-full text-label-secondary hover:text-accent flex items-center justify-center"
                title="דיווח תקלה"
                aria-label="דיווח תקלה"
              >
                <LifeBuoy size={18} strokeWidth={2} />
              </a>
              <ThemeToggle />
              <span className="text-[13px] text-label-tertiary hidden lg:inline" dir="ltr">{email}</span>
              <button
                onClick={signOut}
                className="press touch-target rounded-full text-label-secondary hover:text-danger"
                title="יציאה"
                aria-label="יציאה"
              >
                <LogOut size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
        </header>

        {/* ── Main ────────────────────────────────────────────
            On desktop the navigation moves out of the header into a rail on the
            RIGHT — the start edge in RTL, where the eye lands first and where
            Nadlanitor puts its own menu. It scrolls with nothing: only the
            content column scrolls, so the menu is always reachable. */}
        <div className="flex-1 min-h-0 flex flex-row-reverse w-full max-w-6xl mx-auto">
          <nav className="hidden md:flex flex-col w-[188px] shrink-0 px-3 py-5 border-s border-separator">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.title} className={gi > 0 ? 'mt-4' : ''}>
                <div className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-label-tertiary">
                  {group.title}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        className={`press flex items-center gap-2.5 px-3 py-2 rounded-xl text-[15px] font-medium ${
                          active ? 'bg-accent-tint text-accent' : 'text-label-secondary hover:bg-fill'
                        }`}
                      >
                        <Icon size={17} strokeWidth={active ? 2.3 : 2} />
                        <span>{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            <Link
              href="/properties/new"
              className="press flex items-center gap-2.5 px-3 py-2.5 mt-2 rounded-xl bg-accent text-white text-[15px] font-semibold"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>נכס חדש</span>
            </Link>
          </nav>

          <main id="app-scroll" className="flex-1 min-w-0 overflow-y-auto overscroll-contain px-4 py-5 md:px-6 md:py-7">
            <div className="max-w-4xl w-full mx-auto">
              <PullToRefresh>{children}</PullToRefresh>
            </div>
          </main>
        </div>

        {/* ── Tab bar ────────────────────────────────────────
            Floating glass, but still an ordinary flex child: the drift this
            avoids on iOS comes from `position: fixed`, not from the look. */}
        <div className="md:hidden shrink-0 z-40 px-3 pt-1 pb-[calc(8px+env(safe-area-inset-bottom,0px))]">
          <nav className="material rounded-[26px] border border-separator shadow-lg shadow-black/5 flex items-stretch justify-around h-[58px] px-1">
            {PHONE_NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`press flex flex-col items-center justify-center gap-1 flex-1 min-w-[56px] rounded-[22px] ${
                    active ? 'text-accent' : 'text-label-tertiary'
                  }`}
                >
                  <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
                  <span className="text-[10px] font-medium tracking-tight">{label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-label="עוד מסכים"
              className={`press flex flex-col items-center justify-center gap-1 flex-1 min-w-[56px] rounded-[22px] ${
                moreOpen || MORE_ONLY.some((i) => isActive(pathname, i.href)) ? 'text-accent' : 'text-label-tertiary'
              }`}
            >
              <Ellipsis size={22} strokeWidth={moreOpen ? 2.4 : 1.9} />
              <span className="text-[10px] font-medium tracking-tight">עוד</span>
            </button>
          </nav>
        </div>

        {/* ── "עוד" ───────────────────────────────────────────
            Everything the bar could not hold, in the groups the desktop rail
            uses, so the two shapes of the app teach the same map. */}
        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <button
              type="button"
              aria-label="סגירה"
              onClick={() => setMoreOpen(false)}
              className="sheet-scrim absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="עוד מסכים"
              className="sheet-panel relative material rounded-t-[26px] border-t border-separator px-3 pt-2 pb-[calc(14px+env(safe-area-inset-bottom,0px))] max-h-[80dvh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-[17px] font-bold text-label tracking-tight">הכול</span>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="סגירה"
                  className="press touch-target rounded-full text-label-tertiary"
                >
                  <X size={19} strokeWidth={2.2} />
                </button>
              </div>

              {NAV_GROUPS.map((group, gi) => (
                <div key={group.title} className={gi > 0 ? 'mt-3' : ''}>
                  <div className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-label-tertiary">
                    {group.title}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.items.map(({ href, label, icon: Icon }) => {
                      const active = isActive(pathname, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMoreOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`press flex items-center gap-2.5 px-3 py-3 rounded-2xl text-[15px] font-medium ${
                            active ? 'bg-accent-tint text-accent' : 'bg-fill/60 text-label'
                          }`}
                        >
                          <Icon size={18} strokeWidth={active ? 2.3 : 2} />
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              <Link
                href="/settings"
                onClick={() => setMoreOpen(false)}
                className="press flex items-center gap-2.5 mt-3 px-3 py-3 rounded-2xl bg-fill/60 text-label text-[15px] font-medium"
              >
                <Settings size={18} strokeWidth={2} />
                <span>הגדרות</span>
              </Link>
              <Link
                href="/properties/new"
                onClick={() => setMoreOpen(false)}
                className="press flex items-center justify-center gap-2 mt-2 px-3 py-3 rounded-2xl bg-accent text-white text-[15px] font-semibold"
              >
                <Plus size={18} strokeWidth={2.5} />
                <span>נכס חדש</span>
              </Link>
            </div>
          </div>
        )}

        <AssistantChat />
        <FreshnessGuard />
      </div>
    </ToastProvider>
  );
}
