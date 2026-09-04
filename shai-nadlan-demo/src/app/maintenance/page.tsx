import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'אנחנו בשיפוצים' };

/**
 * What Shai meets while the portfolio is still being shaped.
 *
 * Deliberately warm rather than an error page: nothing is broken, and the only
 * thing he has to do is wait. It greets him by name and says what is going on
 * in one sentence, because "we are working on it" with no subject is what makes
 * a maintenance notice feel like a brush-off.
 */
export default async function MaintenancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const firstName = (user?.email ?? '').split('@')[0].includes('shai') ? 'שי' : null;

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-surface-sunken">
      <div className="w-full max-w-md text-center">
        {/* A building with scaffolding on it — the one drawing on the page, so
            it carries the tone by itself. */}
        <svg viewBox="0 0 200 150" className="w-44 h-33 mx-auto" role="img" aria-label="בניין בשיפוצים">
          <title>בניין עטוף בפיגומים</title>
          <rect x="58" y="34" width="84" height="96" rx="6" className="fill-surface stroke-separator" strokeWidth="2" />
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={70 + col * 22} y={46 + row * 24} width="14" height="16" rx="2.5"
                className={row === 1 && col === 1 ? 'fill-accent/25' : 'fill-fill'}
              />
            )),
          )}
          {/* scaffolding */}
          <g className="stroke-accent" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85">
            <path d="M50 30 V134 M150 30 V134" />
            <path d="M50 58 H150 M50 90 H150 M50 122 H150" />
            <path d="M44 30 H156" strokeWidth="3" />
          </g>
          {/* a little crane, because it is the detail that makes it read as work
              in progress rather than as a closed shop */}
          <g className="stroke-warning" strokeWidth="2.5" strokeLinecap="round" fill="none">
            <path d="M168 130 V44 M168 44 H128 M168 44 H182" />
            <path d="M136 44 V60" />
          </g>
          <circle cx="136" cy="66" r="5.5" className="fill-warning" />
          <path d="M30 134 H186" className="stroke-separator" strokeWidth="3" strokeLinecap="round" />
        </svg>

        <h1 className="text-[28px] font-bold text-label tracking-tight mt-5">
          {firstName ? `${firstName}, אנחנו בשיפוצים` : 'אנחנו בשיפוצים'}
        </h1>
        <p className="text-[16px] text-label-secondary leading-relaxed mt-2.5">
          המערכת שלך בבנייה ממש עכשיו — מסדרים את הנכסים, החוזים והגבייה כדי שהכול
          יחכה לך מוכן. נודיע לך ברגע שאפשר להיכנס.
        </p>

        <div className="bg-surface rounded-2xl border border-separator p-4 mt-6 text-right">
          <p className="text-[13px] font-semibold text-label mb-1">בינתיים, אם צריך משהו</p>
          <p className="text-[14px] text-label-secondary leading-relaxed">
            אפשר לכתוב לרועי ישירות והוא יחזור אליך.
          </p>
          <a
            href="https://wa.me/972544994224"
            target="_blank"
            rel="noreferrer"
            className="press touch-target inline-flex items-center justify-center gap-2 w-full mt-3 py-3 rounded-xl bg-accent text-white font-semibold text-[15px]"
          >
            שליחת הודעה לרועי
          </a>
        </div>

        <div className="flex items-center justify-center gap-3 mt-6 text-[13px]">
          <SignOutButton />
          <span className="text-separator">·</span>
          <Link href="https://roiai.co.il" className="text-label-tertiary">פותח על ידי ROI AI</Link>
        </div>
      </div>
    </main>
  );
}
