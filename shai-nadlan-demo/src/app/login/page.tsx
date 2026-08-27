'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ALLOWED_EMAIL, isAllowedEmail } from '@/lib/auth-config';

/** Supabase is configured for a 6-digit code (`mailer_otp_length: 6`). */
const CODE_LENGTH = 6;
/** The built-in mailer allows 2 sends an hour, so the resend timer is honest
 *  rather than optimistic — offering "resend" every 30s would just earn a 429. */
const RESEND_SECONDS = 60;

type Step = 'email' | 'code';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  /** Turn a Supabase failure into something the reader can act on. A dropped
   *  connection is not a wrong code, and a rate limit is not a wrong code
   *  either — telling someone their code is wrong when the mailer is throttled
   *  sends them round the loop that caused it. */
  const describe = (message: string) => {
    const m = message.toLowerCase();
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'אין חיבור לאינטרנט — בדוק את הרשת ונסה שוב';
    if (m.includes('fetch') || m.includes('network')) return 'אין חיבור לאינטרנט — בדוק את הרשת ונסה שוב';
    if (m.includes('rate limit') || m.includes('too many') || m.includes('429'))
      return 'נשלחו יותר מדי בקשות — יש להמתין כשעה לפני שליחה נוספת';
    if (m.includes('expired')) return 'הקוד פג תוקף — בקש קוד חדש';
    if (m.includes('invalid') || m.includes('token')) return 'הקוד שגוי — בדוק ונסה שוב';
    if (m.includes('signups not allowed') || m.includes('not allowed'))
      return 'הכתובת הזו אינה מורשית לכניסה';
    return 'משהו השתבש — נסה שוב';
  };

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    if (!isAllowedEmail(email)) {
      setError('הכתובת הזו אינה מורשית לכניסה למערכת');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    // shouldCreateUser:false — this is a sign-in, never a sign-up. Without it a
    // typo would silently create a second account that owns no data at all.
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (err) {
      setError(describe(err.message));
      return;
    }
    setStep('code');
    setCooldown(RESEND_SECONDS);
    setNotice('הקוד נשלח. בדוק את תיבת הדואר.');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (err) {
      setError(describe(err.message));
      setLoading(false);
      return;
    }
    // The session is written to a cookie by the SSR client and refreshed by the
    // middleware on every request, so this is the last time a code is needed
    // until the refresh token itself expires.
    router.replace('/');
    router.refresh();
  };

  const field =
    'w-full bg-surface-sunken rounded-xl px-4 py-3 text-[16px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30 text-left';

  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[340px] animate-in">
        <div className="flex flex-col items-center text-center">
          <div className="w-[68px] h-[68px] rounded-[22px] bg-accent flex items-center justify-center">
            <Building2 size={32} className="text-white" strokeWidth={2} />
          </div>
          <h1 className="mt-5 text-[27px] font-bold text-label tracking-tight leading-none">שי עובדיה</h1>
          <p className="mt-2 text-[15px] text-label-secondary">ניהול תיק נדל״ן</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="mt-8 space-y-3">
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

            <p className="text-[13px] text-label-tertiary leading-relaxed mr-1">
              נשלח קוד בן {CODE_LENGTH} ספרות לכתובת הזו.
            </p>

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
              <span>{loading ? 'שולח…' : 'שליחת קוד'}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
                setNotice(null);
              }}
              className="press flex items-center gap-1.5 text-[14px] text-accent font-medium"
            >
              <ArrowRight size={15} />
              <span>שינוי כתובת</span>
            </button>

            <div>
              <label htmlFor="code" className="block text-[13px] font-medium text-label-secondary mb-1.5 mr-1">
                קוד מהמייל
              </label>
              <input
                id="code"
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_LENGTH}
                dir="ltr"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                className={`${field} text-center tracking-[0.5em] font-semibold text-[22px]`}
                placeholder="------"
              />
              <p className="mt-1.5 text-[13px] text-label-tertiary mr-1" dir="ltr" style={{ textAlign: 'right' }}>
                {email}
              </p>
            </div>

            {notice && !error && (
              <p className="text-[13px] font-medium text-label-secondary bg-surface-sunken rounded-xl px-3.5 py-2.5">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="text-[13px] font-medium text-danger bg-danger-tint rounded-xl px-3.5 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || code.length < CODE_LENGTH}
              className="press touch-target w-full flex items-center justify-center gap-2 py-3.5 bg-accent text-white font-semibold text-[16px] rounded-xl disabled:opacity-40 !mt-5"
            >
              {loading && <Loader2 size={17} className="animate-spin" />}
              <span>{loading ? 'מאמת…' : 'כניסה'}</span>
            </button>

            <button
              type="button"
              onClick={() => sendCode()}
              disabled={loading || cooldown > 0}
              className="press w-full py-2 text-[14px] text-accent font-medium disabled:text-label-tertiary"
            >
              {cooldown > 0 ? `שליחה חוזרת בעוד ${cooldown}` : 'שליחת קוד חדש'}
            </button>
          </form>
        )}

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
