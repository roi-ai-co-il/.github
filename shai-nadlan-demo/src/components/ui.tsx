import type { ElementType, ReactNode } from 'react';
import { PROPERTY_STATUS } from '@/lib/domain';

/** iOS icon chip: a tinted rounded square with the glyph in the same hue. */
export function IconChip({ icon: Icon, tone = 'accent', size = 'md' }: {
  icon: ElementType;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
}) {
  const tones: Record<string, string> = {
    accent: 'bg-accent-tint text-accent',
    success: 'bg-success-tint text-success',
    warning: 'bg-warning-tint text-warning',
    danger: 'bg-danger-tint text-danger',
    info: 'bg-info-tint text-info',
    neutral: 'bg-fill text-neutral',
  };
  const box = size === 'sm' ? 'w-8 h-8 rounded-[10px]' : 'w-10 h-10 rounded-xl';
  return (
    <div className={`${box} ${tones[tone]} flex items-center justify-center shrink-0`}>
      <Icon size={size === 'sm' ? 16 : 19} strokeWidth={2} />
    </div>
  );
}

export function StatCard({ title, value, sub, icon, tone = 'accent' }: {
  title: string;
  value: string | number;
  sub?: string;
  icon: ElementType;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}) {
  return (
    <div className="press bg-surface rounded-2xl border border-separator p-3.5 md:p-4">
      <div className="flex items-center gap-2.5">
        <IconChip icon={icon} tone={tone} size="sm" />
        <p className="text-[13px] text-label-secondary font-medium leading-tight">{title}</p>
      </div>
      {/* No truncate on money: in RTL it eats the LEADING digits. */}
      <p className={`mt-2.5 font-bold text-label whitespace-nowrap leading-none tracking-tight ${
        String(value).length > 9 ? 'text-lg md:text-xl' : 'text-[22px] md:text-2xl'
      }`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-label-tertiary mt-1.5">{sub}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = PROPERTY_STATUS[status];
  if (!s) return <span className="text-[13px] text-label-secondary">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ${s.text} ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

/**
 * An iOS inset grouped list: a quiet caption above, then one rounded card
 * whose rows are divided by hairlines rather than boxed separately.
 */
export function Group({ title, action, children, className = '' }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <header className="flex items-end justify-between gap-3 px-1 mb-2">
          {title && <h2 className="text-[15px] font-bold text-label tracking-tight">{title}</h2>}
          {action}
        </header>
      )}
      <div className="bg-surface rounded-2xl border border-separator overflow-hidden">
        {children}
      </div>
    </section>
  );
}

/** Rows inside a Group, divided the way iOS divides table cells. */
export function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-separator">{children}</div>;
}

export function EmptyState({ icon: Icon, text }: { icon: ElementType; text: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <Icon size={34} className="mx-auto text-label-tertiary mb-2.5" strokeWidth={1.5} />
      <p className="text-label-secondary text-[15px]">{text}</p>
    </div>
  );
}

/** A filled iOS button: solid accent, full-width by default on mobile. */
export function PrimaryButton({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`press touch-target inline-flex items-center justify-center gap-2 px-5 py-3 bg-accent text-white font-semibold text-[15px] rounded-2xl disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
