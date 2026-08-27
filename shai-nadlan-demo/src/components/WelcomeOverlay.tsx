'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';

const SESSION_KEY = 'welcomed';
const HOLD_MS = 2100;
const EXIT_MS = 450;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 18) return 'צהריים טובים';
  return 'ערב טוב';
}

/**
 * The greeting Shai sees when he opens the system. Shown once per browser
 * session so it stays a welcome rather than an interruption on every
 * navigation, and dismissible on tap for anyone who has seen it enough.
 */
export default function WelcomeOverlay({ firstName }: { firstName: string }) {
  // Start hidden: the check reads sessionStorage, which only exists in the
  // browser, and rendering the overlay during SSR would flash it for everyone.
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');
  const [line, setLine] = useState('');

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      // Private mode or blocked storage: greet, don't crash.
      seen = false;
    }
    if (seen) return;

    setLine(greeting());
    setPhase('in');
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {}

    const toExit = setTimeout(() => setPhase('out'), HOLD_MS);
    const toGone = setTimeout(() => setPhase('hidden'), HOLD_MS + EXIT_MS);
    return () => {
      clearTimeout(toExit);
      clearTimeout(toGone);
    };
  }, []);

  if (phase === 'hidden') return null;

  return (
    <div
      onClick={() => setPhase('out')}
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas ${
        phase === 'out' ? 'welcome-out' : ''
      }`}
    >
      {/* Mark, with a ring that expands out of it once */}
      <div className="relative flex items-center justify-center">
        <span className="welcome-ring absolute w-20 h-20 rounded-[26px] border-2 border-accent" />
        <div className="welcome-mark w-20 h-20 rounded-[26px] bg-accent flex items-center justify-center shadow-lg shadow-accent/25">
          <Building2 size={36} className="text-white" strokeWidth={2} />
        </div>
      </div>

      <p className="welcome-line-1 mt-7 text-[15px] font-medium text-label-secondary">{line},</p>
      <h1 className="welcome-line-2 mt-1 text-[34px] font-bold text-label tracking-tight leading-none">
        {firstName}
      </h1>
      <p className="welcome-line-3 mt-3 text-[14px] text-label-tertiary">תיק הנדל״ן שלך מוכן</p>
    </div>
  );
}
