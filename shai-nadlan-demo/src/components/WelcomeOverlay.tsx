'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';

const HOLD_MS = 2100;
const EXIT_MS = 450;
/** Returning to the app after this long away counts as a new entry. */
const AWAY_MS = 20 * 60_000;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 18) return 'צהריים טובים';
  return 'ערב טוב';
}

/**
 * The greeting Shai sees when he opens the system — on every entry:
 * each full load, and again when the app returns to the foreground after
 * a real absence (a quick hop to WhatsApp and back stays quiet). The
 * greeting itself follows the clock: בוקר טוב / צהריים טובים / ערב טוב.
 * Dismissible on tap.
 */
export default function WelcomeOverlay({ firstName }: { firstName: string }) {
  // Start hidden so SSR never flashes the overlay; the first effect run
  // plays it immediately on the client.
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');
  const [line, setLine] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hiddenAt = useRef<number | null>(null);

  const play = () => {
    timers.current.forEach(clearTimeout);
    setLine(greeting());
    setPhase('in');
    timers.current = [
      setTimeout(() => setPhase('out'), HOLD_MS),
      setTimeout(() => setPhase('hidden'), HOLD_MS + EXIT_MS),
    ];
  };

  useEffect(() => {
    play();

    // An installed home-screen app rarely reloads — reopening it resumes the
    // page. Treat coming back after a real absence as a fresh entry.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= AWAY_MS) {
        play();
      }
      hiddenAt.current = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      timers.current.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
