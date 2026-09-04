/**
 * Placeholder shown while a screen's data is on the way. It mirrors the real
 * layout — a title, a grouped list, a row of stat cards — so the page settles
 * into place instead of jumping when the content lands.
 */

function Bar({ className = '' }: { className?: string }) {
  return <div className={`bg-fill rounded-full ${className}`} />;
}

export function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      <div className="space-y-2">
        <Bar className="h-3 w-40" />
        <Bar className="h-7 w-32" />
      </div>

      <div className="space-y-2">
        <Bar className="h-4 w-24 mr-1" />
        <div className="bg-surface rounded-2xl border border-separator divide-y divide-separator">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex-1 space-y-2">
                <Bar className="h-4 w-44" />
                <Bar className="h-3 w-56" />
              </div>
              <Bar className="h-6 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Bar className="h-4 w-16 mr-1" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-surface rounded-2xl border border-separator p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[10px] bg-fill" />
                <Bar className="h-3 w-20" />
              </div>
              <Bar className="h-6 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
