'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Building2, FileText, LogOut, Moon, Sun, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/', label: 'בית', icon: LayoutDashboard },
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
      className="p-2 rounded-xl text-ink-muted/40 hover:text-gold hover:bg-gold/[0.08] transition-all duration-200 relative after:absolute after:-inset-1.5 after:content-['']"
      title={dark ? 'מצב בהיר' : 'מצב כהה'}
      aria-label={dark ? 'מצב בהיר' : 'מצב כהה'}
    >
      {dark ? <Sun size={15} strokeWidth={1.5} /> : <Moon size={15} strokeWidth={1.5} />}
    </button>
  );
}

export default function AppShell({ children, email }: { children: React.ReactNode; email: string }) {
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
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-brand-parchment">
      {/* ── Header (ink plaque) ─────────────────────────── */}
      <header className="bg-ink/90 backdrop-blur-2xl text-white shrink-0 z-50 shadow-2xl shadow-black/[0.06] safe-top">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 md:px-8 h-[56px] md:h-[68px]">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 md:gap-3.5">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl bg-white/10 backdrop-blur-xl border border-gold/20 flex items-center justify-center">
              <Building2 size={18} className="text-gold" strokeWidth={1.5} />
            </div>
            <div className="leading-tight">
              <span className="text-ink-muted font-semibold text-sm md:text-base tracking-tight block">שי עובדיה</span>
              <span className="text-brand-gray-light text-[10px] tracking-widest font-medium hidden sm:block">ניהול תיק נדל”ן</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive(pathname, href)
                    ? 'bg-gold/12 text-gold'
                    : 'text-ink-muted/50 hover:text-ink-muted hover:bg-white/[0.06]'
                }`}
              >
                <Icon size={16} strokeWidth={1.5} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1.5 md:gap-3">
            <Link
              href="/properties/new"
              className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-all duration-200 shadow-lg shadow-gold/20"
            >
              <Plus size={14} />
              <span>נכס חדש</span>
            </Link>
            <ThemeToggle />
            <span className="text-xs text-ink-muted/40 hidden lg:inline font-medium" dir="ltr">{email}</span>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-xl text-xs text-ink-muted/40 hover:text-red-400 hover:bg-white/[0.06] transition-all duration-200 font-medium relative after:absolute after:-inset-1.5 after:content-['']"
              title="יציאה"
            >
              <LogOut size={14} strokeWidth={1.5} />
              <span className="hidden md:inline">יציאה</span>
            </button>
          </div>
        </div>
        <div className="h-px bg-gradient-to-l from-transparent via-gold/30 to-transparent" />
      </header>

      {/* ── Main — the app's single scroll container ───────── */}
      <main id="app-scroll" className="flex-1 min-h-0 overflow-y-auto overscroll-contain w-full px-4 py-5 md:px-8 md:py-8">
        <div className="max-w-6xl w-full mx-auto">{children}</div>
      </main>

      {/* ── Mobile bottom nav (flex child, never fixed) ──────── */}
      <nav className="md:hidden shrink-0 z-50 bg-white dark:bg-ink border-t border-brand-sand/20 safe-bottom">
        <div className="flex items-center justify-around h-[68px] px-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[48px] px-2 py-1 rounded-xl transition-all duration-200 ${
                  active ? 'text-gold' : 'text-brand-gray-light'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all duration-200 ${active ? 'bg-gold/12' : ''}`}>
                  <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
          <Link
            href="/properties/new"
            className="flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[48px] px-2 py-1 rounded-xl text-brand-gray-light"
          >
            <div className="p-1.5 rounded-xl bg-gold text-ink shadow-lg shadow-gold/25">
              <Plus size={20} strokeWidth={2} />
            </div>
            <span className="text-[10px] font-medium">הוספה</span>
          </Link>
        </div>
      </nav>

      {/* ── Footer (desktop only) ───────────────────────── */}
      <footer className="hidden md:block text-center py-5 text-xs text-brand-gray-light/50 font-medium shrink-0">
        <span>© {new Date().getFullYear()} שי עובדיה · ניהול נדל”ן — פותח על ידי </span>
        <a href="https://roiai.co.il" target="_blank" rel="noopener noreferrer" className="text-gold/70 hover:text-gold transition-colors">
          ROI AI
        </a>
      </footer>
    </div>
  );
}
