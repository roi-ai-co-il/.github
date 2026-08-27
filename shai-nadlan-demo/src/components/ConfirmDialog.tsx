'use client';

import { useEffect } from 'react';

/**
 * An iOS alert: dimmed backdrop, a small centred card, and the destructive
 * choice coloured rather than shouted. Nothing irreversible happens without
 * passing through here.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'אישור',
  cancelLabel = 'ביטול',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Escape closes, and the page behind must not scroll while the alert is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-[300px] bg-surface rounded-2xl overflow-hidden shadow-2xl animate-in">
        <div className="px-5 pt-5 pb-4 text-center">
          <h2 className="text-[17px] font-bold text-label tracking-tight">{title}</h2>
          {message && <p className="text-[14px] text-label-secondary mt-1.5 leading-snug">{message}</p>}
        </div>
        {/* Stacked buttons divided by hairlines, as iOS alerts do. */}
        <div className="grid grid-cols-2 border-t border-separator">
          <button
            onClick={onCancel}
            className="press-row py-3 text-[16px] font-medium text-accent border-l border-separator"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`press-row py-3 text-[16px] font-semibold ${danger ? 'text-danger' : 'text-accent'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
