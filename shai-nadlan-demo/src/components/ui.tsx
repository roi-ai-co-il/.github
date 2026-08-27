import type { ElementType, ReactNode } from 'react';
import { PROPERTY_STATUS } from '@/lib/domain';

export function StatCard({ title, value, sub, icon: Icon, iconColor }: {
  title: string;
  value: string | number;
  sub?: string;
  icon: ElementType;
  iconColor: string;
}) {
  return (
    <div className="ios-press bg-white/80 backdrop-blur-xl rounded-2xl md:rounded-3xl border border-white/20 p-3 md:p-5 flex items-center gap-3 md:gap-4 shadow-xl shadow-black/[0.03] hover:shadow-2xl hover:shadow-gold/15 hover:border-gold/30 hover:-translate-y-0.5 transition-all duration-200 group cursor-default">
      <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 bg-white/60 border border-gold/10 shadow-sm transition-transform duration-300 group-hover:scale-110">
        <Icon size={20} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-brand-gray-light font-medium tracking-wide">{title}</p>
        {/* No truncate on money: in RTL it eats the LEADING digits. */}
        <p className={`font-bold text-brand-brown mt-0.5 whitespace-nowrap leading-tight ${String(value).length > 8 ? 'text-sm md:text-lg' : 'text-base md:text-xl'}`}>
          {value}
        </p>
        {sub && <p className="text-[10px] text-brand-gray-light mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = PROPERTY_STATUS[status] ?? { label: status, dot: 'bg-gray-400', text: 'text-gray-700', bg: 'bg-gray-50' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${s.text} ${s.bg}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function SectionCard({ title, icon: Icon, action, children }: {
  title: string;
  icon: ElementType;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 overflow-hidden shadow-xl shadow-black/[0.03]">
      <div className="px-5 md:px-6 py-4 border-b border-gold/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-gold" />
          <h2 className="text-base font-bold text-brand-brown">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, text }: { icon: ElementType; text: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <Icon size={40} className="mx-auto text-brand-sand/60 mb-3" />
      <p className="text-brand-gray-light text-sm">{text}</p>
    </div>
  );
}

export function GoldDivider() {
  return <div className="h-px bg-gradient-to-l from-transparent via-gold/50 to-transparent" />;
}
