'use client';

import { useRef, useState, type ReactNode } from 'react';

const OPEN_AT = 56;   // travel before the row commits to open
const MAX = 132;      // width of the revealed tray
const LOCK = 10;      // travel before the axis is decided

/**
 * iOS swipe actions: drag a row aside to reveal what you do with it. The
 * actions live under the row rather than on it, so the row stays uncluttered
 * until you reach for them.
 *
 * Mirrored for RTL. In a left-to-right app the row is pushed left and the
 * actions surface at its trailing edge on the right; here the trailing edge
 * is the left one, so the row is pushed RIGHT and the tray is uncovered on
 * the left. Getting this backwards makes the row slide over its own actions
 * instead of off them.
 */
export default function SwipeActions({ actions, children }: {
  actions: ReactNode;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'idle' | 'h' | 'v'>('idle');
  // The live travel is mirrored in a ref because React batches state updates:
  // when touch events arrive close together the end handler still closes over
  // the offset from the render before the drag, and the row snaps shut on a
  // gesture that should have opened it.
  const travel = useRef(0);

  const setTravel = (v: number) => {
    travel.current = v;
    setOffset(v);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axis.current = 'idle';
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current) return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;

    // Decide the axis once, then keep it: a row that steals a vertical drag
    // makes the whole list feel stuck.
    if (axis.current === 'idle') {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (axis.current === 'h') setDragging(true);
    }
    if (axis.current !== 'h') return;

    // Only a rightward sweep opens; pulling back past closed does nothing.
    setTravel(Math.min(MAX, Math.max(0, dx)));
  };

  const onTouchEnd = () => {
    if (axis.current === 'h') setTravel(travel.current >= OPEN_AT ? MAX : 0);
    start.current = null;
    axis.current = 'idle';
    setDragging(false);
  };

  const open = offset > 0;

  return (
    <div className="relative overflow-hidden">
      {/* The tray, revealed as the row moves off it */}
      <div
        className="absolute inset-y-0 left-0 flex items-stretch"
        style={{ width: MAX }}
        aria-hidden={!open}
      >
        {actions}
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="bg-surface relative"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {children}
      </div>

      {/* Tapping the row while the tray is open closes it, as iOS does,
          instead of firing whatever sits under the finger. */}
      {open && !dragging && (
        <button
          onClick={() => setTravel(0)}
          aria-label="סגור פעולות"
          className="absolute inset-y-0 right-0 z-10"
          style={{ width: `calc(100% - ${MAX}px)` }}
        />
      )}
    </div>
  );
}
