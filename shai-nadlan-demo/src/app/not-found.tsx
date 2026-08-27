import Link from 'next/link';
import { Building2 } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-brand-parchment flex flex-col items-center justify-center gap-4 px-4 text-center">
      <Building2 size={48} className="text-brand-sand" strokeWidth={1.2} />
      <h1 className="text-xl font-bold text-brand-brown">העמוד לא נמצא</h1>
      <p className="text-sm text-brand-gray-light">ייתכן שהנכס הוסר או שהקישור שגוי</p>
      <Link
        href="/"
        className="mt-2 px-5 py-2.5 bg-gold hover:bg-gold-deep text-ink font-semibold text-sm rounded-xl transition-all duration-300 shadow-lg shadow-gold/20"
      >
        חזרה לדשבורד
      </Link>
    </div>
  );
}
