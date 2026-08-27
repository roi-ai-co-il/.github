import Link from 'next/link';
import { Building2 } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col items-center justify-center gap-3 px-6 text-center">
      <Building2 size={44} className="text-label-tertiary" strokeWidth={1.5} />
      <h1 className="text-[22px] font-bold text-label tracking-tight">העמוד לא נמצא</h1>
      <p className="text-[15px] text-label-secondary">ייתכן שהנכס הוסר או שהקישור שגוי</p>
      <Link
        href="/"
        className="press mt-3 px-5 py-2.5 bg-accent text-white font-semibold text-[15px] rounded-xl"
      >
        חזרה לדשבורד
      </Link>
    </div>
  );
}
