'use client';

import { useEffect, useRef } from 'react';

/**
 * An installed home-screen app can keep serving a stale build for days.
 * This pins the deployed commit at load, re-checks it when the app comes
 * back to the foreground (and every few minutes while visible), and does a
 * full reload the moment a newer deploy exists — so reopening the app
 * always lands on the latest version without anyone thinking about it.
 *
 * A failed probe is a failed probe, never "there is an update": offline or
 * a dropped request must not reload-loop the app.
 */
export default function FreshnessGuard() {
  const known = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const probe = async (): Promise<string | null> => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json();
        return typeof json?.v === 'string' ? json.v : null;
      } catch {
        return null;
      }
    };

    const checkNow = async () => {
      const v = await probe();
      if (cancelled || v === null) return;
      if (known.current === null) { known.current = v; return; }
      if (v !== known.current) window.location.reload();
    };

    checkNow();
    const onVisible = () => { if (document.visibilityState === 'visible') checkNow(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') checkNow();
    }, 5 * 60_000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(interval);
    };
  }, []);

  return null;
}
