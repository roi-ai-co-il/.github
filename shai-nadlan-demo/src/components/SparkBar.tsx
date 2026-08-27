export function SparkBar({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-brand-beige/40">
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.label}
                className={`${s.color} transition-all duration-500`}
                style={{ width: `${(s.value / total) * 100}%` }}
                title={`${s.label}: ${s.value}`}
              />
            ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-brand-gray-light">
            <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
            <span>{s.label}</span>
            <span className="font-bold text-brand-brown">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
