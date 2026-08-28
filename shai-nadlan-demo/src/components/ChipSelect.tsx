'use client';

/**
 * A choice rendered in the system's own language — the same chips the
 * properties filter uses — instead of the browser's built-in dropdown.
 * Options wrap onto as many rows as they need; the selected chip is filled.
 */
export default function ChipSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; dot?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[13px] font-medium text-label-secondary mb-1.5 mr-1">{label}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={`press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[14px] font-medium border ${
                active
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-sunken text-label-secondary border-separator'
              }`}
            >
              {o.dot && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : o.dot}`} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
