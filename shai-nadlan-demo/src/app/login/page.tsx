'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, KeyRound, Loader2, Sparkles } from 'lucide-react';
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

  return (
    <div className="min-h-[100dvh] bg-ink flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Soft gold glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-gold/[0.07] blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm animate-ios-fade-in relative">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-white/[0.06] border border-gold/25 backdrop-blur-xl flex items-center justify-center shadow-2xl shadow-gold/10">
            <Building2 size={30} className="text-gold" strokeWidth={1.5} />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-white tracking-tight">שי עובדיה</h1>
          <p className="mt-1 text-sm text-ink-muted/70 tracking-widest font-medium">ניהול תיק נדל״ן</p>
          <div className="mt-5 h-px bg-gradient-to-l from-transparent via-gold/40 to-transparent" />
        </div>

        {/* Card */}
        <form
          onSubmit={signIn}
          className="bg-white/[0.05] backdrop-blur-2xl border border-white/10 rounded-3xl p-6 md:p-7 shadow-2xl shadow-black/30 space-y-4"
        >
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-ink-muted/80 mb-1.5">
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
              className="w-full bg-white/[0.06] border border-white/15 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/40 transition-all text-left"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-ink-muted/80 mb-1.5">
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
              className="w-full bg-white/[0.06] border border-white/15 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/40 transition-all text-left"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gold hover:bg-gold-deep text-ink font-bold text-sm rounded-2xl transition-all duration-300 shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30 disabled:opacity-50 touch-target"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            <span>{loading ? 'מתחבר…' : 'כניסה למערכת'}</span>
          </button>

          <button
            type="button"
            onClick={() => setEmail(DEMO_EMAIL)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-ink-muted/50 hover:text-gold transition-colors font-medium"
          >
            <Sparkles size={12} />
            <span>מילוי אימייל דמו</span>
          </button>
        </form>

        <p className="mt-8 text-center text-[11px] text-white/25 font-medium">
          פותח על ידי{' '}
          <a href="https://roiai.co.il" target="_blank" rel="noopener noreferrer" className="text-gold/60 hover:text-gold transition-colors">
            ROI AI
          </a>
        </p>
      </div>
    </div>
  );
}
