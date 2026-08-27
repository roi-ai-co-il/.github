'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building2, Search, MapPin, BedDouble, Ruler, Plus } from 'lucide-react';
import { ILS } from '@/lib/format';
import { PROPERTY_TYPES } from '@/lib/domain';
import { StatusBadge, EmptyState, GoldDivider } from '@/components/ui';

type PropertyRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  property_type: string;
  rooms: number | null;
  area_sqm: number | null;
  status: string;
  current_value: number | null;
  cover_image_url: string | null;
  leases: { monthly_rent: number; end_date: string; status: string }[];
};

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'rented', label: 'מושכרים' },
  { key: 'vacant', label: 'פנויים' },
  { key: 'renovation', label: 'בשיפוץ' },
  { key: 'for_sale', label: 'למכירה' },
];

export default function PropertiesGrid({ properties }: { properties: PropertyRow[] }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim();
    return properties.filter((p) => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (q && !`${p.name} ${p.address} ${p.city}`.includes(q)) return false;
      return true;
    });
  }, [properties, filter, search]);

  return (
    <div className="space-y-5 md:space-y-6">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-brand-brown">הנכסים שלי</h1>
          <p className="text-xs md:text-sm text-brand-gray-light mt-1">{properties.length} נכסים בתיק</p>
        </div>
        <Link
          href="/properties/new"
          className="flex items-center gap-1.5 px-4 md:px-5 py-2.5 bg-gold hover:bg-gold-deep text-ink font-semibold text-xs md:text-sm rounded-xl transition-all duration-300 shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30 shrink-0"
        >
          <Plus size={15} />
          <span>נכס חדש</span>
        </Link>
      </div>

      <GoldDivider />

      {/* ── Search + filters ───────────────────────────── */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gray-light pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, כתובת או עיר…"
            aria-label="חיפוש נכס"
            className="w-full bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl pr-11 pl-4 py-3 text-sm outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold/30 transition-all shadow-sm placeholder:text-brand-gray-light/60"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 ${
                filter === f.key
                  ? 'bg-brand-dark text-on-brand-dark shadow-md'
                  : 'bg-white/60 text-brand-gray hover:bg-white border border-white/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 shadow-xl shadow-black/[0.03]">
          <EmptyState icon={Building2} text={search || filter !== 'all' ? 'לא נמצאו נכסים תואמים' : 'אין נכסים עדיין — הוסף את הנכס הראשון'} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 ios-stagger">
          {filtered.map((p) => {
            const activeLease = p.leases.find((l) => l.status === 'active');
            return (
              <Link
                key={p.id}
                href={`/properties/${p.id}`}
                className="ios-press group bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 overflow-hidden shadow-xl shadow-black/[0.03] hover:shadow-2xl hover:shadow-gold/15 hover:border-gold/30 hover:-translate-y-0.5 transition-all duration-200"
              >
                {/* Cover */}
                <div className="relative h-44 bg-brand-beige/50 overflow-hidden">
                  {p.cover_image_url ? (
                    <Image
                      src={p.cover_image_url}
                      alt={p.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Building2 size={44} className="text-brand-sand" strokeWidth={1.2} />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
                  <div className="absolute top-3 right-3">
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="absolute bottom-2.5 right-3.5 left-3.5 flex items-center justify-between gap-2">
                    <span className="text-white text-xs font-semibold flex items-center gap-1 drop-shadow">
                      <MapPin size={12} />
                      {p.city}
                    </span>
                    <span className="text-white/90 text-[10px] font-medium bg-white/15 backdrop-blur-md rounded-full px-2.5 py-1">
                      {PROPERTY_TYPES[p.property_type] ?? p.property_type}
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="p-4">
                  <h3 className="font-bold text-brand-brown truncate">{p.name}</h3>
                  <p className="text-xs text-brand-gray-light mt-0.5 truncate">{p.address}</p>

                  <div className="flex items-center gap-3 mt-3 text-xs text-brand-gray-light">
                    {p.rooms != null && (
                      <span className="flex items-center gap-1"><BedDouble size={13} />{p.rooms} חד׳</span>
                    )}
                    {p.area_sqm != null && (
                      <span className="flex items-center gap-1"><Ruler size={13} />{p.area_sqm} מ״ר</span>
                    )}
                  </div>

                  <div className="flex items-end justify-between mt-3 pt-3 border-t border-gold/10">
                    <div>
                      <p className="text-[10px] text-brand-gray-light">שווי מוערך</p>
                      <p className="text-sm font-bold text-brand-brown whitespace-nowrap">{p.current_value != null ? ILS(p.current_value) : '—'}</p>
                    </div>
                    {activeLease && (
                      <div className="text-left">
                        <p className="text-[10px] text-brand-gray-light">שכירות</p>
                        <p className="text-sm font-bold text-gold-deep whitespace-nowrap">{ILS(activeLease.monthly_rent)}<span className="text-[10px] font-medium text-brand-gray-light"> / חודש</span></p>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
