'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building2, Search, BedDouble, Ruler, Plus, X } from 'lucide-react';
import { ILS } from '@/lib/format';
import { PROPERTY_TYPES } from '@/lib/domain';
import { StatusBadge, EmptyState } from '@/components/ui';
import ContactButtons from '@/components/ContactButtons';

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
  asking_rent: number | null;
  cover_image_url: string | null;
  leases: { monthly_rent: number; end_date: string; status: string; tenant: { full_name: string; phone: string | null } | null }[];
};

const FILTERS = [
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
    <div className="space-y-4">
      {/* ── Large title ─────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">נכסים</h1>
          <p className="text-[13px] text-label-tertiary mt-0.5">{properties.length} נכסים בתיק</p>
        </div>
        <Link
          href="/properties/new"
          className="press hidden md:inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-accent text-white text-[14px] font-semibold shrink-0"
        >
          <Plus size={15} strokeWidth={2.5} />
          <span>נכס חדש</span>
        </Link>
      </div>

      {/* ── Search field (iOS style: filled, rounded, inline clear) ──── */}
      <div className="relative">
        <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-label-tertiary pointer-events-none" strokeWidth={2.2} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, כתובת או עיר"
          aria-label="חיפוש נכס"
          className="w-full bg-surface-sunken rounded-xl pr-10 pl-10 py-2.5 text-[15px] text-label placeholder:text-label-tertiary outline-none focus:ring-2 focus:ring-accent/30 [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="נקה חיפוש"
            className="press absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-label-tertiary/60 text-canvas flex items-center justify-center"
          >
            <X size={12} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* ── Filter chips ────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`press shrink-0 px-3.5 py-1.5 rounded-full text-[14px] font-medium ${
              filter === f.key
                ? 'bg-accent text-white'
                : 'bg-surface-sunken text-label-secondary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Grid ────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-separator">
          <EmptyState
            icon={Building2}
            text={search || filter !== 'all' ? 'לא נמצאו נכסים תואמים' : 'אין נכסים עדיין — הוסף את הנכס הראשון'}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {filtered.map((p) => {
            const activeLease = p.leases.find((l) => l.status === 'active');
            const tenantPhone = activeLease?.tenant?.phone ?? null;
            return (
              <div key={p.id} className="bg-surface rounded-2xl border border-separator overflow-hidden">
              <Link
                href={`/properties/${p.id}`}
                className="press group block"
              >
                <div className="relative aspect-[16/10] bg-surface-sunken overflow-hidden">
                  {p.cover_image_url ? (
                    <Image
                      src={p.cover_image_url}
                      alt={p.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Building2 size={38} className="text-label-tertiary" strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="absolute top-2.5 right-2.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-canvas/90 backdrop-blur-md text-label">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        p.status === 'rented' ? 'bg-success'
                        : p.status === 'vacant' ? 'bg-warning'
                        : p.status === 'renovation' ? 'bg-info' : 'bg-accent'
                      }`} />
                      {PROPERTY_TYPES[p.property_type] ?? p.property_type}
                    </span>
                  </div>
                </div>

                <div className="p-3.5">
                  <h3 className="font-semibold text-[16px] text-label truncate tracking-tight">{p.name}</h3>
                  <p className="text-[13px] text-label-secondary mt-0.5 truncate">{p.address}, {p.city}</p>

                  <div className="flex items-center gap-3 mt-2.5 text-[13px] text-label-tertiary">
                    {p.rooms != null && (
                      <span className="flex items-center gap-1"><BedDouble size={14} strokeWidth={2} />{p.rooms} חד׳</span>
                    )}
                    {p.area_sqm != null && (
                      <span className="flex items-center gap-1"><Ruler size={14} strokeWidth={2} />{p.area_sqm} מ״ר</span>
                    )}
                  </div>

                  <div className="flex items-end justify-between gap-2 mt-3 pt-3 border-t border-separator">
                    <div>
                      <p className="text-[11px] text-label-tertiary">שווי</p>
                      <p className="text-[15px] font-semibold text-label whitespace-nowrap">
                        {p.current_value != null ? ILS(p.current_value) : '—'}
                      </p>
                    </div>
                    {activeLease ? (
                      <div className="text-left">
                        <p className="text-[11px] text-label-tertiary">שכירות</p>
                        <p className="text-[15px] font-semibold text-accent whitespace-nowrap">
                          {ILS(activeLease.monthly_rent)}
                        </p>
                      </div>
                    ) : p.asking_rent != null ? (
                      <div className="text-left">
                        <p className="text-[11px] text-label-tertiary">מבוקש</p>
                        <p className="text-[15px] font-semibold text-warning whitespace-nowrap">
                          {ILS(p.asking_rent)}
                        </p>
                      </div>
                    ) : (
                      <StatusBadge status={p.status} />
                    )}
                  </div>
                </div>
              </Link>
              {tenantPhone && (
                <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-t border-separator bg-surface-sunken/50">
                  <span className="text-[12px] text-label-secondary truncate">{activeLease?.tenant?.full_name}</span>
                  <ContactButtons phone={tenantPhone} name={activeLease?.tenant?.full_name} compact />
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
