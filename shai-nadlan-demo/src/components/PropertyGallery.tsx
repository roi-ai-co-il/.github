'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Building2, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Img = { id: string; url: string };

const MAX_FILE_MB = 8;

export default function PropertyGallery({ propertyId, propertyName, images, coverUrl }: {
  propertyId: string;
  propertyName: string;
  images: Img[];
  coverUrl: string | null;
}) {
  const router = useRouter();
  // Fall back to the cover when the gallery table is empty.
  const gallery: Img[] = images.length > 0 ? images : coverUrl ? [{ id: 'cover', url: coverUrl }] : [];
  const [selected, setSelected] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = gallery[Math.min(selected, gallery.length - 1)];

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    const supabase = createClient();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('לא מחובר');

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`"${file.name}" אינו קובץ תמונה`);
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          throw new Error(`"${file.name}" גדול מדי (מקסימום ${MAX_FILE_MB}MB)`);
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${user.id}/${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage.from('property-images').upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
        });
        if (upErr) throw new Error('העלאת התמונה נכשלה — נסה שוב');

        const { data: pub } = supabase.storage.from('property-images').getPublicUrl(path);
        const { error: insErr } = await supabase.from('property_images').insert({
          property_id: propertyId,
          url: pub.publicUrl,
          storage_path: path,
          sort_order: gallery.length,
        });
        if (insErr) throw new Error('שמירת התמונה נכשלה — נסה שוב');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהעלאת התמונה');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeImage = async (img: Img) => {
    if (img.id === 'cover') return;
    setError(null);
    const supabase = createClient();
    const { error: delErr } = await supabase.from('property_images').delete().eq('id', img.id);
    if (delErr) {
      setError('מחיקת התמונה נכשלה — נסה שוב');
      return;
    }
    setSelected(0);
    router.refresh();
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 overflow-hidden shadow-xl shadow-black/[0.03]">
      {/* Main image */}
      <div className="relative h-56 md:h-80 bg-brand-beige/50">
        {current ? (
          <Image
            src={current.url}
            alt={propertyName}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 66vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-brand-sand">
            <Building2 size={48} strokeWidth={1.2} />
            <span className="text-xs text-brand-gray-light">אין תמונות עדיין — הוסף תמונה ראשונה</span>
          </div>
        )}
      </div>

      {/* Thumbnails + upload */}
      <div className="p-3 md:p-4 flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {gallery.map((img, i) => (
          <div key={img.id} className="relative shrink-0 group">
            <button
              onClick={() => setSelected(i)}
              className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                i === selected ? 'border-gold shadow-lg shadow-gold/20' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
              aria-label={`תמונה ${i + 1}`}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
            {img.id !== 'cover' && (
              <button
                onClick={() => removeImage(img)}
                className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-white shadow-md border border-gray-200 hidden group-hover:flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                title="מחק תמונה"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-brand-sand/60 hover:border-gold hover:bg-gold/5 flex flex-col items-center justify-center gap-0.5 text-brand-gray-light hover:text-gold-deep transition-all disabled:opacity-50"
          title="הוסף תמונות"
          aria-label="הוסף תמונות"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          <span className="text-[9px] font-semibold">{uploading ? 'מעלה…' : 'הוסף'}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {error && (
        <p role="alert" className="mx-4 mb-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}
    </div>
  );
}
