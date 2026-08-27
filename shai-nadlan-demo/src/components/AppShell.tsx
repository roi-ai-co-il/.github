'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, Building2, FileText, LogOut, Moon, Sun, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import WelcomeOverlay from '@/components/WelcomeOverlay';

const NAV_ITEMS = [
  { href: '/', label: 'בית', icon: LayoutGrid },
  { href: '/properties', label: 'נכסים', icon: Building2 },
  { href: '/leases', label: 'חוזים', icon: FileText },
];

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

  // Only the app shell owns an inner scroller; login renders outside it.
  useEffect(() => {
    document.body.classList.add('app-shell-locked');
    return () => document.body.classList.remove('app-shell-locked');
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-canvas">
      <WelcomeOverlay firstName={firstName} />

      {/* ── Navigation bar — translucent over the scrolling content ──── */}
      <header className="shrink-0 z-40 bg-canvas/80 backdrop-blur-xl border-b border-separator safe-top">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-4 md:px-6 h-[52px] md:h-[60px]">
          <Link href="/" className="press flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[10px] bg-accent flex items-center justify-center">
              <Building2 size={17} className="text-white" strokeWidth={2.2} />
            </div>
            <span className="font-bold text-[17px] text-label tracking-tight">שי עובדיה</span>
          </Link>

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

          <div className="flex items-center gap-1 md:gap-2">
            <Link
              href="/properties/new"
              className="press hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent text-white text-[14px] font-semibold"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>נכס חדש</span>
            </Link>
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
        <div className="max-w-5xl w-full mx-auto">{children}</div>
      </main>

      {/* ── Tab bar (flex child, never fixed — it cannot drift on iOS) ──── */}
      <nav className="md:hidden shrink-0 z-40 bg-canvas/85 backdrop-blur-xl border-t border-separator safe-bottom">
        <div className="flex items-stretch justify-around h-[56px]">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`press flex flex-col items-center justify-center gap-1 flex-1 min-w-[56px] ${
                  active ? 'text-accent' : 'text-label-tertiary'
                }`}
              >
                <Icon size={23} strokeWidth={active ? 2.4 : 1.9} />
                <span className="text-[10px] font-medium tracking-tight">{label}</span>
              </Link>
            );
          })}
          <Link
            href="/properties/new"
            className="press flex flex-col items-center justify-center gap-1 flex-1 min-w-[56px] text-label-tertiary"
          >
            <Plus size={23} strokeWidth={2.2} />
            <span className="text-[10px] font-medium tracking-tight">הוספה</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
