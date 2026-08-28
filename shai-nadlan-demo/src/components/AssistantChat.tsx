'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'מה שווי התיק הכולל?',
  'אילו חוזים מסתיימים בקרוב?',
  'אילו נכסים פנויים כרגע?',
  'כמה שכר דירה נכנס בחודש?',
];

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: messages.slice(-10) }),
      });
      const json = res.ok ? await res.json() : null;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: json?.answer ?? 'אירעה שגיאה. נסה שוב.' },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'אירעה שגיאה. נסה שוב.' }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press fixed bottom-[88px] left-4 md:bottom-8 md:left-8 z-40 w-12 h-12 rounded-full bg-accent text-white shadow-lg shadow-accent/30 flex items-center justify-center"
        title="עוזר חכם"
        aria-label="עוזר חכם"
      >
        <Sparkles size={21} strokeWidth={2.1} />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 md:inset-x-auto md:bottom-8 md:left-8 z-50 w-full md:w-[400px] h-[72dvh] md:h-[520px] material rounded-t-3xl md:rounded-3xl border border-separator shadow-2xl shadow-black/15 flex flex-col overflow-hidden animate-in">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 h-[52px] edge-line">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-[9px] bg-accent-tint text-accent flex items-center justify-center">
            <Sparkles size={15} strokeWidth={2.2} />
          </span>
          <span className="text-[15px] font-semibold text-label">עוזר חכם</span>
          <span className="text-[10px] font-semibold text-accent bg-accent-tint rounded-full px-1.5 py-0.5">AI</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="press touch-target rounded-full text-label-secondary hover:text-label"
          aria-label="סגירה"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5 scrollbar-hide">
        {messages.length === 0 && !loading && (
          <div className="text-center pt-8">
            <span className="mx-auto mb-3 w-11 h-11 rounded-[14px] bg-accent-tint text-accent flex items-center justify-center">
              <Sparkles size={22} strokeWidth={2} />
            </span>
            <p className="text-[14px] text-label-secondary mb-4">שאל אותי כל שאלה על תיק הנכסים</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="press text-[12px] font-medium text-accent bg-accent-tint rounded-full px-3.5 py-2"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-accent text-white'
                  : 'bg-surface-sunken text-label border border-separator'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-end">
            <div className="bg-surface-sunken border border-separator rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full bg-label-tertiary animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 py-2.5 border-t border-separator safe-bottom">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="שאל אותי משהו…"
            dir="rtl"
            className="flex-1 bg-surface-sunken border border-separator rounded-xl px-4 py-2.5 text-[14px] text-label outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-label-tertiary"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="press w-11 h-11 shrink-0 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-40"
            aria-label="שליחה"
          >
            <Send size={16} strokeWidth={2.2} className="-scale-x-100" />
          </button>
        </div>
      </div>
    </div>
  );
}
