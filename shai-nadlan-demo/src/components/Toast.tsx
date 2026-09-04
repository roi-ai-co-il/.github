'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; type: ToastType };

const ToastContext = createContext<{ toast: (message: string, type?: ToastType) => void }>({
  toast: () => {},
});

export const useToast = () => useContext(ToastContext);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts((prev) => [...prev, { id: ++nextId, message, type }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Above the tab bar so a confirmation never lands under the thumb. */}
      <div
        className="fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 px-4 pb-[calc(72px+env(safe-area-inset-bottom,0px))] md:pb-6 pointer-events-none"
        role="region"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };
const TONES: Record<ToastType, string> = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-label text-canvas',
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const Icon = ICONS[toast.type];

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    // Fade out first, then unmount, so the exit is seen rather than snapped.
    const hide = setTimeout(() => setShown(false), 3000);
    const drop = setTimeout(onClose, 3400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
      clearTimeout(drop);
    };
  }, [onClose]);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 pr-4 pl-2.5 py-2.5 rounded-2xl shadow-lg text-[15px] font-medium max-w-[420px] w-full sm:w-auto transition-all duration-300 ${TONES[toast.type]} ${
        shown ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-95'
      }`}
    >
      <Icon size={18} strokeWidth={2.2} className="shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button onClick={onClose} aria-label="סגור" className="press p-1 rounded-full hover:bg-white/20 shrink-0">
        <X size={15} strokeWidth={2.5} />
      </button>
    </div>
  );
}
