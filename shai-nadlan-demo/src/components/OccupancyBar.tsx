export function OccupancyBar({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);

  return (
    <div>
      {/* Segments are separated by a gap rather than a border, so the bar keeps
          reading as one track at any width. */}
      <div className="flex gap-0.5 h-2.5">
        {total === 0 ? (
          <div className="flex-1 rounded-full bg-fill" />
        ) : (
          shown.map((s) => (
            <div
              key={s.label}
              className={`${s.color} rounded-full`}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value}`}
            />
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[13px]">
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="text-label-secondary">{s.label}</span>
            <span className="font-semibold text-label">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
