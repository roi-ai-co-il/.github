'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';

const THRESHOLD = 70;
const MAX_PULL = 120;

/**
 * Pull down at the top of the list to refetch, the way every iOS app behaves.
 * Mobile only — on a pointer device the browser's own reload is the gesture.
 */
export default function PullToRefresh({ children }: { children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);

  useEffect(() => {
    // The document does not scroll — `main#app-scroll` does (see globals.css).
    // Reading window.scrollY here would be permanently 0, so the pull would arm
    // itself anywhere in the list instead of only at the top.
    const atTop = () => {
      const scroller = document.getElementById('app-scroll');
      return scroller ? scroller.scrollTop <= 0 : window.scrollY <= 0;
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing || !atTop()) return;
      startY.current = e.touches[0].clientY;
      tracking.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking.current || startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // Resistance, so the sheet feels attached to the finger rather than free.
      setPull(Math.min(MAX_PULL, delta * 0.55));
      if (delta > 8 && e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!tracking.current) return;
      tracking.current = false;
      startY.current = null;
      if (pull >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        // A full reload, not router.refresh(): the gesture's contract is
        // "give me the latest" — data AND the latest deployed build. The
        // spinner stays up until the new document takes over.
        window.location.reload();
      } else {
        setPull(0);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [pull, refreshing]);

  const ready = pull >= THRESHOLD;

  return (
    <div className="relative">
      <div
        className="pointer-events-none fixed left-0 right-0 flex justify-center z-30 md:hidden"
        style={{
          top: 'calc(52px + env(safe-area-inset-top, 0px))',
          transform: `translateY(${refreshing ? 10 : Math.min(pull - 30, 16)}px)`,
          opacity: refreshing ? 1 : Math.min(1, pull / THRESHOLD),
          transition: tracking.current ? 'none' : 'transform 200ms ease, opacity 200ms ease',
        }}
        aria-hidden={!refreshing && pull === 0}
      >
        <div className="bg-surface border border-separator rounded-full shadow-lg p-2.5">
          <RotateCw
            size={18}
            strokeWidth={2.2}
            className={refreshing ? 'animate-spin text-accent' : ready ? 'text-accent' : 'text-label-tertiary'}
            style={{
              transform: refreshing ? undefined : `rotate(${(pull / THRESHOLD) * 360}deg)`,
              transition: tracking.current ? 'none' : 'transform 200ms ease',
            }}
          />
        </div>
      </div>

      {/* The transform is applied only during a pull: a transform on an ancestor
          becomes the containing block for `position: fixed` children, which
          would silently drag any open dialog off-screen with it. */}
      <div
        style={
          refreshing || pull > 0
            ? {
                transform: `translateY(${refreshing ? 28 : pull}px)`,
                transition: tracking.current ? 'none' : 'transform 250ms ease',
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
