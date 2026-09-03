'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, Building2, FileText, LogOut, Moon, Sun, Plus, LifeBuoy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import WelcomeOverlay from '@/components/WelcomeOverlay';
import AssistantChat from '@/components/AssistantChat';
import FreshnessGuard from '@/components/FreshnessGuard';
import PullToRefresh from '@/components/PullToRefresh';
import { ToastProvider } from '@/components/Toast';

/** Where a fault in this system gets reported. Shai signs in there with a
 *  one-time code sent to the same address he uses here. */
const SUPPORT_URL = 'https://tikunim.roiai.co.il';

const NAV_ITEMS = [
  { href: '/', label: 'בית', icon: LayoutGrid },
  { href: '/properties', label: 'נכסים', icon: Building2 },
  { href: '/leases', label: 'חוזים', icon: FileText },
];

/** The title the nav bar shows once the page's own large title scrolls away. */
const BAR_TITLES: Record<string, string> = {
  '/': 'סקירה',
  '/properties': 'נכסים',
  '/leases': 'חוזים',
  '/properties/new': 'נכס חדש',
  '/tenants': 'שוכרים',
};

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
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
  }, [pathname]);

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

            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`press flex items-center gap-2 px-3.5 py-2 rounded-xl text-[15px] font-medium ${
                    isActive(pathname, href)
                      ? 'bg-accent-tint text-accent'
                      : 'text-label-secondary hover:bg-fill'
                  }`}
                >
                  <Icon size={17} strokeWidth={2} />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              <Link
                href="/properties/new"
                className="press hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent text-white text-[14px] font-semibold"
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>נכס חדש</span>
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

        {/* ── Main — the app's single scroll container ───────── */}
        <main id="app-scroll" className="flex-1 min-h-0 overflow-y-auto overscroll-contain w-full px-4 py-5 md:px-6 md:py-7">
          <div className="max-w-5xl w-full mx-auto">
            <PullToRefresh>{children}</PullToRefresh>
          </div>
        </main>

        {/* ── Tab bar ────────────────────────────────────────
            Floating glass, but still an ordinary flex child: the drift this
            avoids on iOS comes from `position: fixed`, not from the look. */}
        <div className="md:hidden shrink-0 z-40 px-3 pt-1 pb-[calc(8px+env(safe-area-inset-bottom,0px))]">
          <nav className="material rounded-[26px] border border-separator shadow-lg shadow-black/5 flex items-stretch justify-around h-[58px] px-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
            <Link
              href="/properties/new"
              className="press flex flex-col items-center justify-center gap-1 flex-1 min-w-[56px] rounded-[22px] text-label-tertiary"
            >
              <Plus size={22} strokeWidth={2.2} />
              <span className="text-[10px] font-medium tracking-tight">הוספה</span>
            </Link>
          </nav>
        </div>

        <AssistantChat />
        <FreshnessGuard />
      </div>
    </ToastProvider>
  );
}
