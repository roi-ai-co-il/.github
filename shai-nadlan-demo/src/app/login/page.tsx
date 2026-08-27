'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const DEMO_EMAIL = 'shai@nadlan-demo.co.il';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      // A dropped connection is not a wrong password — telling the client their
      // credentials are wrong when the phone lost signal sends them in circles.
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      setError(
        offline || err.message.toLowerCase().includes('fetch')
          ? 'אין חיבור לאינטרנט — בדוק את הרשת ונסה שוב'
          : 'פרטי ההתחברות שגויים — נסה שוב',
      );
      setLoading(false);
      return;
    }
    router.replace('/');
    router.refresh();
  };

  const field =
    'w-full bg-surface-sunken rounded-xl px-4 py-3 text-[16px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30 text-left';

  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[340px] animate-in">
        {/* Mark */}
        <div className="flex flex-col items-center text-center">
          <div className="w-[68px] h-[68px] rounded-[22px] bg-accent flex items-center justify-center">
            <Building2 size={32} className="text-white" strokeWidth={2} />
          </div>
          <h1 className="mt-5 text-[27px] font-bold text-label tracking-tight leading-none">שי עובדיה</h1>
          <p className="mt-2 text-[15px] text-label-secondary">ניהול תיק נדל״ן</p>
        </div>

        {/* Form */}
        <form onSubmit={signIn} className="mt-8 space-y-3">
          <div>
            <label htmlFor="email" className="block text-[13px] font-medium text-label-secondary mb-1.5 mr-1">
              אימייל
            </label>
            <input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-[13px] font-medium text-label-secondary mb-1.5 mr-1">
              סיסמה
            </label>
            <input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="text-[13px] font-medium text-danger bg-danger-tint rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="press touch-target w-full flex items-center justify-center gap-2 py-3.5 bg-accent text-white font-semibold text-[16px] rounded-xl disabled:opacity-40 !mt-5"
          >
            {loading && <Loader2 size={17} className="animate-spin" />}
            <span>{loading ? 'מתחבר…' : 'כניסה'}</span>
          </button>

          <button
            type="button"
            onClick={() => setEmail(DEMO_EMAIL)}
            className="press w-full py-2 text-[14px] text-accent font-medium"
          >
            מילוי אימייל דמו
          </button>
        </form>

        <p className="mt-10 text-center text-[12px] text-label-tertiary">
          פותח על ידי{' '}
          <a href="https://roiai.co.il" target="_blank" rel="noopener noreferrer" className="text-label-secondary">
            ROI AI
          </a>
        </p>
      </div>
    </div>
  );
}
